---
name: l00prite-cli-os-internals
description: >
  Scope: l00prite repo development. Load this before extending the Go runtime in cli-os/ —
  the gateway (internal/gateway, internal/gateway/adapters), the run engine (internal/engine),
  or the packages they depend on (oai, policy, config, security, state, ledger, memory, apierr,
  util, server). Triggers: adding a provider adapter or routing profile; touching Pick/selectAuto,
  prompt-cache markers in anthropic.go/inject.go, CostOf/normUsage/UsageMap, the engine's
  Toolbox/tool jail, run boundaries, approvals, or dual persistence (SQLite + target-repo
  .l00prite/); questions like "where does a chat completion actually go", "why did auto:cheap
  pick this model", "why didn't the cache hit", "how do I add a new run boundary or engine
  tool". Delivers a deep map of function-level request/run flow plus "where to add X" recipes.
---

# l00prite-cli-os-internals

**Scope: l00prite repo development.** This skill is about the Go runtime that lives at
`cli-os/` inside the l00prite repo itself — not about running the compiled `l00prite` binary in
your own project. If you are operating (not extending) the binary — install, `l00prite serve`,
setup wizard, providers/repos/runs over curl, the dashboard — load **l00prite-run-and-operate**
instead. This skill is for the session that is about to read or change `cli-os/internal/**` Go
source.

All facts below were re-verified against the source on 2026-07-06 (repo tip `d4c6518`, branch
`claude/beautiful-gauss-bxlzbs`) unless marked otherwise. Counts, test names, and manifest values
are volatile — see **Provenance and maintenance** at the end for one-line re-check commands.

## When NOT to use this

