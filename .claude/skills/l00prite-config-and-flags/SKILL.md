---
name: l00prite-config-and-flags
description: >
  Scope: dual — Part A covers any l00prite-managed project (operating the l00prite `cli-os`
  binary: its `config.json` fields and defaults, every `LOOPRITE_*` environment variable,
  provider manifest schema/capabilities, and routing profiles, plus your project's own
  `heartbeat.json`/`state.json`/`lock.json` fields); Part B covers l00prite repo development
  (`vendors.json` branch semantics, config-adjacent template/example byte-parity, and the
  checklist for adding a new config axis to `cli-os`). Load this when: asked what a
  `LOOPRITE_*` env var does or defaults to; a `config.json` value seems to be silently
  ignored (e.g. `"port": 0` or an empty `"host"`); reading or writing `heartbeat.json`'s
  `execution` block, `state.json`'s `execution_active`, or `lock.json`'s fields/status
  values; adding or editing a provider manifest (`anthropic.json`/`openai.json`/`zhipu.json`)
  or a routing profile; setting `RunConfig` fields (`max_iterations`, `gates`,
  `command_allowlist`) via `/v1/runs`; asking what `x-l00prite-route`/`x-l00prite-dry-run`/
  `x-l00prite-bridge`/`x-l00prite-bridge-max-hops` headers do; or contributing a brand-new
  config field to `cli-os`.
---

# l00prite config and flags

## What this skill is for

Every place l00prite reads a setting — a `cli-os` config file, an environment variable, a
provider manifest, a routing profile, a protocol JSON field, or a per-run knob — with its real
default, its fallback behavior when the value is falsy/malformed, and how overrides layer on
top of each other. **Part A** is for anyone *running* the `l00prite` binary (`l00prite serve`)
or working inside a project's `.l00prite/` folder, regardless of which repo they're in. **Part
B** is for a session developing `cli-os`/the protocol itself inside the l00prite repo — adding
a new config field, a new provider manifest, or a new routing profile as a contribution.

## When NOT to use this

| If you actually need... | Use instead |
|---|---|
| The deep package map / request-flow / "where to add X" guide for the Go runtime | `l00prite-cli-os-internals` |
| Symptom → cause triage when a config/routing value behaves unexpectedly | `l00prite-debugging-playbook` |
| Full CLI/API anatomy for running the binary (install, wizard, tokens, repos, `/v1/runs*` curl walkthrough) | `l00prite-run-and-operate` |
| Day-to-day protocol life in a scaffolded project (which prompt to run, lock etiquette, event lifecycle) | `l00prite-loop-operations` |
| The full pre-flight walkthrough, all nine run boundaries, and per-boundary resume procedures | `l00prite-execution-mode-ops` |
| Field-theory background on prompt caching economics, API shapes, or lock/lease theory | `agent-loop-domain-reference` |
| The change-classification table and edit procedure for this repo's own gated/protocol files | `l00prite-change-control` |
| Interpretation guide + shipped scripts for validator/doctor output | `l00prite-diagnostics-and-tooling` |
| Bringing l00prite into a new project, or what `build-loop` scaffolds | `l00prite-adopting` |

---

## Part A — In any l00prite-managed project

Everything below in A1–A5 and A7 describes the compiled `l00prite` `cli-os` binary's own
behavior — it holds wherever you run that binary, whether you built it from a checkout of the
l00prite repo or downloaded a release artifact. A6 describes the `.l00prite/` protocol JSON
files that live in **your project** — if your project's copies differ from what's described
here, **trust your own files**; this skill is a field reference over the canonical shape, not
the authority. All facts were verified against the l00prite repo's `cli-os/` Go source and
`templates/l00prite/` on 2026-07-06; re-verification commands that need a source checkout are
labeled so, with a binary-only alternative given where one exists.

### A1. `cli-os` config file: location, creation, precedence

