---
name: l00prite-run-and-operate
description: >
  Scope: any l00prite-managed project. Load this when you need to actually OPERATE the
  `l00prite` cli-os binary in or for your project — not read its source, run it: `l00prite
  init`/`serve`/`version`, the first-run setup wizard, minting/listing/revoking gateway
  tokens (`l00p_<id>_<secret>`), adding/testing/rotating/removing providers, registering or
  cloning a repo, driving the autonomous run engine end-to-end over `/v1/runs*`
  (create -> preflight -> start with `confirm:"EXECUTE"` -> events -> approve/deny -> stop),
  or hitting `/v1/chat/completions` directly with curl. Also load this to find where an
  artifact lands (the SQLite file, the JSONL ledger, a target repo's `.l00prite/` writes,
  docker/systemd deployment) or to see what the dashboard does and does not have yet (no
  Runs view). Trigger phrases: "start the server", "mint a token", "add a provider", "register
  a repo", "clone a repo", "call /v1/runs", "run the run engine over curl", "where does the
  ledger/database live", "docker-compose for cli-os", "l00prite CLI help".
---

# l00prite run and operate

## What this skill is for

This is the operator's manual for the `l00prite` binary (package name `cli-os` in this repo's
source tree) — the single static Go executable that is the OpenAI-compatible gateway,
first-run setup wizard, dashboard, and autonomous run engine for a project using l00prite. It
covers "how do I actually drive this thing" at three layers: the CLI (`l00prite <cmd>`), the
HTTP API (`/v1/*`, curl-able), and the browser dashboard. Every command and curl call below was
actually run against a locally built binary — see Provenance to reproduce any of them.

This skill assumes an already-built/installed binary. If you're building it from source, see
`l00prite-build-and-env` (repo-dev scope) instead. If you're bringing l00prite's file-based
memory protocol (`.l00prite/`, the loop prompts) into a project for the first time, that's
`l00prite-adopting`, not this skill.

## When NOT to use this

| If you actually need... | Use instead |
|---|---|
| To build the binary from source, prerequisites, `go build`/`go test` commands | `l00prite-build-and-env` (repo-dev) |
| Bringing l00prite's file-memory protocol into a project for the first time (`/build-loop`, scaffold file list, tiers) | `l00prite-adopting` |
| Day-to-day protocol life once scaffolded — which canonical prompt to run, lock etiquette, event lifecycle | `l00prite-loop-operations` |
| The pre-flight walkthrough, arming semantics, all nine run boundaries and how to resume after each, the self-modification guard | `l00prite-execution-mode-ops` (this skill gives you the API *shape*; that skill gives you the *protocol semantics* both the engine and the prompt-driven path share) |
| Deep Go-runtime internals — package map, `Pick`/`selectAuto` routing internals, prompt-cache mechanics, engine tool jail, "where to add a new provider adapter" | `l00prite-cli-os-internals` |
| The full config/env-var/manifest/routing-profile catalog with defaults and fallback semantics | `l00prite-config-and-flags` (Part A) |
| Symptom -> cause triage when something behaves unexpectedly (auto routing silently falls through, doctor FAIL, lock conflict) | `l00prite-debugging-playbook` |
| Validator/doctor output interpretation, byte-parity toolkit, ledger/cost inspection scripts | `l00prite-diagnostics-and-tooling` |
| Field theory on WHY prompt caching / OpenAI-vs-Anthropic shapes / lock-lease work the way they do | `agent-loop-domain-reference` |
| Building the Dashboard Runs UI (the one thing the dashboard doesn't have) | `l00prite-runs-view-campaign` (repo-dev; this skill only tells you it doesn't exist yet and gives you the curl equivalent) |

All facts below are dated **as of 2026-07-06**; re-verify anything you rely on (see
Provenance). Everything here was verified against `/home/user/l00prite/cli-os` source and a
locally built binary — if your project vendors a different l00prite release, treat version
numbers and exact strings as pointers to re-check, not guarantees.

---

## 1. CLI surface

Everything below is quoted from `cli-os/cmd/l00prite/main.go`'s built-in help (`l00prite` /
`l00prite help` / any command with `--help`), cross-checked against the `switch` statements
that implement each subcommand:

```
l00prite init                                 Initialize data dir, database, master key
l00prite serve [--host H] [--port N]          Start the gateway + dashboard
l00prite health                               Print provider + spend status
l00prite version                              Print version + platform (os/arch)

l00prite provider add <name> [--key K] [--adapter native-messages|openai-compat|mock]
                            [--base URL] [--default]
l00prite provider list
l00prite provider test <name> [--key K] [--adapter A] [--base URL] [--model M]
l00prite provider default <name>
l00prite provider enable|disable|remove <name>

l00prite token mint --project P [--repo ID] [--expires DAYS]
l00prite token list
l00prite token revoke <id>

l00prite repo register <id> --root PATH [--project P]
l00prite repo list

l00prite cap set --project P --daily USD
l00prite cap list

l00prite route explain <request-id>
l00prite route plan <model|auto|auto:profile> [--task "..."] [--vision] [--tools] [--route P/M]
l00prite route profiles
l00prite bridge status
l00prite ledger [--limit N]
```