| You are trying to... | Load instead |
|---|---|
| Operate the compiled binary in your own project (install, serve, wizard, tokens, providers, repos, `/v1/runs*` over curl, dashboard) | `l00prite-run-and-operate` |
| Understand *why* a design decision was made (two modes, byte-parity, self-modification guard, cooperative lock/lease as a concept) rather than *how the code implements it* | `l00prite-architecture-contract` |
| Catalog every config axis (config.json fields, env vars, RunConfig knobs, vendors.json) rather than the code paths that read them | `l00prite-config-and-flags` (Part B for repo-dev) |
| Build the Dashboard Runs UI against the `/v1/runs*` API this skill maps | `l00prite-runs-view-campaign` |
| Chase a validator/doctor/go-test failure symptom to a fix | `l00prite-debugging-playbook` (Part B for cli-os/engine internals) |
| Get the repo building/testing from a fresh clone | `l00prite-build-and-env` |
| Learn the general theory behind prompt caching, lock/lease, or event-driven agents (not this repo's specific code) | `agent-loop-domain-reference` |
| Find the history of a specific bug/incident in this code (PR #24 gate bypasses, the planner cache-miss fix, etc.) | `l00prite-failure-archaeology` |
| Understand Execution Mode from the *operator's* seat (arming semantics, boundary resume, denylist behavior) rather than the engine's Go implementation | `l00prite-execution-mode-ops` |
| Decide what counts as evidence / how to add a Go test properly | `l00prite-validation-and-qa` (Part B) |

## 1. Package map

One line each, `cli-os/internal/` unless noted (verified via `find internal -maxdepth 1 -type d`
and each package's doc comment):

| Package | One-line role |
|---|---|
| `gateway` | The OpenAI-Chat-Completions-compatible API surface: ingress, routing, memory injection, metering, provider adapters live under it (`gateway/adapters`). |
| `gateway/adapters` | Per-provider manifests (embedded JSON) + translation code: `anthropic.go` (native `/v1/messages`), `openaicompat.go` (passthrough), `mock.go` (no-network test adapter), `registry.go` (the `Adapter` interfaces + manifest loader). |
| `oai` | OpenAI-shape helpers: the `Usage` struct (disjoint prompt/completion/cache-read/cache-write counters), `UsageMap`, chunk/response builders. |
| `engine` | The L00prite OS run engine: mechanically embodies `execute-loop.md` — pre-flight, `StartRun` confirmation, the iteration loop, the nine run boundaries, the tool jail, approvals, dual persistence. Deliberately never imports `gateway`. |
| `policy` | The Policy Enforcement Point (PEP): dollar-denominated budget reserve/commit/refund over the transactional store, per project per UTC day. |
| `server` | HTTP route registration (`Handler`) and process bootstrap (`Start` — DB open, config load, engine wiring, `ReconcileOrphans` at boot). |
| `config` | Runtime config: defaults → `$LOOPRITE_HOME/config.json` → env, deep-merged; "no insecure defaults" enforced at startup. |
| `security` | Provider-key vault (AES-256-GCM at rest) + opaque gateway tokens (`l00p_<id>_<secret>`, constant-time secret compare). |
| `state` | The SQLite (WAL, pure-Go `modernc.org/sqlite`, no cgo) transactional store the PEP and engine both persist against. |
| `ledger` | The request ledger: one row per gateway call (routing decision, real cost, memory status, outcome) to SQLite + JSONL. |
| `memory` | Repo Memory (Track 2): answers a query with ranked, token-budgeted blocks from a repo's `.l00prite/` files; returns blocks, never a finished prompt. |
| `apierr` | The typed HTTP error (`*apierr.Error`: status, OpenAI-style `type`, optional `code`, optional routing `Decision`) threaded through routing/upstream. |
| `util` | Cross-cutting helpers: `NowISO()`/`ISOFromTime` (millisecond ISO, string-comparable), `RID` (random ids), token-char estimation. |
| `public` | Embedded static assets: `dashboard.html`, `setup.html`, `embed.go`. |
| `cmd/l00prite` | The CLI entrypoint (`main.go`) — `init`/`serve`/`version` etc. |

## 2. Gateway request flow (function names)

Entry point: `App.HandleChatCompletion` in `internal/gateway/ingress.go`, `POST /v1/chat/completions`:

1. **Auth** — `principalFrom(app, r)` → `security.VerifyToken` on the Bearer token →
   `security.Principal{TokenID, Project, Repo}`. Missing/invalid → 401 before anything else runs.
2. **Body/repo/header parsing** — JSON body decode, `x-l00prite-repo` header vs the token's own
   repo scope (403 on mismatch), repo lookup by id (404 if unregistered, 403 if wrong project).
3. **Four paths, same underlying machinery** (`ingress.go`):
   - **Dry-run** (`x-l00prite-dry-run` header): `Pick(...)` only — no reservation, no upstream
     call, no ledger append except on error.
   - **Bridge** (`IsBridgeArmed(r.Header, cfg)`): `RunBridge` (`bridge.go`) — the bounded
     cross-provider delegation loop.
   - **Streaming** (non-bridge, `stream:true`): inline in `ingress.go` —
     `Pick` → `memory.Query`/`InjectMemory` → `pep.Reserve` → `streamResponse` (SSE) → `CostOf` →
     `pep.Commit`.
   - **Default** (non-bridge, non-stream): one call to `runTurn` (`turn.go`).
4. **`runTurn`** (`turn.go`) is the internal "one completion" primitive, with NO HTTP concerns:
   `Pick` (route) → `memory.Query`/`InjectMemory` → `ReservationCeiling`/`pep.Reserve` (pre-flight
   budget) → `callNonStream` (`upstream.go`, retry-aware) → `CostOf` (`meter.go`) → `pep.Commit` →
   `ledger.Append`. Both the top-level ingress path and a delegated bridge hop call this same
   function, so a sub-call gets identical money/ledger handling as a top-level request.
5. **`callNonStream`/`streamResponse`** (`upstream.go`) call the resolved `adapters.Adapter`
   (`BuildRequest`/`URL`/`Headers`/`ParseFull`/`NewStream`) through `providerFetch`, and flip the
   circuit breaker via `MarkFailure`/`MarkSuccess` (`router.go`).
6. **`EngineCaller.Turn`** (`enginecaller.go`) is the parallel entry point for autonomous runs — it
   calls the *same* `runTurn`/`RunBridge` functions, so PEP reservation, metering, and ledgering
   apply identically to engine-driven calls with no bypass path.

`App` (`turn.go`) is the per-server context: `DB *sql.DB`, `Cfg config.Config`,
`Aliases map[string]string`, `StartedAt time.Time`, `Engine *engine.Engine` (nil in tests that
don't exercise runs).

## 3. Routing

`Pick` in `internal/gateway/router.go` is first-match-wins over these rules:

1. **`x-l00prite-route` header pin** (`splitTarget`) — operator intent; an unregistered provider
   is a clear 400 error (the ONLY rule that errors cleanly on a bad provider name).
2. **`provider/model` in the `model` field** — only counted as a pin when the provider segment is
   itself a registered, enabled provider (`router.go`: `if mp, mm, ok := splitTarget(wanted); ok
   && enabled[mp]`).
3. **Alias map** (`cfg.Aliases`).
4. **Bare model id** owned by a registered provider's manifest (`adapters.ModelsFor`).
5. **Default provider** (+ requested model or its own first enabled model), honoring the circuit
   breaker and the operator's per-model disable list (`ProviderInfo.serves`).
6. **Fallback**: first enabled, non-tripped provider that can serve the model.

**TRAP** — rule 2 (`provider/model` pin) is silently swallowed if the named provider isn't
enabled: a typo'd or disabled prefix doesn't error, it just falls through to alias/bare/default,
which can route somewhere confusing instead of erroring "unknown provider" the way rule 1 does.
This asymmetry is real code today, not a bug fixed since — verify with `router.go`'s rule-2 `if`
before assuming it errors.

**`auto` / `auto:<profile>`** is intercepted *before* rule 1, inside `Pick`, but only when
`len(cfg.Routing.Profiles) > 0` (`router.go`) — a config that loads with an empty/nil `Profiles`
map makes `auto:*` silently unroutable-as-literal instead of erroring about auto being disabled.
Interception hands off to `selectAuto` (`routerauto.go`):

- `resolveProfile` looks up `config.Routing.Profiles[name]` case-insensitively, falling back to
  `AutoDefaultProfile` (default `"balanced"`), then hardcoded `"balanced"`.
- `config.Profile` (`internal/config/config.go`): `Preference` (`cost|quality|balanced`),
  `Require []string` (capability names), `RankMap string` (a named `roleRanks` map),
  `Providers []string` (non-empty restricts candidates — a rejection reason in
  `filterByCapability`, not a silent drop).
- Built-in profiles (`config.defaults()`): `cheap` (cost), `quality` (quality),
  `balanced` (balanced), `plan` (quality, `RankMap:"plan"`), `code` (balanced,
  `Require:["tools"]`, `RankMap:"code"`), `review` (quality, `RankMap:"review"`),
  `summarize` (cost).
- `filterDisabledCandidates` drops operator-disabled models first; `filterByCapability`
  **fail-closed** rejects on missing `tools`/`vision`/`streaming_usage`/profile `Require`/
  `Providers`/context/`max_output` (`capStrictTrue` for everything except `streaming_usage`,
  which uses `capTruthy` because the manifest may declare it as the truthy non-bool string
  `"opt-in"` — an asymmetry easy to miss when adding a new capability check).
- `scoreCandidates` sorts by `PriceTier` first (0 priced+confident, 1 priced+unconfirmed,
  2 unpriced), then blended cost / quality rank / a Borda-style blend for `balanced`.
  `auto:cheap` additionally excludes tier-2 entirely (400 `no_priced_model`) so an unknown price
  can never masquerade as cheapest.
- `routing.RoleRanks map[string]map[string]int` ("role-map-name" → "provider/model" → 0-100)
  ships empty by default. A profile's `RankMap` selects one of these maps and **merges it over**
  `QualityRanks` (role-map entries win, everything else falls back to the global quality ranks) —
  `selectAuto` in `routerauto.go` builds this `merged` map inline; a role map with only two entries
  silently defers to the global ranking for every other model.
- The engine (`internal/engine/roles.go`) never names a provider: `PlanForObjective` maps an
  **objective** (`balanced`/`quality`/`cost`/`speed`/`privacy`) to a `TeamPlan{Profiles: map[role]profileName}`,
  and `ModelForRole` renders the request's `model` field as `"auto:<profile>"`.

## 4. Prompt caching (anthropic.go + inject.go)

Two cooperating pieces — read both together, they only make sense as a pair.

**`inject.go` `InjectMemory`** prepends the wrapped, untrusted memory digest as a leading system
message, then tags it through a top-level, wire-invisible hint channel:

```go
hints := copyMap(asMap(out["l00prite"]))
hints["volatile_system"] = contextMsg["content"]
out["l00prite"] = hints
```

This hint never reaches a provider: `openaiCompatAdapter.BuildRequest` deletes the `l00prite` key;
`anthropicAdapter.BuildRequest` rebuilds its body field-by-field and never forwards the map.
**Any new `NetworkAdapter` that does a naive passthrough will leak `volatile_system` onto the wire
— strip or rebuild, there is no type-level enforcement of this.**

**`anthropic.go` `BuildRequest`** reads
`volatileSystem := asStr(asMap(req["l00prite"])["volatile_system"])`, collects every inbound
system message into `sysBlocks`, then branches:

- `len(sysBlocks)==0` → nothing.
- **explicit client `cache_control`** on any system block → forwarded verbatim, no auto markers
  (client placement always wins; the API caps 4 breakpoints per request).
- **`autoCache`** (`promptCacheable(model) && !explicitSystem && !hasCacheControl(messages)`) —
  the stable/volatile split: every `sysBlocks` text that is byte-equal to `volatileSystem` goes to
  `volatileParts`; everything else (the real protocol/system content) goes to `stableParts`.
  `stable` renders **first** and carries the only `cache_control:{type:"ephemeral"}` marker
  (gated on `util.EstimateTokensFromChars(len(stable)+toolsJSONLen) >= promptCacheMinTokens(model)`
  — below the model's real minimum the API silently ignores a marker, so a below-minimum estimate
  is a harmless no-op, never a suppressed live one). `volatile` renders **last** and is **never**
  marked. Four resulting wire shapes depending on which side is empty/marked: `[stableBlock]`,
  plain-string `stable`, plain-string `volatile`, or `[stableBlock, {volatile}]`.
- else (not cache-capable) → flat string join, the pre-caching wire shape.

A **second breakpoint** lands on the last content block of the last message, only when `autoCache`
— it bills the previous call's whole prefix as a cache read on multi-turn/tool-loop requests,
writing only the new tail.

Why the split matters: `cache_control` is a **prefix match**. If the volatile digest sat ahead of
(or merged into) the stable text, the prefix would differ every call and the cache would never
hit — that is the exact planner-cache-miss bug this split was built to fix.

**The trap**: `autoCache` matches volatile content by **exact string equality**
(`t == volatileSystem` in `anthropic.go`). If any future code path mutates or re-wraps the digest
text between `InjectMemory` and `BuildRequest` (whitespace trim, markdown pass, truncation), the
equality check silently fails and the "volatile" content folds into `stableParts` instead —
defeating the whole design with no error surfaced. There is no test or assertion that catches this
short of a byte-identity check across the two functions.

`promptCacheable(model)` and `promptCacheMinTokens(model)` both read
`CapabilitiesFor("anthropic", model)` — an unknown model gets `{}`, so `promptCacheable` returns
false (fail-closed: a Claude-compatible endpoint serving a non-Claude id never gets speculative
cache markers).

## 5. Metering and cost

`internal/oai/oai.go` `Usage` keeps **four disjoint** counters: `PromptTokens`,
`CompletionTokens`, `CacheReadTokens`, `CacheWriteTokens` (the Anthropic native convention, where
these never overlap).

`openaicompat.go` `normUsage` converts OpenAI-shaped usage (whose `prompt_tokens` **includes** the
cached portion) into the disjoint internal form:
`CacheReadTokens = cached_tokens` (clamped to `PromptTokens`), then
`PromptTokens -= CacheReadTokens` — so `CostOf` can never double-price a cached token.

`oai.UsageMap(u)` reconstructs the OpenAI-facing shape for client responses:
`prompt := PromptTokens + CacheReadTokens + CacheWriteTokens` (full input size), plus
`prompt_tokens_details.cached_tokens` only when `CacheReadTokens != 0`. Cache *writes* fold into
`prompt_tokens` with no dedicated OpenAI-facing field (they are real tokens the provider processed).

`meter.go` `CostOf(providerName, model, usage)`:

```go
usd := (PromptTokens*Input + CompletionTokens*Output +
        CacheReadTokens*CacheRead + CacheWriteTokens*CacheWrite) / 1e6
```

Returns `Cost{USD, Estimated, Priced, Unconfirmed}`. An unpriced or unconfirmed-price model
(`PriceFor == nil` or `!Confident`) yields `Unconfirmed:true`, and the figure is never presented
as authoritative — the ledger's `cost_unconfirmed` flag and the `x-l00prite-cost-unconfirmed`
response header both carry it.

`ReservationCeiling(providerName, model, req)` is a **separate, deliberately conservative**
pre-flight estimate — a rough char-based token count times the output rate, floored at
`unknownPriceCeilingUSD = 0.25` when the price is unknown — never the billed amount. `CostOf`
always uses the provider's *reported* usage from `ParseFull`/the stream's terminal event, never
this estimate. Golden rule, stated in `meter.go`'s header comment: trust provider-reported usage
over any local estimate.

## 6. Engine (`internal/engine/`)

Design doc: `cli-os/docs/os-architecture.md` §2 (as of 2026-07-06; date-stamped because docs rot —
verify section numbers with `grep -n '^### ' cli-os/docs/os-architecture.md` if this reads stale).
The engine deliberately never imports `gateway`; every model call crosses the `ModelCaller` seam
(`types.go`) implemented by `gateway.EngineCaller` — the engine names roles/objectives, never
providers, by construction.

**Run state machine** (`types.go`) — 8 statuses: `draft → ready → running ↔ waiting_approval →
done|stopped`; `blocked` (a foreign lock at pre-flight) and `interrupted` (crash, reconciled at
boot) are both re-enterable only via a fresh pre-flight.

**Pre-flight** (`preflight.go`, `Engine.BuildPreflight`) mechanically performs execute-loop.md's
mode-entry steps 1-5: read `.l00prite/` (scaffolding it first via `Files.Scaffold` if absent, never
overwriting), check the lock **before any write** (`LockAvailability` — a foreign active unexpired
lease is an immediate blocker, nothing is written), stale-run recovery + schema migration under the
engine's *own* short lease (`EnsureExecutionBlock`, `DisarmHeartbeat`, `SetStateRun`, all released
before the human is asked to confirm), then assemble the full `Preflight` display: DoD text,
planned units (`plannedUnitsFrom` — open todos + every pending event named individually), the
team (`PlanForObjective` → `ModelForRole` → `Caller.PreviewRoute`, dry-run only, no spend — an
unroutable role is a pre-flight *blocker*, not a silent downgrade), the denylist
(`ParseDenylist(snap.Constraints)`), and git readiness (`checkGitReady` — no commits or a dirty
worktree outside `.l00prite/` blocks Start).

**`StartRun`** (`engine.go`) is the confirmation gate: requires `confirm == "EXECUTE"` (exact
string) against a run whose status is `ready` with a non-empty `PreflightJSON` — a persisted flag
can never substitute. It re-checks `ActiveRunForRepo` (one active run per repo — a lookup failure
fails closed as an error, never "no active run"), checks the lock again, creates/switches to the
run branch (`EnsureRunBranch`), arms the repo files (`EnsureExecutionBlock` → `ArmHeartbeat` →
`WriteHeartbeat`; `SetStateRun` → `WriteState`), then `Store.MarkStarted` (an atomic
`ready → running` CAS keyed on a fresh, non-empty preflight — nothing else may effect this
transition). Any failure after arming rolls the repo files back to disarmed before returning, so a
rejected start never leaves the repo half-armed.

**`loop`/`iterate`** (`engine.go`) — one iteration: check `ctx.Done()` (stop_signal) and the
iteration budget first; refresh the lease (`f.RefreshLock`) — a foreign lease appearing here is
`lock_lease_conflict`, writing nothing; then `iterate`: **plan** (`BuildPlannerReq` →
`ParseUnitSelection`, `roles.go`) → **execute** (`runCoder`, the bounded coder tool-loop,
`exec.go`) → **verify** (`runVerification` against the command allowlist — the *first* allowlisted
command is the done-check convention) → **review** (independent reviewer role, only for
objectives with `plan.Review == true`) → **commit** (`CommitUnit`, a local commit on the run
branch; a commit *failure*, as opposed to "nothing to commit", is itself a `human_review_gate`
stop). `persistIteration` (`exec.go`) is "persist before anything else": engine-store counters,
repo heartbeat tick (`TickHeartbeat`), and a ledger append — a failure here stops the run rather
than advancing state nothing else can see. No-progress stall (`IterationsSinceProgress >=
NoProgressThreshold`) escalates to `human_review_gate`, not a dedicated boundary.

**The nine `BoundaryXxx` constants** (`types.go`, verbatim from execute-loop.md, the vocabulary is
`run_boundaries` — never `stop_conditions`, a different heartbeat field):
`definition_of_done_met`, `iteration_limit_reached`, `human_review_gate`,
`destructive_operation_required`, `ambiguous_requirements`, `unfixable_failing_tests`,
`missing_secrets_or_credentials`, `lock_lease_conflict`, `stop_signal`.

**Toolbox jail** (`tools.go`) — the ONLY place the engine touches the filesystem/shell. Layered
write policy on every `write_file`:
1. `resolvePath` — rejects empty/absolute/escaping paths; also fails closed if the deepest
   *existing* ancestor resolves (symlinks included, via `filepath.EvalSymlinks`) outside `Root`.
2. `protocolProtected(rel)` — a hard-deny, not gateable even with `approved=true`, for
   `.l00prite/heartbeat.json`, `state.json`, `lock.json`, `constraints.md`, and anything under
   `.l00prite/prompts/`. `constraints.md` is hard-denied here specifically so a run can never edit
   the file that defines its own denylist and then, next iteration, freely edit whatever it just
   unprotected.
3. `MatchDenylist(tb.Denylist, rel)` — a gitignore-style glob match against the Autonomous-Edit
   Denylist parsed from the target repo's `constraints.md`; a hit becomes a `GateRequest{Class:
   GateDestructive}` unless `approved==true`.
4. Otherwise: write inside the repo.

`run_command`/`git_command` gate anything not on the pre-flight `CommandAllowlist` (or, for git,
not one of `status/diff/log/add/commit/show`/a safe bare `branch`). `commandAllowed` honors an
allowlisted command as a **prefix** only when the appended suffix contains none of
`shellChainChars` (`;&|` `` ` `` `$<>\n`) — otherwise an allowlisted `go test ./...` would let a run
smuggle `go test ./... ; rm -rf /` straight to the shell. An *exact* allowlist match is always
honored regardless of metacharacters (a human approved that literal string at pre-flight).
`gitBranchArgsAreSafe` treats only a bare `branch` (list) or `branch <name>` (create) as safe —
any flag at all routes to approval, so a new destructive branch flag is covered without code
changes. `parseArgs` (`helpers.go`) accepts a tool call's `arguments` as either a JSON string or an
already-decoded object, returning `{}` (never nil) on anything unparseable.

**Approvals** (`exec.go` `awaitApproval`) — a gate class configured `PolicyDeny` never even asks.
Otherwise: `CreateApproval` → run status `waiting_approval` → block on a channel until a decision
arrives, the run is cancelled, or `ApprovalTimeoutSec` elapses. **Timeout is a deny** that stops
the run at `destructive_operation_required` (fail-closed, not a retry). `Engine.Decide` checks the
approval belongs to the calling `runID` before deciding it — otherwise a caller could decide an
approval belonging to a different run.

**Dual persistence**: `Store` (`store.go`) owns three SQLite tables — `runs`, `run_events`
(append-only feed, monotonic `seq`, the machine-parseable run log), `run_approvals` — all writes
through `state.Tx` (`BEGIN IMMEDIATE`). `Files` (`l00pfiles.go`) owns the target repo's
`.l00prite/` files: JSON edited surgically (unmarshal → mutate named keys → marshal → atomic
temp-file + rename), `ledger.md`/`failures.md` append-only with errors always returned, never
swallowed. The engine store is the operational/queryable record; the repo's `.l00prite/` files
remain protocol-authoritative.

**Crash recovery**: `Store.ReconcileOrphans` runs at boot (wired in `internal/server/server.go`'s
`Start`, right after `engine.New`) — any run left `running`/`waiting_approval` becomes
`interrupted`. The repo-side half (disarming heartbeat/state, reclaiming the stale lease) happens
separately, at that repo's *next* pre-flight (`preflight.go` steps 3-4), not at boot.

**Lock lifecycle** (`l00pfiles.go`): `LockAvailability` classifies a lock as `free` (nil, or
`unlocked`/`released`) / `stale` (`expired`, or `active` with `expires_at <= now`) / `mine`
(active, unexpired, owned by `(l00prite-os, session)`) / `foreign` (anything else, including an
unrecognized `status` string — fail-closed). `AcquireLock` only proceeds from `free`/`stale`;
`RefreshLock`/`ReleaseLock` both require `ownedByUs`. Note the pre-flight's own recovery path: if
`avail == "mine"` (re-pre-flighting the same run within its own TTL) it calls `RefreshLock`, not
`AcquireLock` — `AcquireLock` correctly refuses to re-acquire a lock its own caller already holds.

## 7. Server/ops surface (summary — operating detail lives in `l00prite-run-and-operate`)

Route registration is a single `switch` in `internal/server/server.go` `Handler(app)` — every
mutating/data endpoint (`/v1/chat/completions`, `/v1/providers*`, `/v1/repos*`, `/v1/runs*`,
`/v1/dashboard/summary`) authenticates identically via the Bearer gateway token
(`principalFrom`/`security.VerifyToken`); `/v1/setup/*` is the deliberate exception, gated instead
by the durable `SetupComplete()` latch. A repo/run is further project-scoped
(`principal.Project` must match the stored project) and, for a repo-scoped token,
`principal.Repo`-scoped to that one repo (`repoRootForToken` in `runs.go` is the pattern to copy
for a new endpoint). The `/v1/runs*` handlers (`runs.go`) only carry the human's
create/preflight/Start/approve/stop decisions to the engine — the confirmation gate itself lives
in `engine.StartRun`, not in the handler.

## 8. "Where to add X" recipes

**New provider adapter.** Implement `adapters.NetworkAdapter` (`BuildRequest`/`URL`/`Headers`/
`ParseFull`/`NewStream`) in a new file under `internal/gateway/adapters/`, register it in
`AdapterFor` (`registry.go`), and add a manifest JSON under `manifests/` (`provider`, `base_url`,
`adapter`, `models[]` with `capabilities`/`price_per_mtok`/`price_confidence`). Capability defaults
must be conservative: an unset capability reads `false` via `CapabilitiesFor`'s `{}` fallback —
never assume a new provider supports caching/vision/tools without a confirmed source. **Strip or
rebuild the `l00prite` top-level request key** before it reaches the wire (see §4's trap) — either
`delete(body, "l00prite")` like `openaiCompatAdapter`, or rebuild the body field-by-field like
`anthropicAdapter`.

**New tool in the engine toolbox.** Add the OpenAI-shaped definition in `Toolbox.Definitions()`
and a case in `Toolbox.Execute` (`tools.go`). Every path argument must go through `resolvePath`
(the jail). Any mutating action must decide, explicitly, whether it is: (a) always safe (like
`read_file`), (b) protocol-hard-denied (extend `protocolProtected` only for genuinely
engine-owned files — this list is deliberately small), (c) denylist-gated (goes through
`MatchDenylist` automatically once it writes a `rel` path), or (d) allowlist/approval-gated (return
a `GateRequest` with the right `Class` when not pre-approved). Add tests in `tools_test.go`
following the existing per-tool table-driven pattern (12 top-level `Test` functions there as of
this writing — verify with the recheck command below).

**New `/v1` endpoint.** Add the route in `server.go`'s `Handler` switch, and a handler that starts
with `principalFrom`/`requireToken` auth and (if repo- or run-scoped) the same project/repo
ownership check as `repoRootForToken`/`ownRun` in `runs.go` — do not hand-roll a new auth check.

**New run boundary.** This is a **protocol change**, not an ordinary code change — a new
`BoundaryXxx` constant must be added to `RunBoundaries` in `types.go`, to the embedded
`heartbeatTemplate` in `l00pfiles.go`, and to the canonical `execute-loop.md` prompt (byte-mirrored
across all 7 locations) — it changes what a human-confirmed pre-flight promises. Route this
through `l00prite-change-control` before writing code; the v1.2 gated batch (see
`.l00prite/todos.md`) is the standing precedent for "protocol-shaped work waiting on maintainer
review, don't start it piecemeal."

**New routing profile.** Built-in profiles live in `config.defaults()` (`internal/config/config.go`);
an operator-defined one is just a `routing.profiles.<name>` entry in `config.json` (same
`Preference`/`Require`/`RankMap`/`Providers` shape) — no code change needed for an operator-only
profile. Only add a new *built-in* default if every deployment should have it.

## Provenance and maintenance

Every fact below is volatile (as of 2026-07-06) and should be re-checked before being relied on in
a design decision.

| Fact stated above | Re-verification command |
|---|---|
| `go build ./...` / `go vet ./...` / `go test ./...` all succeed, no test failures | `cd cli-os && go build ./... && go vet ./... && go test ./...` |
| Engine package test-function counts (helpers 1, l00pfiles 15, preflight 1, roles 16, run_integration 5, store 8, tools 12) | `grep -c "^func Test" cli-os/internal/engine/*_test.go` |
| The 5 named engine integration tests exist and pass (`TestRunReachesDefinitionOfDone`, `TestRunDenylistWriteBlocksOnDeny`, `TestStartRequiresFreshPreflightAndConfirm`, `TestReconcileOrphansAfterCrash`, `TestDecideRejectsCrossRunApproval`) | `cd cli-os && go test ./internal/engine/... -run 'TestRunReachesDefinitionOfDone|TestRunDenylistWriteBlocksOnDeny|TestStartRequiresFreshPreflightAndConfirm|TestReconcileOrphansAfterCrash|TestDecideRejectsCrossRunApproval' -v` |
| `prompt_cache_min_tokens`: 2048 for `claude-fable-5`/`claude-sonnet-5`, 4096 for `claude-opus-4-8`/`claude-haiku-4-5` | `grep -n '"id"\|prompt_cache_min_tokens' cli-os/internal/gateway/adapters/manifests/anthropic.json` |
| Manifest files today: `anthropic.json`, `openai.json`, `zhipu.json` | `ls cli-os/internal/gateway/adapters/manifests/*.json` |
| `/v1/runs*` route list registered in `server.go`'s `Handler` | `grep -n '"/v1/runs' cli-os/internal/server/server.go` |
| SQLite tables (`meta`, `providers`, `provider_models`, `tokens`, `repos`, `caps`, `spend`, `reservations`, `leases`, `ledger`, `audit`, `runs`, `run_events`, `run_approvals`) | `grep -n "CREATE TABLE" cli-os/internal/state/db.go` |
| `engine.New`/`ReconcileOrphans` wiring happens in `server.go`'s `Start`, right after `engine.New` | `grep -n "engine.New\|ReconcileOrphans" cli-os/internal/server/server.go` |
| Nine `BoundaryXxx` constants and the built-in `Objectives`/profile table are unchanged | `grep -n "^const\|BoundaryDone\|ObjectiveBalanced" cli-os/internal/engine/types.go` |
| Go toolchain / module facts (Go 1.24.x, pure-Go sqlite, no root `go.mod`) | `cd cli-os && go version && grep '^go ' go.mod && ls ../go.mod 2>&1` |