- Path: `$LOOPRITE_HOME/config.json`. `LOOPRITE_HOME` itself can **only** be set via the
  `LOOPRITE_HOME` environment variable (never via `config.json` — the file's own location
  depends on already knowing `Home`, so it can't configure itself). Default `LOOPRITE_HOME`:
  `$HOME/.l00prite-cli-os` (or `.` + that suffix if `os.UserHomeDir()` fails).
- **Nothing ever creates `config.json` for you.** `l00prite init` only creates the home
  directory, the SQLite db, and the master key — verified by reading `cmd/l00prite/main.go`'s
  `init` branch, which calls `config.EnsureHome` + `security.EnsureMasterKey` + opens the DB and
  never touches `config.json`. If the file is absent, `Load()`'s `os.ReadFile` simply errs and
  every field falls back to the compiled default. Writing `config.json` is entirely optional and
  hand-authored.
- Precedence, later wins: **compiled defaults → `config.json` → environment variables**, with
  one exception — `LOOPRITE_HOME` itself is env-only (there is nothing before it to override).
  `DBPath`, `MasterKeyPath`, and `LedgerPath` are always derived as `$LOOPRITE_HOME/{cli-os.db,
  master.key, ledger.jsonl}` — there is no field to override them independently.
- Malformed JSON in `config.json` is silently ignored (caught and discarded), not fatal — the
  effective config falls back to defaults for every field the parse would have set.

### A2. Every `config.json` field

Fields not listed in `config.json` (or set to their zero value) keep the compiled default. All
verified from `cli-os/internal/config/config.go`'s `defaults()` and `Load()`.

| `config.json` key | Go field | Type | Default | Falsy-fallback behavior |
|---|---|---|---|---|
| `host` | `Host` | string | `"127.0.0.1"` | Empty string in the file falls back to the default |
| `port` | `Port` | int | `8787` | **`0` falls back to the default `8787`** — a literal `"port": 0` in `config.json` does NOT bind port 0, it silently reverts to 8787 (proven live below) |
| `defaultDailyCapUsd` | `DefaultDailyCapUsd` | float64 | `10` | May be a JSON number or string (`"10"` parses like `Number("10")`); non-finite/negative/unparseable falls back to `10` |
| `defaultMaxTokens` | `DefaultMaxTokens` | int | `4096` | Same string-or-number handling; `0` (or unparseable) falls back to `4096` so a reservation is never unbounded |
| `requestTimeoutMs` | `RequestTimeoutMs` | int | `120000` | Only a value `> 0` overrides |
| `retry.maxAttempts` | `Retry.MaxAttempts` | int | `3` | Field-level: only a present sub-field overrides; absent sub-fields keep their own default |
| `retry.baseMs` | `Retry.BaseMs` | int | `250` | ″ |
| `retry.maxMs` | `Retry.MaxMs` | int | `4000` | ″ |
| `memory.latencyMs` | `Memory.LatencyMs` | int | `150` | Field-level override, same pattern |
| `memory.contextTokens` | `Memory.ContextTokens` | int | `8000` | ″ |
| `memory.maxFileBytes` | `Memory.MaxFileBytes` | int | `262144` | ″ |
| `tls.certPath` + `tls.keyPath` | `TLS` | `*TLS` | `nil` | Only applied when **both** are present and non-empty; env (`LOOPRITE_TLS_CERT`/`LOOPRITE_TLS_KEY`, both required) wins over this block |
| `aliases` | `Aliases` | `map[string]string` | `{}` | A **top-level** `config.json` key — it is a sibling of `routing`, not nested inside it. Present map replaces the default (empty) wholesale |
| `routing.autoDefaultProfile` | `Routing.AutoDefaultProfile` | string | `"balanced"` | Empty string keeps the default |
| `routing.profiles` | `Routing.Profiles` | `map[string]Profile` | 7 built-ins (A5) | Deep-merged **per key** — see A2's deep-merge note |
| `routing.qualityRanks` | `Routing.QualityRanks` | `map[string]int` | 7 built-in entries (A5) | Deep-merged per key (an override entry adds/replaces one `provider/model` rank, others survive) |
| `routing.roleRanks` | `Routing.RoleRanks` | `map[string]map[string]int` | `{}` (ships empty) | Per role-map-name: an override **replaces that role's whole map** (not per-model merged within it); other role maps untouched |
| `routing.bridge.enabled` | `Routing.Bridge.Enabled` | bool | `false` | Deep-merged: an override touching only `enabled` does not reset `maxHops` |
| `routing.bridge.maxHops` | `Routing.Bridge.MaxHops` | int | `3` | ″ |

**The port:0 trap, proven live** (scratch `$LOOPRITE_HOME`, 2026-07-06):

```
$ echo '{"port": 0, "host": ""}' > $LOOPRITE_HOME/config.json
$ l00prite serve
l00prite CLI-OS listening on http://127.0.0.1:8787
```

Both the explicit `0` port and empty-string host fell straight back to the compiled defaults —
confirmed both by this live run and by the existing unit test
`TestFalsyPortHostFallBack` (`cli-os/internal/config/config_test.go`).

**Deep-merge, proven live** (unit test, not re-derived here):
`TestBridgeConfigDeepMerge` writes `{"routing":{"bridge":{"enabled":true}}}` and asserts
`maxHops` is still `3` — a minimal bridge override does not wipe the default hop cap. This is
the general pattern for every nested block above: only present leaf fields override; everything
else in that block keeps its default (pointer-typed override structs are how `config.go`
implements this — `*bridgeOverride`, `*retryOverride`, etc., all with pointer leaf fields).

### A3. Environment variables — the complete catalog

Every `os.Getenv`/`os.LookupEnv` call in `cli-os` (excluding `_test.go` files), verified by
grepping the whole tree — there are exactly 11 distinct variable names, all `LOOPRITE_`-prefixed,
read from exactly two files (`internal/config/config.go` and `internal/security/vault.go`, which
both read `LOOPRITE_MASTER_KEY`):

| Variable | Effect | Default when unset | In `.env.example`? |
|---|---|---|---|
| `LOOPRITE_HOME` | Data directory (db, master key, config.json, ledger) | `$HOME/.l00prite-cli-os` | Yes (commented) |
| `LOOPRITE_HOST` | Bind host, overrides `config.json`'s `host` | `127.0.0.1` | Yes (commented) |
| `LOOPRITE_PORT` | Bind port; a non-numeric or `0` value is ignored | `8787` | Yes (commented) |
| `LOOPRITE_DEFAULT_DAILY_CAP` | Default per-project daily USD spend cap when a project has none set | `10` | Yes (commented) |
| `LOOPRITE_DEFAULT_MAX_TOKENS` | Default max output tokens for reservations when a request doesn't specify one | `4096` | **No — omitted** |
| `LOOPRITE_MASTER_KEY` | Vault master key (base64 of 32 bytes); if set-but-invalid, boot is FATAL (does not fall back to the keyfile) | auto-generated keyfile at `$LOOPRITE_HOME/master.key` (0600) | Yes (commented) |
| `LOOPRITE_TLS_CERT` + `LOOPRITE_TLS_KEY` | Public TLS pair; both required together, wins over a `config.json` `tls` block | none (no TLS) | Yes (commented) |
| `LOOPRITE_ALLOW_INSECURE_BIND` | Set to `1` to allow binding a non-loopback host without TLS | unset (non-loopback bind without TLS is fatal) | Yes (commented) |
| `LOOPRITE_BRIDGE_ENABLED` | Per-process override of `routing.bridge.enabled`; only the literal string `"1"` is truthy | `config.json`/compiled default (`false`) | **No — omitted** |
| `LOOPRITE_BRIDGE_MAX_HOPS` | Per-process override of `routing.bridge.maxHops`; must parse as a non-negative finite number | `config.json`/compiled default (`3`) | **No — omitted** |

`LOOPRITE_ALLOW_INSECURE_BIND`, proven live: starting `l00prite serve` with
`LOOPRITE_HOST=0.0.0.0` and no TLS/insecure flag refuses to start:

```
$ LOOPRITE_HOST=0.0.0.0 l00prite serve
Refusing to start — fix these first:
  • Refusing to bind non-loopback host "0.0.0.0" without TLS. Either set LOOPRITE_TLS_CERT +
    LOOPRITE_TLS_KEY, bind to 127.0.0.1, or (only behind a trusted reverse proxy / private
    network) set LOOPRITE_ALLOW_INSECURE_BIND=1.
```
exit code `1`. This is `BindProblems`/`ValidateForServe` in `config.go`, independent of whether
the vault is initialized.

Three variables — `LOOPRITE_DEFAULT_MAX_TOKENS`, `LOOPRITE_BRIDGE_ENABLED`,
`LOOPRITE_BRIDGE_MAX_HOPS` — are real, load-bearing, and currently **absent from
`.env.example`** (verified: `cli-os/.env.example`, 25 lines, one root-level file; no duplicate
elsewhere in the repo). If you're documenting env vars for an operator, don't rely on
`.env.example` alone — it under-documents three of the eleven.

### A4. Provider manifests

Manifests live at `cli-os/internal/gateway/adapters/manifests/{anthropic,openai,zhipu}.json`,
embedded into the binary at build time (`//go:embed manifests/*.json`) — they are not read from
disk at runtime and are not overridable via `config.json` or an env var today.

**Only four manifest-level keys are actually consumed by code** (`registry.go`'s `manifest`
struct): `provider`, `base_url`, `adapter`, `models`. Everything else at the manifest's top
level — `display_name`, `endpoints`, `auth`, `streaming`, `tool_schema`, `notes`, and the whole
`verification` block (`shape`/`shape_source`/`pricing`/`pricing_source`/`pricing_checked`/
`pricing_note`) — is **inert documentation for humans**, silently dropped by `json.Unmarshal`
because the Go struct declares no field for it.

Per model (`modelSpec` struct), the consumed fields are: `id`, `context`, `max_output`,
`capabilities` (an untyped `map[string]any`), `price_per_mtok`, and `price_confidence`. A
per-model `notes`/`price_source`/`price_checked` in the JSON is likewise doc-only and ignored by
code — only `price_confidence`'s literal string `"high"` flips `Price.Confident` to `true`
(anything else, including absence, is treated as unconfirmed).

Capability lookups are **fail-closed**: `CapabilitiesFor` returns an empty map for an unknown
model, so no speculative capability is ever assumed for an unrecognized id.

**Two different truthiness rules for capabilities — verified in `routerauto.go` and
`anthropic.go`:**

| Capability | Check function | Accepts |
|---|---|---|
| `tools`, `vision` | `capStrictTrue` | Only the JSON boolean `true` |
| `streaming_usage` | `capTruthy` | JS-style truthy: boolean `true`, any non-empty string (the OpenAI manifest uses the literal string `"opt-in"`), or any non-zero number |
| `prompt_cache` | raw `== true` (in `promptCacheable`, `anthropic.go`) | Only the JSON boolean `true` — same strictness as `capStrictTrue` but written inline, not through the shared helper |

`price_per_mtok` fields actually read by `PriceFor` (`registry.go`): `input`, `output`,
`cache_read`, and cache-write — preferring `cache_write_5m`, falling back to a generic
`cache_write` key. **`cache_write_1h` is present in `anthropic.json` (e.g. `20.0` for Fable 5)
but is never parsed or read anywhere in the Go source** (verified: no `cache_write_1h` or
`CacheWrite1h` identifier exists in `cli-os`). The gateway's own auto-cache logic
(`anthropic.go`, `BuildRequest`) only ever emits `cache_control: {"type": "ephemeral"}` with no
`ttl` — i.e. it always requests the standard 5-minute breakpoint, never a 1-hour one. But a
**client-supplied** explicit `cache_control` (including one with `ttl: "1h"`) is forwarded
verbatim and wins over the auto path — and in that case `meter.go`'s `CostOf` would still price
every cache-write token at the `cache_write_5m` rate, because that is the only cache-write price
`PriceFor` ever populates. Known limitation, not currently exercised by any built-in code path:
a manually-set 1-hour breakpoint would be under-billed by the gateway's own metering.

`PriceTierFor`: `0` = priced + `price_confidence: "high"`, `1` = priced but unconfirmed, `2` =
unpriced (`input`/`output` null). Tier `2` must sort last under a cost preference so an unknown
price can never masquerade as free/cheapest.

Model ids prefixed `PENDING` are filtered out of `ModelsFor` (and therefore out of `Catalog`,
`/v1/models`, and routing entirely) — `registry.go`'s `strings.HasPrefix(ms.ID, "PENDING")`.

**Per-manifest state, as of 2026-07-06:**

| Manifest | Adapter | Models | Verification state |
|---|---|---|---|
| `anthropic.json` | `native-messages` | `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5` — all with real prices, `price_confidence: "high"` | Shape + pricing both `"high"`, first-party-sourced, checked 2026-07-04 |
| `openai.json` | `openai-native` (resolves to `openai-compat`) | One row, id `"PENDING-first-party-confirmation"` — filtered out, so OpenAI contributes **zero routable models** | Shape `"high"` (from OpenAI's own OpenAPI spec); pricing `"unconfirmed"` — first-party domains returned HTTP 403 on 2026-07-04, pricing/ids deliberately left null rather than guessed |
| `zhipu.json` | `openai-compat` | `glm-5.2`, `glm-5.1`, `glm-5v-turbo` — all routable (real ids), but all `price_per_mtok` fields are null | Shape `"high"` (Zhipu's own SDK); pricing `"unconfirmed"` — first-party pricing pages 403'd on 2026-07-04; a previously-carried third-party price figure was deliberately deleted, not corrected in place |

There is also a **separate, unrelated "verified" concept**: a `providers` DB row's `verified`
boolean (`internal/gateway/providers.go`, `turn.go`) means "a real request has succeeded with
this provider's *current key*" — it resets to `false` on every key rotation and has nothing to
do with the manifest's `price_confidence`/`verification.shape` fields. Don't conflate the two
when reading dashboard/API output.

### A5. Routing config surface

`Routing` (`config.go`) holds: `AutoDefaultProfile`, `Profiles` (name → `Profile{Preference,
Require, RankMap, Providers}`), `QualityRanks` (`"provider/model"` → 0-100 int), `RoleRanks`
(role-map-name → its own `"provider/model"` → rank map), and `Bridge{Enabled, MaxHops}`.
`Aliases` (plain `"name" → "provider/model"`) lives at the **top level** of `Config`, not inside
`Routing` — see A2.

**Built-in profiles** (`defaults()`, `config.go`) — real output from `l00prite route profiles`
against a scratch install, 2026-07-06:

```
Auto profiles (model "auto:<name>" or header x-l00prite-route: auto:<name>):
  auto:review     preference=quality
  auto:summarize  preference=cost
  auto:code       preference=balanced  require=tools
  auto:cheap      preference=cost
  auto:quality    preference=quality
  auto:balanced   preference=balanced   (default for bare "auto")
  auto:plan       preference=quality
```

| Profile | Preference | Require | RankMap |
|---|---|---|---|
| `cheap` | cost | — | — |
| `quality` | quality | — | — |
| `balanced` (default for bare `auto`) | balanced | — | — |
| `plan` | quality | — | `plan` |
| `code` | balanced | `tools` | `code` |
| `review` | quality | — | `review` |
| `summarize` | cost | — | — |

`plan`/`code`/`review` name a `RankMap`, but `RoleRanks` **ships empty** — with no operator
override, the rank-source merge (`routerauto.go`) finds an empty map for `"plan"`/`"code"`/
`"review"` and falls straight back to `QualityRanks` (`rank_source: "qualityRanks"` in the
routing decision). Filling `routing.roleRanks.code` (etc.) in `config.json` is how an operator
actually differentiates those profiles from the shared quality ranks; a role override **replaces
that role's whole map**, it does not merge model-by-model within it (only the merge of
`RoleRanks[name]` *over* `QualityRanks` is model-by-model).

Compiled-in `QualityRanks` (0-100, `provider/model`): `anthropic/claude-opus-4-8` 96,
`anthropic/claude-fable-5` 93, `anthropic/claude-sonnet-5` 88, `anthropic/claude-haiku-4-5` 74,
`zhipu/glm-5.2` 82, `zhipu/glm-5.1` 78, `zhipu/glm-5v-turbo` 70.

**Header pins**, verified against `internal/gateway/ingress.go` and `bridge.go`:

| Header | Direction | Effect |
|---|---|---|
| `x-l00prite-route` | request | `provider:model`/`provider/model` shape = explicit pin (unknown provider is a hard 400); `auto`/`auto:<profile>` opts into auto-routing |
| `x-l00prite-dry-run` | request | Truthy = return only the routing decision (`would_route`/`decision`/`bridge`), no spend, no upstream call |
| `x-l00prite-repo` | request | Scopes the request to a registered repo (must match the token's own repo scope if it has one) |
| `x-l00prite-paths` | request | Comma/whatever-separated path list forwarded into the bridge call |
| `x-l00prite-bridge` | request | `on/1/true/yes` or `off/0/false/no` overrides `routing.bridge.enabled` for this request only; unrecognized value keeps the config default |
| `x-l00prite-bridge-max-hops` | request | **May only LOWER** the configured hop cap, never raise it — see live proof below |
| `x-l00prite-request-id`, `x-l00prite-provider`, `x-l00prite-cost-usd`, `x-l00prite-cost-unconfirmed`, `x-l00prite-cap-usd`, `x-l00prite-bridge-hops` | response | Per-request routing/cost metadata the gateway sets back |

**Dry-run + auto-routing introspection, real output** (scratch install, mock adapter, 2026-07-06,
`POST /v1/chat/completions` with `x-l00prite-dry-run: true`, `model: "auto:cheap"`):

```json
{
  "would_route": {"provider": "anthropic", "model": "claude-haiku-4-5"},
  "decision": {
    "rule_id": "auto_select", "chosen": "anthropic/claude-haiku-4-5",
    "profile": "cheap", "preference": "cost", "rank_source": "qualityRanks",
    "reason": "auto:cheap — cheapest sufficient model; est $0.020482/call",
    "candidates": [
      {"target": "anthropic/claude-haiku-4-5", "price_tier": 0, "quality": 74, "est_usd": 0.020482},
      {"target": "anthropic/claude-sonnet-5",  "price_tier": 0, "quality": 88, "est_usd": 0.061446},
      {"target": "anthropic/claude-opus-4-8",  "price_tier": 0, "quality": 96, "est_usd": 0.10241},
      {"target": "anthropic/claude-fable-5",   "price_tier": 0, "quality": 93, "est_usd": 0.20482}
    ]
  },
  "bridge": {"armed": false, "max_hops": 3}
}
```

This is the single best way to see your effective routing config resolve for a real request
without spending anything — no source access needed, only the running binary.

**Hop-cap lower-only, proven live**: sending `x-l00prite-bridge: on` with
`x-l00prite-bridge-max-hops: 999` against the compiled default (`maxHops: 3`) returned
`"bridge": {"armed": true, "max_hops": 3}` — the requested `999` was rejected because it exceeds
the configured cap; only a value *lower* than the configured cap would have taken effect
(`BridgeMaxHops`, `bridge.go`).

### A6. Protocol JSON files in your project's `.l00prite/`

These field lists are verified against `templates/l00prite/{heartbeat,state,lock}.json` in the
l00prite repo — the same shape a fresh scaffold copies into your project. If your project's
files differ (a customized field, an older schema), **your copy is the authority**; this is a
reference, not a source of truth override.

**`heartbeat.json`** — two independent budgets, both real, easy to conflate:

| Field | Meaning |
|---|---|
| `schema_version` | `2` in a current scaffold; `1` (no `execution` block at all) means the project predates Execution Mode |
| `max_iterations` / `current_iteration` | The **planning-mode/supervised-loop** budget (scaffold default `10`) — governs ordinary resume/heartbeat loops, not Execution Mode |
| `stop_conditions` | `definition_of_done_met`, `blocked`, `human_review_required`, `max_iterations_reached` |
| `human_review_gates` | Free-text conditions requiring a human before proceeding |
| `last_run_time`, `completion_status`, `should_continue`, `pause_reason` | Supervised-loop state |
| `execution.max_iterations` / `execution.current_iteration` | The **separate** Execution Mode budget (scaffold default `25`, engine-clamped 1..100 — see A7); do not confuse with the top-level pair above |
| `execution.enabled` | Audit record only — never itself an authorization (see `l00prite-execution-mode-ops`) |
| `execution.preflight_confirmed` / `_at` / `_by` | Set only by a confirmed pre-flight |
| `execution.last_run_boundary` | Which of the nine boundaries the last Execution Mode run stopped at |
| `execution.iterations_since_progress` / `last_progress_iteration` / `no_progress_threshold` | No-progress telemetry (default threshold `3`) |
| `execution.run_boundaries` | The nine fixed boundary ids (`definition_of_done_met`, `iteration_limit_reached`, `human_review_gate`, `destructive_operation_required`, `ambiguous_requirements`, `unfixable_failing_tests`, `missing_secrets_or_credentials`, `lock_lease_conflict`, `stop_signal`) |

**`state.json`**: `schema_version`, `project_name`, `current_goal`, `current_phase`,
`active_agent`, `last_agent`, `last_updated`, `status`, `blocked`, `blocker_reason`,
`active_event_id`, `last_event_processed`, `pending_event_count`, `review_response_required`,
`ci_status`, `execution_active`, `execution_stop_reason`, `next_recommended_action`. Verified
byte-comparison: the template and `examples/vendor-neutral-output/.l00prite/state.json` are
identical in every field name and every value **except** `project_name`, `current_goal`, and
`next_recommended_action` — i.e. this schema is exactly as fixed as `heartbeat.json`'s (which
compares fully byte-identical, placeholders and all).

**`lock.json`** — **schema v1**, not v2 (by design, unlike heartbeat/state — it's a small,
stable file, not something that grows features): `schema_version`, `lock_id`, `owner_agent`,
`owner_session`, `acquired_at`, `expires_at`, `ttl_seconds` (default `1800`), `purpose`,
`protected_paths` (the 9-entry list: `ledger.md`, `memory.md`, `state.json`, `heartbeat.json`,
`failures.md`, `todos.md`, `events/`, `reviews/`, `sessions/`), `status`. `status` is one of
exactly four values: `unlocked`, `active`, `released`, `expired` (`LOCKING.md`). Full lock
etiquette (acquire/respect/reclaim/release rules) is `l00prite-loop-operations`' home — this is
the field reference only.

### A7. Engine `RunConfig` — per-run knobs vs. process-wide engine defaults

Two genuinely different things get called "run config," verify which one you mean before
changing it:

**`RunConfig`** (`cli-os/internal/engine/types.go`) — set by whoever creates a run via
`POST /v1/runs`, immutable for the life of that run (the self-modification guard: "no code path
may raise `MaxIterations`, loosen `Gates`, or extend `CommandAllowlist` after Start"):

| Field | Default | Clamp/validation (`store.go` `CreateRun`) |
|---|---|---|
| `Objective` | `"balanced"` if empty | Must be one of `Objectives` = `balanced, quality, cost, speed, privacy`, else the run is rejected before any write |
| `MaxIterations` | `25` if `<= 0` | Clamped to `1..100` |
| `ApprovalTimeoutSec` | `900` if `<= 0` | How long a pending approval waits before it expires — a timeout is a **deny**, never a default-allow |
| `NoProgressThreshold` | `3` if `<= 0` | Mirrors `heartbeat.json`'s `execution.no_progress_threshold` |
| `Gates` | `{}` | Each provided key must be one of the six `GateClasses` (`push`, `merge`, `deploy`, `credential_change`, `destructive`, `outside_repo`); each value must be `require_approval` or `deny` — an absent class reads as `require_approval` (fail-closed); there is deliberately **no** "auto_allow" policy |
| `CommandAllowlist` | `[]` | The only `run_command` prefixes usable without a destructive-gate approval; shown verbatim at pre-flight |

Verified live via `TestCreateRunDefaultsAndRoundTrip` (`cli-os/internal/engine/store_test.go`):
a request for `MaxIterations: 500` is clamped down to `100`.

**Engine-level defaults** (`internal/engine/engine.go`, `New()`) — constructed once per server
process, hardcoded, **not currently exposed through `config.json` or an environment variable**:
`LeaseTTLSec: 1800` (the `.l00prite` lock TTL for an armed run, refreshed each iteration),
`IterationTimeout: 20 * time.Minute` (wall-clock bound per unit), `MaxToolCalls: 40` (backstop
against a stuck model's tool loop within one unit). Do not confuse `MaxToolCalls`/
`IterationTimeout` (process-wide, fixed) with `RunConfig.ApprovalTimeoutSec` (per-run, human-set)
or with `run_command`'s own per-call timeout ceiling (`cmdMaxTOSec = 900` in `tools.go`, "default
300, cap 900" seconds for one tool invocation) — three different 900-adjacent numbers governing
three different things.

---

## Part B — In the l00prite repo (contributing a config axis)

This part is for a session developing `cli-os`/the protocol inside the l00prite repo itself —
adding a manifest, a routing default, or a brand-new config field as a change to this repo's
source, not for operating an already-built binary.

### B1. `vendors.json` — branch semantics

`templates/vendors.json` (schema_version 1) is the machine-readable map of how each AI coding
agent discovers a l00prite project; `scripts/validate-l00prite.js` consumes it directly. Each
entry takes exactly one of three shapes:

| Shape | Example | Validator check |
|---|---|---|
| `adapter_template` set, `generated_from` null | `gemini-cli`, `qwen-code`, `github-copilot`, `cursor`, `windsurf`, `aider` | The template file must exist; every `required_strings` term must appear in it; if `target_path` is also set, both this repo's root copy AND `examples/vendor-neutral-output/<target_path>` must be **byte-identical** to the template |
| `adapter_template` null, `generated_from` + `target_path` set | `agents-md-standard` (→ `AGENTS.md`), `claude-code` (→ `CLAUDE.md`) | No template-identity check (these are per-project *generated*, not copied verbatim); instead both copies must each individually contain every `required_strings` term |
| Both null | `zed`, `opencode` | Covered natively (e.g. by `AGENTS.md`) — no file existence/parity check at all, just documentation |

Every `templates/adapters/<file>` must be referenced by **exactly one** `vendors.json` entry
(the validator checks `refCount === 1`) — a stray unreferenced adapter file or one claimed twice
both fail.

### B2. Config-adjacent template/example byte-parity

Beyond the six canonical loop prompts (owned by `l00prite-change-control`), the
`.l00prite/`-shape files this skill's Part A describes are themselves parity-checked between
`templates/l00prite/` and `examples/vendor-neutral-output/.l00prite/`:

```
$ cmp templates/l00prite/heartbeat.json examples/vendor-neutral-output/.l00prite/heartbeat.json   # identical
$ cmp templates/l00prite/lock.json      examples/vendor-neutral-output/.l00prite/lock.json        # identical
$ diff templates/l00prite/state.json    examples/vendor-neutral-output/.l00prite/state.json
3,4c3,4
<   "project_name": "replace-with-project-name",
<   "current_goal": "replace-with-current-goal",
---
>   "project_name": "example-project",
>   "current_goal": "implement the RSS daily digest CLI described in blueprint.md",
19c19
<   "next_recommended_action": "review the generated blueprint and choose the first implementation step"
---
>   "next_recommended_action": "review the generated blueprint, then start prompts/resume-loop.md with the first todos.md item"
```

Only `state.json`'s two placeholder-text fields and its narrative `next_recommended_action`
legitimately differ — every field *name*, and every other value, matches exactly. If you add a
new field to `heartbeat.json`/`state.json`/`lock.json`, add it to **both** copies in the same
change or the parity check (and the example's usefulness as a realistic adopter transcript)
breaks.

### B3. Add-a-config-axis checklist for contributors

Adding a new `config.go` field, `LOOPRITE_*` env var, manifest capability, or routing knob, in
the pattern the existing code follows:

1. **`config.go`**: add the field to `Config` and (if file-overridable) to `fileConfig`/its
   override struct with a pointer leaf type, so a partial JSON block deep-merges instead of
   wiping siblings. Pick a default in `defaults()`. Decide the falsy-fallback rule explicitly
   (does `0`/`""` mean "use the default" or "a real value the operator chose"?) — the existing
   port/host/maxTokens fields all choose "falls back to default," which is a security-relevant
   choice (an operator can't accidentally zero out a safety-relevant bound).
2. **Env var**, if this axis needs one: read it in `Load()` after the `config.json` merge (env
   wins), following the existing `LOOPRITE_*` naming convention. Add it to `cli-os/.env.example`
   even if commented out — three existing variables were missed here (A3); don't add a fourth.
3. **Test**: a table/unit test in `internal/config/config_test.go` proving (a) the default when
   unset, (b) the override when set, (c) the fallback when the value is falsy/malformed — follow
   `TestFalsyPortHostFallBack`/`TestBridgeConfigDeepMerge` as the pattern.
4. **Docs**: update this skill's A2/A3 table in the same change (owned here — don't let another
   skill's table drift out of sync), and `cli-os/README.md`/`INSTALL.md` if the axis is
   operator-facing.
5. **If it guards behavior** (a safety/security-relevant knob, not just a tuning number): the
   default must be the fail-closed one (deny/refuse/off), matching the existing bind-safety and
   master-key patterns in `config.go`. If you can't make it fail-closed yet, say so explicitly in
   a known-limitations note (the `cache_write_1h` gap in A4 is the model for how to phrase this)
   rather than silently shipping a fail-open default.
6. **Production vs experimental labeling**: reuse the existing vocabulary instead of inventing a
   new one — a provider/model row's `price_confidence` is `"high"` or `"unconfirmed"` (never a
   guessed number); an unroutable/unconfirmed model id is prefixed `PENDING` so
   `ModelsFor`/`Catalog` filter it out automatically; a `providers` DB row's `verified` flag is
   about a proven-working key, not about manifest accuracy — don't conflate the three.
7. This is source-code/template work: it does not itself require the change-control gates unless
   the field lives inside one of the two review-gated files or the Autonomous-Edit Denylist —
   check `l00prite-change-control` if you're unsure which class your change falls into.

---

## Provenance and maintenance

All facts below are dated **2026-07-06**. Re-run the command in the right column before relying
on a number or default; commands marked "(source)" need a checkout of the l00prite repo's
`cli-os/` tree, not just the compiled binary.

| Fact stated in this skill | Re-verification command |
|---|---|
| The 11-variable env-var catalog is complete | (source) `cd cli-os && grep -rn "os.Getenv\|os.LookupEnv" --include="*.go" . \| grep -v _test.go` |
| `.env.example` omits 3 of the 11 variables | (source) `diff <(grep -oE 'LOOPRITE_[A-Z_]+' cli-os/.env.example \| sort -u) <(grep -rhoE 'LOOPRITE_[A-Z_]+' cli-os --include="*.go" \| grep -v _test \| sort -u)` |
| Port `0`/empty host fall back to defaults | (binary) write `{"port":0,"host":""}` to `$LOOPRITE_HOME/config.json`, run `l00prite serve`, confirm it listens on `127.0.0.1:8787`; or (source) `cd cli-os && go test ./internal/config/... -run TestFalsyPortHostFallBack -v` |
| Bridge config deep-merges (partial override keeps `maxHops`) | (source) `cd cli-os && go test ./internal/config/... -run TestBridgeConfigDeepMerge -v` |
| `RunConfig.MaxIterations` clamps to 1..100 | (source) `cd cli-os && go test ./internal/engine/... -run TestCreateRunDefaultsAndRoundTrip -v` |
| Built-in auto profiles + quality ranks | (binary) `l00prite route profiles` |
| Auto-routing dry-run introspection shape | (binary) `curl -X POST http://127.0.0.1:<port>/v1/chat/completions -H "Authorization: Bearer <token>" -H "x-l00prite-dry-run: true" -d '{"model":"auto:cheap","messages":[{"role":"user","content":"hi"}]}'` |
| Bridge hop cap is lower-only | (source) `grep -n "may only LOWER" cli-os/internal/gateway/bridge.go` |
| `capStrictTrue` vs `capTruthy` vs raw `== true` asymmetry | (source) `grep -n "capStrictTrue\|capTruthy" cli-os/internal/gateway/routerauto.go; grep -n "promptCacheable" -A2 cli-os/internal/gateway/adapters/anthropic.go` |
| Only 4 manifest-level + 6 model-level keys are code-consumed | (source) `grep -n "json:\"" cli-os/internal/gateway/adapters/registry.go \| head -20` |
| `cache_write_1h` is documented but never parsed | (source) `grep -rn "cache_write_1h\|CacheWrite1h" cli-os --include="*.go"` (expect no output) |
| Per-manifest verification state (anthropic high/high, openai high/unconfirmed+PENDING, zhipu high/unconfirmed) | (source) `grep -A6 '"verification"' cli-os/internal/gateway/adapters/manifests/*.json` |
| `heartbeat.json`/`lock.json` byte-identical between template and example; `state.json` differs only in placeholder text | `cmp templates/l00prite/heartbeat.json examples/vendor-neutral-output/.l00prite/heartbeat.json; diff templates/l00prite/state.json examples/vendor-neutral-output/.l00prite/state.json` |
| `lock.json` schema_version is 1, not 2 | `grep schema_version templates/l00prite/lock.json templates/l00prite/heartbeat.json templates/l00prite/state.json` |
| Every `templates/adapters/*` file is referenced exactly once in `vendors.json` | (source) `node scripts/validate-l00prite.js 2>&1 | grep "referenced by exactly one"` |
| `l00prite init` never writes `config.json` | (source) `grep -n "cmd == \"init\"" -A 15 cli-os/cmd/l00prite/main.go` |
| Non-loopback bind without TLS is fatal | (binary) `LOOPRITE_HOST=0.0.0.0 l00prite serve` (expect exit 1 and the quoted message) |