Two gaps that will surprise you if you assume CLI/API symmetry:

- **No `l00prite provider rotate` or `l00prite repo clone` CLI subcommand.** Key rotation
  (`POST /v1/providers/rotate`) and git-clone-and-register (`POST /v1/repos/clone`, §5) exist
  **only** as authenticated HTTP endpoints. The CLI `repo register` is `INSERT OR REPLACE`
  (re-registering an id repoints it silently) — unlike `POST /v1/repos`, which 409s on a
  duplicate id.
- **No `l00prite run` CLI subcommand at all.** The autonomous run engine is API-only today
  (`/v1/runs*`, §6) — driving a run from the CLI means scripting curl against that surface, or
  using the dashboard once it grows a Runs view (it doesn't have one yet — §9).

`l00prite version` prints `l00prite v<ver> (<os>/<arch>)`, normalizing away a double `v` if the
build already stamped one (e.g. release git-describe output). Verified here:
`l00prite v1.0.0 (linux/amd64)` — `1.0.0` is `gateway.Version`'s **in-source default**, a
known-stale banner in an unreleased build (a real release stamps it via `-ldflags`; don't read
`1.0.0` as "protocol v1.0.0" — see `l00prite-docs-and-claims`).

`l00prite --help` (or no args, or `help`) prints the block above verbatim and exits 0.

---

## 2. First run: init, serve, and the setup wizard

### 2.1 `l00prite init`

Creates the data directory (mode `0700`) and, inside it, `master.key` (chmod `600`, AES-256-GCM
vault key) and `cli-os.db` (+ `-wal`/`-shm`, SQLite WAL mode). Verified output:

```
$ l00prite init
Initialized l00prite CLI-OS at /home/you/.l00prite-cli-os
Next (easiest): start the server and finish setup in your browser —
  l00prite serve        # then open http://127.0.0.1:8787/
Or do the same from the CLI:
  l00prite provider add anthropic --key sk-ant-... --default
  l00prite token mint --project default
  l00prite serve
```

`init` is **optional**: `l00prite serve` with no master key present boots straight into
browser setup mode (§2.2) and the wizard creates the vault for you. Running `init` first just
makes the vault/DB explicit before you ever open a browser.

**Where.** The data directory defaults to `~/.l00prite-cli-os`; override with `LOOPRITE_HOME`
(`init`, `serve`, and every other CLI call must agree on the same value, or you're talking to
two different installs). Inside it: `cli-os.db` (one SQLite file for *everything* — providers,
tokens, repos, caps, the ledger, the audit log, AND the run engine's `runs`/`run_events`/
`run_approvals` tables; no separate engine database), `master.key`, and `ledger.jsonl` (a JSONL
mirror of the `ledger` table, written best-effort per request). Full artifact map: §8.

### 2.2 `l00prite serve [--host H] [--port N]`

Boots the gateway. Two classes of startup problem, handled differently:

- **Bind-safety problems are always fatal** (checked by `config.BindProblems`, independent of
  whether the vault exists yet): a non-loopback host without TLS and without
  `LOOPRITE_ALLOW_INSECURE_BIND=1`, or a configured TLS cert/key pair that doesn't exist on
  disk. Verified failure mode (`LOOPRITE_HOST=0.0.0.0 l00prite serve` with no TLS/override):
  exit 1, message on stderr:
  ```
  Refusing to start — fix these first:
    • Refusing to bind non-loopback host "0.0.0.0" without TLS. Either set LOOPRITE_TLS_CERT +
      LOOPRITE_TLS_KEY, bind to 127.0.0.1, or (only behind a trusted reverse proxy / private
      network) set LOOPRITE_ALLOW_INSECURE_BIND=1.
  ```
  A set-but-invalid `LOOPRITE_MASTER_KEY` (not valid base64 of 32 bytes) is also fatal at boot —
  the loader prefers the env var over the on-disk file and refuses to fall back silently.
- **A missing master key is NOT fatal.** The server boots into first-run setup mode and the
  browser wizard (or the CLI, §2.3) initializes the vault. This is what makes zero-config
  first run possible — you never have to run `init` by hand.

Defaults: host `127.0.0.1`, port `8787`. `--host`/`--port` flags and
`LOOPRITE_HOST`/`LOOPRITE_PORT` env vars override the same fields (env and flag both exist;
flag wins because `Overrides` is applied last in `server.Start`). Verified startup banner:

```
$ l00prite serve --host 127.0.0.1 --port 8799
l00prite CLI-OS listening on http://127.0.0.1:8799
  • OpenAI endpoint : http://127.0.0.1:8799/v1/chat/completions
  • Dashboard       : http://127.0.0.1:8799/
```
(A "First-run setup" line is appended when setup isn't complete yet — see §2.3.)

On boot, `serve` also reaps stale PEP reservations (once, then every 5 minutes — see
`l00prite-cli-os-internals`) and reconciles any run engine run left `running` by a crash
(marks it `interrupted`; the next pre-flight for that repo does repo-side stale-run recovery
per `execute-loop.md` — see `l00prite-execution-mode-ops`).

### 2.3 The setup wizard and its durable latch

While the system is genuinely unconfigured, `GET /` serves the setup wizard
(`public/setup.html`); once setup completes it becomes the real-data dashboard **permanently**.
"Setup complete" = vault initialized AND >=1 provider row AND >=1 non-revoked token, and the
**first** time all three hold, the server writes a durable `meta` table row
(`setup_completed_at`) — from then on `SetupComplete()` returns true even if you later revoke
every token or remove every provider. Every `/v1/setup/*` **mutating** endpoint (`vault`,
`provider`, `provider/test`, `token`) checks this latch and 403s once it's set — verified:

```
$ curl -s -X POST http://127.0.0.1:8799/v1/setup/vault -d '{}'
{"error":{"code":"setup_complete","message":"Setup is already complete; the setup endpoints
are disabled. Use the CLI or an authenticated endpoint.","type":"permission_error"}}
```

`GET /v1/setup/status` stays readable forever (booleans/counts only, never secrets) — it's how
the wizard (and you) can poll `next_step` (`vault`|`provider`|`token`|`done`). Without this
latch, dropping providers/tokens back to zero would silently re-open an unauthenticated
setup surface as an auth-bypass back door; the archaeology behind why this matters is in
`l00prite-failure-archaeology` if you want the incident, not just the rule.

The wizard's actual steps (per `cli-os/INSTALL.md`, which is accurate on this point as of
2026-07-06): Welcome -> Vault -> Provider (adapter picker offers **only** `native-messages`
(Anthropic) and `openai-compat` — no mock option; the key is validated with a real upstream
call before it's stored) -> Network (shows your real bind host/port/TLS/exposure) -> Token
(shown once) -> Done. There is **no** model-selection or repo-registration step in the wizard
— both live in the dashboard after setup (Providers section for model selection;
Repositories section for repo registration, §5).

**Safe-bind env var:** `LOOPRITE_ALLOW_INSECURE_BIND=1` is the only way to bind a non-loopback
host without TLS; it is meant for a host already private/encrypted by something else (a
WireGuard/Tailscale tailnet, or a TLS-terminating reverse proxy in front) — never for public
exposure. The full env-var catalog (11 variables total) lives in `l00prite-config-and-flags`.

---

## 3. Auth

Every token is `l00p_<id>_<secret>` (verified example minted on this machine:
`l00p_14c083eef68eb28385_rBqW7q2d6Dl47qH9Y34IMpNnGk9U8Ch9`) — the id half is public (stored
plaintext, used for lookup and for `token revoke <id>`), the secret half is never stored: only
`sha256(secret)` is, compared in **constant time** (`util.TimingSafeEqual`) against the
presented token's hash, so a leaked token is revocable without touching any provider key.

**Single-tier warning (known limitation, dated 2026-07-06, unresolved):** every `/v1/*`
data/management endpoint (`chat/completions`, `dashboard/summary`, `providers*`, `repos*`,
`runs*`) authenticates with the *identical* Bearer token — there is no separate
management-scoped tier. Any valid token for a project can add/rotate/remove providers and set
model selection, not just make chat requests. `cli-os/docs/known-limitations.md` states this is
a deliberate scope decision for a single-operator deployment, not an oversight, and names the
fix (a `can_manage_providers` flag checked in `requireToken`) as unimplemented future work.
**Treat every token as an admin credential** until that lands.

**Project/repo scoping:** a token carries a `project` (required at mint) and an optional `repo`
(repo-scoped). A repo-scoped token can only act against that one repo id (403 otherwise); any
repo/run it touches must belong to its own project (403 `project_mismatch` otherwise — this
applies uniformly to `/v1/chat/completions`, `/v1/repos*`, and `/v1/runs*`). A cross-project
run lookup returns a plain 404, not a 403 — `ownRun` deliberately doesn't leak that a run with
that id exists in someone else's project.

```
$ l00prite token mint --project demo
Token minted (shown once — store it now):

  l00p_14c083eef68eb28385_rBqW7q2d6Dl47qH9Y34IMpNnGk9U8Ch9

  id=14c083eef68eb28385 project=demo
```

---

## 4. Provider lifecycle

| Action | CLI | API (authenticated, post-setup) |
|---|---|---|
| Add | `provider add <name> [--key K] [--adapter A] [--base URL] [--default]` | `POST /v1/providers` |
| List | `provider list` | (part of `GET /v1/dashboard/summary`) |
| Test / validate | `provider test <name> [--key K] [--adapter A] [--base URL] [--model M]` | `POST /v1/providers/test` |
| Rotate key | *(none — API/dashboard only)* | `POST /v1/providers/rotate` |
| Enable/disable | `provider enable\|disable <name>` | `POST /v1/providers/update` (`enabled`) |
| Set default | `provider default <name>` | `POST /v1/providers/update` (`default`) |
| Remove | `provider remove <name>` | `POST /v1/providers/remove` (dashboard: type-to-confirm) |
| Set model selection | *(none — dashboard/API only)* | `POST /v1/providers/models` |

Both the CLI's `provider add` and the wizard's `POST /v1/setup/provider` and the authenticated
`POST /v1/providers` funnel through the **same** `storeProvider` core, so all three write
identical rows — verified in source (`cli-os/internal/gateway/providers.go`), not just docs.

**`verified` vs `validated` — two different flags, do not conflate them:**
- **`validated`** (API response field, wizard/`provider add`/`provider test`) means "a real
  upstream round-trip succeeded *at add/rotate time*" (unless you pass `skip_validation`).
- **`verified`** (a DB column, never returned as anything but `false` from the write endpoints)
  flips to `true` the **first time a real ROUTED request succeeds** against the provider's
  *current* key (`markProviderVerified` in `turn.go`) — it resets to `0` on every rotation.
  `provider list`/`health` don't show it; `GET /v1/dashboard/summary` does
  (`providers[].verified`).

**Removing the last/only provider is allowed** — there is no guard against it. The consequence
is specific and surfaced, not a generic routing error: the next `/v1/chat/completions` (or
`auto:*` route) gets `503 {"code":"no_providers_configured"}` with a message pointing back at
the dashboard (distinct from "all providers disabled" — same code, different message, per
`router.go`). Verified via the dashboard summary's `removalImpact`: removing your only default
provider is flagged `"level":"error"` with an explicit warning before you confirm.

**The `mock` adapter is real but deliberately hidden from every user-facing surface** — the
setup wizard's adapter `<select>` offers only `native-messages`/`openai-compat` (verified: zero
`mock` occurrences in `public/setup.html`), and the CLAUDE.md ledger records mock/demo removal
from the wizard, dashboard add-provider flow, docker seed, and `init` hints (as of 2026-07-04).
It still works via the CLI (`--adapter mock`) and the API (`"adapter":"mock"`) as an internal,
no-network test adapter — this is exactly what makes a local smoke walkthrough possible without
any real provider key (§6, §7).

```
$ l00prite provider add mockp --adapter mock --default
Added provider "mockp" (adapter=mock) [default]
$ l00prite provider test mockp
✓ provider "mockp" validated
```

---

## 5. Repo lifecycle

| Action | CLI | API |
|---|---|---|
| Register (local path) | `repo register <id> --root PATH [--project P]` | `POST /v1/repos` |
| List | `repo list` | (part of `GET /v1/dashboard/summary`) |
| Remove | *(none — API/dashboard only)* | `POST /v1/repos/remove` |
| Clone from git URL + register | *(none — API/dashboard only)* | `POST /v1/repos/clone` |

**Path-existence:** both the CLI and `POST /v1/repos` resolve the root to an absolute path and
require it to already exist as a directory on **the machine running the gateway** — a typo or a
path from another machine fails at registration time with a clear message, not later as silent
"no memory" on every request.

**Duplicate handling differs by surface:** the CLI's `repo register` is `INSERT OR REPLACE`
(re-registering an id repoints it silently). `POST /v1/repos` instead 409s
(`repo_exists`) on a duplicate id — a browser form can never silently re-home a repo id another
token is using; you must `POST /v1/repos/remove` first.

**Project scoping on register:** `POST /v1/repos` puts the repo in the *acting token's own
project* by default; passing an explicit different `project` in the body is rejected 403
(`project_mismatch`) — a token can't park/re-home a repo into a project it doesn't belong to.
Cross-project registration is a CLI-only (gateway-host) operation.

**`POST /v1/repos/clone` (git URL, no CLI equivalent) — verify this is current, not stale:**
clones `--depth 1` into `<LOOPRITE_HOME>/workspaces/<repo id>` (never a caller-supplied path)
and registers it under the acting token's project. Accepts only `https://` or scp-style
`git@host:owner/repo` URLs; rejects anything starting with `-` (never let a URL look like a git
flag), rejects an `https://` URL carrying embedded userinfo (a credential — it would otherwise
be echoed back in the response's `cloned_from` field), and runs git fully non-interactively
(`GIT_TERMINAL_PROMPT=0`, `GIT_SSH_COMMAND` forced into `BatchMode`) so an unreachable or
credential-requiring URL fails fast instead of hanging on a prompt nothing can answer.
**Note for anyone reading `cli-os/INSTALL.md`:** that doc's §6 says "there is no git-URL
support today" — that line predates this endpoint (`INSTALL.md` was last touched in PR #22;
`/v1/repos/clone` shipped in PR #24) and is stale as of 2026-07-06. Trust this skill's source
citation (`cli-os/internal/gateway/repos_clone.go`) or the endpoint table in §9, not that line.

**Removing a repo** only deletes the id->path row (nothing on disk is touched); the response
reports how many non-revoked tokens were scoped to that repo id so the caller can see the blast
radius before/after.

Verified round-trip (mock-adapter smoke environment, §7):

```
$ l00prite repo register smokerepo --root /path/to/repo --project demo
Registered repo "smokerepo" -> /path/to/repo (project=demo)
$ curl -s -X POST http://127.0.0.1:8799/v1/repos/remove -H "authorization: Bearer $TOKEN" \
    -d '{"id":"smokerepo"}'
{"id":"smokerepo","removed":true,"tokens_scoped":0}
```

---

## 6. Runs over curl — the API walkthrough the dashboard lacks

There is no Runs UI yet (§9) and no CLI subcommand (§1), so curl (or a script) against
`/v1/runs*` is the only way to drive the autonomous run engine today outside a prompt-driven
agent following `.l00prite/prompts/execute-loop.md`. Every field name and status string below
was produced by a real local run — see the full transcript method in Provenance.

**8 run statuses** (`internal/engine/types.go`): `draft`, `ready`, `blocked`, `running`,
`waiting_approval`, `done`, `stopped`, `interrupted`.

**Endpoint table** (all authenticated; all project-scoped per §3):

| Method | Path | Body (JSON) | What it does |
|---|---|---|---|
| POST | `/v1/runs` | `{repo, goal, objective?, gates?, command_allowlist?, max_iterations?, approval_timeout_s?, no_progress_threshold?}` | Create a draft run against a registered repo; returns `{run, preflight}` immediately (a run is always born with its first pre-flight). |
| POST | `/v1/runs/preflight` | `{id}` | Rebuild the pre-flight (409 `run_active` if the run is `running`/`waiting_approval`). A stale pre-flight can never be confirmed by Start. |
| POST | `/v1/runs/start` | `{id, confirm}` | The confirmation gate: `confirm` must be the exact string `"EXECUTE"` against a fresh, blocker-free pre-flight, or it's rejected (400 `start_rejected`, or 409 `run_not_ready` if the run isn't in a startable state). Nothing persisted ever substitutes for this. |
| GET | `/v1/runs/get?id=` | — | Run detail + `pending_approvals` + the stored pre-flight, parsed. |
| GET | `/v1/runs/list` | — | The token's project's runs, newest first (up to 50). |
| GET | `/v1/runs/events?id=&after=` | — | The append-only event feed (poll with `after=<last cursor>`); returns `{run, events, cursor}`. |
| POST | `/v1/runs/approve` | `{id, approval_id, decision: "allow"\|"deny", note?}` | Record a per-action permission decision (409 `already_decided` if the approval was already resolved). |
| POST | `/v1/runs/stop` | `{id}` | The `stop_signal` boundary (409 `run_not_active` if the run isn't running/waiting). |

**One active run per repo** is enforced at `StartRun` time (`engine.go`): starting a second run
against a repo that already has one active fails 409 with `ErrBadState`, and a lookup *failure*
(not just "found none") is treated as "don't start" — never as a false green light for two runs
to race the same repo.

**Verified walkthrough** (mock-adapter environment from §7 — a provider literally named
`anthropic` with `adapter: mock`, so `auto:*` role routing resolves against the real
manifest's model catalog while every actual call stays offline):

```
$ curl -s http://127.0.0.1:8799/v1/runs -H "authorization: Bearer $TOKEN" \
    -d '{"repo":"smokerepo","goal":"create out.txt","command_allowlist":["true"],"max_iterations":5}'
```
returned (trimmed) `preflight.team` resolved to real role->provider/model assignments —
```json
{"role":"plan","profile":"plan","provider":"anthropic","model":"claude-opus-4-8",
 "reason":"auto:plan — highest operator quality rank (96)"}
```
— and `run.status: "ready"`, no `blockers`. (Before adding a manifest-backed provider, the same
create against only a `mockp`/mock-only setup produced `run.status: "blocked"` with 4
`blockers`, one per role: `role "plan" cannot be routed (auto:plan): Auto routing found no
routable models...` — a *pre-flight* blocker, not a start-time failure, is how an unroutable
role/profile surfaces before you ever confirm Start.)

```
$ curl -s http://127.0.0.1:8799/v1/runs/start -H "authorization: Bearer $TOKEN" \
    -d '{"id":"run_...","confirm":"yes"}'
# HTTP 400 — confirm must be exactly "EXECUTE"
$ curl -s http://127.0.0.1:8799/v1/runs/start -H "authorization: Bearer $TOKEN" \
    -d '{"id":"run_...","confirm":"EXECUTE"}'
{"run":{...,"status":"running","started_at":"...","confirmed_by":"<token-id>"},"started":true}
```

Polling `/v1/runs/events` on that real run produced this exact event `kind` sequence:
`preflight_built` -> `armed` -> `iteration_started` -> `model_turn` -> `persisted` -> `boundary`.
Because the mock adapter replies with plain text instead of the expected `select_unit` tool
call, the run legitimately hit the `ambiguous_requirements` boundary on iteration 1
(`"summary":"could not parse a unit selection: no select_unit tool call and no JSON object in
message content: expected a select_unit function call"`) — real engine behavior, a faithful
(if unhelpful) `ModelCaller`, not a bug reproduced here. A real coding-capable model following
the tool-calling contract is what lets a run progress toward `definition_of_done_met`. For a
*scripted* caller that drives a full create -> start -> `done` cycle deterministically, read
`cli-os/internal/server/runs_api_test.go`'s `scriptCaller` (Go-test-only, not reachable from a
running server) — the reference for "what a completed happy path looks like" when you don't
want to spend real provider tokens observing it live.

`/v1/runs/stop` on an already-stopped run: `409 run_not_active`. `/v1/runs/approve` with an
unknown `approval_id`: `400 approval_failed` (`"no such approval on this run"`). Approval/deny
itself needs a run that reaches `waiting_approval` (a real coding model attempting a
push/merge/deploy/denylisted-path edit/off-allowlist command) — see `l00prite-execution-mode-ops`
for the per-action permission list and gate semantics; this skill only gives you the request
shape, not the boundary/gate theory.

---

## 7. Chat completions surface

`POST /v1/chat/completions` (OpenAI-compatible). Confirmed request/response anatomy:

- **`model` field forms:** `provider/model` explicit pin (rejected only if the provider prefix
  is unknown/disabled at the *header*-pin path — the model-field pin instead silently falls
  through to later routing rules, a documented trap, see `l00prite-debugging-playbook`); a bare
  model id owned by exactly one registered provider's manifest; an alias (`cfg.Aliases`);
  `"auto"` or `"auto:<profile>"` (built-in profiles: `cheap`, `quality`, `balanced`, `plan`,
  `code`, `review`, `summarize` — verified via `l00prite route profiles`).
- **Headers:** `x-l00prite-route: <provider>/<model>|auto:<profile>` (a route pin — errors
  clearly if the named provider is unregistered, unlike the model-field pin above);
  `x-l00prite-repo: <id>` (attach a registered repo's memory to this request; must match a
  repo-scoped token's own repo or 403); `x-l00prite-dry-run: 1` (routing decision only, zero
  spend, zero upstream call — response is `{"object":"l00prite.route_plan", "would_route":
  {...}, "decision": {...}}`); `x-l00prite-bridge: on` (arm cross-provider delegation, off by
  default) with `x-l00prite-bridge-max-hops` (may only *lower* the configured cap, never raise
  it). Response headers: `x-l00prite-request-id`, `x-l00prite-provider`, `x-l00prite-cost-usd`,
  and `x-l00prite-cost-unconfirmed: true` when the price used to compute that number is
  unpriced/unconfirmed — never treat that dollar figure as authoritative when this header is
  present.
- **Streaming:** `"stream": true` gets real SSE straight from the upstream provider (non-bridge
  path) or a synthesized SSE stream reconstructed from the buffered bridge result (bridge-armed
  path) — both are `text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`.

Verified explicit-pin example against a no-network mock provider (proves rule "a
`provider/model` pin routes even when `auto` can't", since the mock provider publishes no
manifest catalog for `auto` to select from):

```
$ curl -s http://127.0.0.1:8799/v1/chat/completions -H "authorization: Bearer $TOKEN" \
    -d '{"model":"mockp/any-model","messages":[{"role":"user","content":"hello"}]}'
{"choices":[{"finish_reason":"stop","index":0,"message":{"content":"Mock provider response. I
received \"hello\". This is the l00prite CLI-OS mock upstream (offline testing) — configure a
real provider key to route to Anthropic, OpenAI, GLM, and others.","role":"assistant"}}],
"id":"chatcmpl-...","model":"any-model","object":"chat.completion",
"usage":{"completion_tokens":47,"prompt_tokens":9,"total_tokens":56}}
```

`GET /healthz` is an unauthenticated connectivity check (no token needed) — useful before you
even have a token minted.

---

## 8. Artifact map — where does each thing actually land

| Artifact | Location | Notes |
|---|---|---|
| SQLite database (**one file for everything** — gateway state AND the run engine) | `$LOOPRITE_HOME/cli-os.db` (+ `-wal`/`-shm`), default `~/.l00prite-cli-os/cli-os.db` | Tables: `meta`, `providers`, `provider_models`, `tokens`, `repos`, `caps`, `spend`, `reservations`, `leases`, `ledger`, `audit`, `runs`, `run_events`, `run_approvals`. `internal/state/db.go` is the single schema source — additive `CREATE TABLE IF NOT EXISTS`, no separate run-engine database, no schema-version bump for the run tables. |
| Vault master key | `$LOOPRITE_HOME/master.key` | `chmod 600`, base64 of 32 bytes; `LOOPRITE_MASTER_KEY` env var overrides and takes precedence (usable only if valid — an invalid env value is a fatal boot error, never a silent fallback to the file). |
| Gateway ledger, JSONL mirror | `$LOOPRITE_HOME/ledger.jsonl` | Best-effort append alongside every `ledger` table row (`ledger.Append`) — same columns: request/project/repo/provider/model/rule_id/decision, 4 disjoint token counts, `cost_usd`, `cost_estimated`, `cost_unconfirmed`, `memory_status`, `outcome`. |
| Target repo's `.l00prite/` writes | Inside **the registered repo's own root**, not `$LOOPRITE_HOME` | A run engine run writes real files (branch `l00prite/run-<id>`, memory scaffolding, etc.) directly into the repo you registered — this skill doesn't own the memory-file semantics; see `l00prite-loop-operations`/`l00prite-execution-mode-ops`. |
| Cloned-repo workspaces | `$LOOPRITE_HOME/workspaces/<repo-id>` | Only path `POST /v1/repos/clone` ever writes to (§5) — never a caller-supplied path. |
| Logs | stdout/stderr of the `l00prite serve` process | No log file by default; under systemd, `journalctl -u <service>`; under docker, `docker compose logs`. |
| Audit trail | `audit` table (inside `cli-os.db`) | Every mutating CLI/API action (`provider.add`, `token.mint`, `repo.register`, `run.start`, ...) with actor = token id (or `"cli"`/`"setup"`) and a real timestamp. |

**Docker:** `docker-compose.yml` builds from the `Dockerfile` (fully static Go binary, no cgo,
runs on `alpine` only for the entrypoint shell + healthcheck), maps port `8787`, and persists a
named volume (`cli-os-data:/data`, i.e. `LOOPRITE_HOME=/data` inside the container) so keys/db/
ledger survive a container recreate. `docker-entrypoint.sh` runs `l00prite init` on first boot
if `master.key` is absent, then `exec l00prite serve`. The container binds `0.0.0.0` with
`LOOPRITE_ALLOW_INSECURE_BIND=1` baked in — the documented expectation is a TLS-terminating
reverse proxy in front for any public exposure. The compose file's `image:` tag is
`l00prite-cli-os:1.0.0` — a known-stale version banner (as of 2026-07-06), not a claim about
protocol maturity.

**Install script / systemd:** `cli-os/install/install.sh` builds the binary and runs `init` for
you. `cli-os/INSTALL.md` §5 has a complete systemd unit (loopback bind, `Restart=always`,
`StateDirectory=l00prite-cli-os`) if you want a persistent non-Docker deployment.

---

## 9. Dashboard — what exists, what doesn't

`cli-os/public/dashboard.html` (served at `/` once setup completes, or `/dashboard` any time)
has, as of 2026-07-06 (verified: `grep -n "runs\|Runs" cli-os/public/dashboard.html` returns
zero matches):

- **Overview** — provider health/cost KPIs, repo count, alerts, recent activity, audit log.
- **Playground** — send real chat requests through the gateway (model/`auto` picker, optional
  repo picker for memory injection, free-form model entry for anything not in a provider's
  known catalog).
- **Providers** — add / test / rotate / enable / disable / set-default / remove, and per-model
  enable/disable (the model-selection step the wizard doesn't have).
- **Repositories & memory** — register a local path (§5), remove, freshness snapshot of
  `.l00prite/` memory files.

**What does NOT exist yet: a Runs view.** There is no UI for `/v1/runs*` at all — no create
form, no pre-flight display, no live event feed, no approval inbox. §6 above is the only way to
drive a run today short of writing your own UI or scripting curl. Building this view is a
whole campaign, not a quick add — see `l00prite-runs-view-campaign` (repo-dev) if that's your
actual task; this skill only needed to tell you it isn't there so you don't go looking for it.
Also absent: git-URL clone in the repo-connect modal (`POST /v1/repos/clone` exists server-side,
§5, but the dashboard's "Connect a repository" modal only takes a local path today).

---

## Provenance and maintenance

All facts below are dated **2026-07-06**. Commands marked "(source)" need a checkout of the
l00prite repo's `cli-os/` tree; commands marked "(binary)" need a built `l00prite`/`cli-os`
binary and, where shown, a scratch `LOOPRITE_HOME` you don't mind writing test data into.

| Fact stated in this skill | Re-verification command |
|---|---|
| Full CLI subcommand/flag surface, no `provider rotate`/`repo clone`/`run` subcommands | (source) `sed -n '1,63p' cli-os/cmd/l00prite/main.go` (the `help` const) and `grep -n 'func providerCmd\|func repoCmd' -A 20 cli-os/cmd/l00prite/main.go` |
| `l00prite version` output shape and the `1.0.0` in-source default | (source) `grep -n "^var Version" cli-os/internal/gateway/dashboard.go` and (binary) `l00prite version` |
| `init` output text and files created | (binary) `LOOPRITE_HOME=$(mktemp -d) l00prite init` |
| Bind-safety fatal vs missing-master-key non-fatal split | (source) `grep -n "BindProblems\|MasterKeyPresent\|EnvMasterKeyInvalid" -A3 cli-os/internal/config/config.go \| head -60`; (binary) `LOOPRITE_HOME=$(mktemp -d) LOOPRITE_HOST=0.0.0.0 l00prite serve` (expect exit 1 + the quoted message) |
| Default host/port (`127.0.0.1`/`8787`) | (source) `grep -n "func defaults" -A 6 cli-os/internal/config/config.go` |
| Setup latch (durable, mutating endpoints 403 forever after) | (source) `sed -n '1,60p' cli-os/internal/gateway/setup.go`; (binary) complete setup once, then `curl -X POST http://127.0.0.1:<port>/v1/setup/vault -d '{}'` (expect 403 `setup_complete`) |
| Wizard adapter picker offers no `mock` option | (source) `grep -n "mock" cli-os/public/setup.html` (expect no output) |
| Token format `l00p_<id>_<secret>`, constant-time compare | (source) `sed -n '1,95p' cli-os/internal/security/tokens.go` |
| Single-tier auth is a documented, not-yet-fixed limitation | (source) `sed -n '1,30p' cli-os/docs/known-limitations.md` |
| `verified` (routed-use flag) vs `validated` (add/rotate-time test) distinction | (source) `grep -n "verified" cli-os/internal/gateway/turn.go cli-os/internal/gateway/providers.go \| grep -v _test` |
| Removing the last/only provider is allowed; next request 503s `no_providers_configured` | (source) `grep -n "no_providers_configured" -B3 cli-os/internal/gateway/router.go` |
| `POST /v1/repos` 409s on duplicate id; CLI `repo register` is `INSERT OR REPLACE`; `POST /v1/repos/clone` exists and rejects credential-bearing/non-https-or-ssh URLs | (source) `grep -n "INSERT OR REPLACE\|repo_exists" cli-os/cmd/l00prite/main.go cli-os/internal/gateway/repos.go`; `sed -n '1,60p' cli-os/internal/gateway/repos_clone.go` |
| `cli-os/INSTALL.md`'s "no git-URL support today" line is stale relative to `/v1/repos/clone` | (source) `git log --oneline -1 -- cli-os/INSTALL.md` vs `git log --oneline -1 -- cli-os/internal/gateway/repos_clone.go` (INSTALL.md's PR predates repos_clone.go's PR) |
| 8 run statuses | (source) `grep -n "Status[A-Z][a-z]* *=" cli-os/internal/engine/types.go` |
| `/v1/runs*` endpoint table, one-active-run-per-repo, Start's `confirm:"EXECUTE"` gate | (source) `sed -n '1,360p' cli-os/internal/gateway/runs.go`; (source) `grep -n "One active run per repo" -A6 cli-os/internal/engine/engine.go` |
| Scripted happy-path run reaching `definition_of_done` | (source) `cd cli-os && go test ./internal/server/... -run TestRunsAPICreateStartComplete -v` |
| Real (non-scripted) mock-adapter run legitimately hits `ambiguous_requirements` on iteration 1 | (binary) build+run a local server, add a provider literally named `anthropic` with `--adapter mock`, `POST /v1/runs` against a registered git repo, `POST /v1/runs/start` with `confirm:"EXECUTE"`, poll `GET /v1/runs/events?id=` |
| No Runs view; repo-connect modal is local-path only (no clone UI) | (source) `grep -n "runs\|Runs" cli-os/public/dashboard.html` (expect no output); `grep -n "Connect a repository" -A 15 cli-os/public/dashboard.html` |
| Single SQLite file backs both gateway and run-engine tables; full schema | (source) `sed -n '19,152p' cli-os/internal/state/db.go` |
| `ledger.jsonl` mirrors the `ledger` table | (source) `sed -n '1,70p' cli-os/internal/ledger/ledger.go` |
| Docker image tag `1.0.0` (stale banner); entrypoint auto-`init`s on first boot | (source) `grep -n "image:" cli-os/docker-compose.yml`; `cat cli-os/install/docker-entrypoint.sh` |
| `x-l00prite-*` header set (dry-run, route, repo, bridge, cost-unconfirmed, request-id) | (source) `grep -n "x-l00prite" cli-os/internal/gateway/ingress.go` |
