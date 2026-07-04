# Dashboard (real data) + zero-config first-run wizard

This document is the deliverable record for promoting `public/dashboard.html` from a static mockup to
the real product surface, plus the browser-based first-run wizard. Two invariants hold end-to-end:

1. **Every number the dashboard shows is real** — sourced from the DB, the vault, live health, or the
   run ledger. Anything not actually tracked is shown as an explicit empty / "not tracked" state,
   never a plausible fake.
2. **A brand-new install with zero config can reach a working, provider-configured gateway entirely
   through the browser** — no terminal after the initial binary launch.

---

## 1. Inventory of removed fabricated data → real source

The old `dashboard.html` was 100% static. Every value below was hardcoded and is now either wired to a
real source (via `GET /v1/dashboard/summary`) or removed because nothing real backs it.

| Fabricated value (old) | Replacement | Real source |
|---|---|---|
| "6 repositories active", "View all 6" | actual repo count + list, or "No repositories registered" empty state | `repos` table (`listRepos`) |
| "4 agents running", the whole **Running agents** panel (Architect/Generator/Testing/Security/Reviewer/Deployment) | **Removed** — there is no agent runtime in this gateway. Replaced by **Recent activity** from the run ledger | `ledger` table (`ledger.Recent`) |
| "7 of 8 providers online", 8 hardcoded provider cards (Anthropic/OpenAI/Gemini/GLM/DeepSeek/OpenRouter/Groq/Local) with invented latency/tokens/errors/$ | real provider cards for **configured** providers only; per-provider today cost/requests/tokens; latency shown as "—" (not tracked) | `providers` table + circuit breaker (`ListProviders`, `IsTripped`) + ledger aggregate |
| "99.98% uptime over 30 days", the 30-bar availability strip | real process uptime (`2m`, `3h`, …) or "not tracked"; no availability % (not measured) | `App.StartedAt` (set at boot) |
| "11 services healthy · 0 open incidents" | real `providers_healthy / providers_total`, `circuit_open` count, DB ok, vault initialized | derived from providers + config |
| "Spend today $18.42 · cap $40.00", "$96.30 week", "$412.80 month", "Saved via routing $53.10" | real committed/reserved today + per-project caps; **"Saved via routing" removed** (not computable) | `spend` + `caps` tables |
| Spend-over-time area chart (invented 14-point series) | real daily spend sparkline from the ledger (empty state if no requests) | `ledger` grouped by UTC day |
| "Cost by provider" bars ($8.40/$4.10/…) | real per-provider spend-today bars (empty if none) | ledger aggregate by provider |
| Per-provider "key vaulted" / "Latency 412ms" / "Tokens 1.4M" / "Errors 0.1%" | real `has_key`, request/token counts today; latency = "—"; errors = real non-ok count | providers + ledger |
| Repo cards: "Memory 98%", "Tests 142/142", "Build passing", "$6.20", branch names | real memory **freshness** (per-file mtime + 30-day stale flag); tests/build/branch **removed** (not tracked) | `memory.RepoFreshness` |
| **Memory explorer** (Architecture 4 docs 12.4KB, "128 runs", "240 runs · 99.1% pass", "fresh/2d/reindex") | real `.l00prite` file freshness badges per repo (present / fresh / stale / absent) | `memory.RepoFreshness` |
| **Live activity timeline** (Prompt submitted 21:04:02, "1,240 tokens from 8 files", Generating code 62%…) | **Removed** (no such per-step telemetry). Replaced by real ledger rows | `ledger` |
| **Notifications** (fake "142/142 tests passed", "DeepSeek degraded", "Cost cap 80%…", "ci-runner minted") | **Alerts** derived from real state (circuit open, cap ≥ 80%, missing key, stale memory) + real **audit log** | derived + `audit` table |
| User "Good evening, Jack" / "jackofall1232 · Owner · Admin", bell count "3", Security badge "2", node "core-node-01 v0.4.0" | real authenticated principal (`project`), real version, real "updated Ns ago"; fabricated counts/badges removed | authenticated token principal + `Version` |
| Token "ci-runner minted · scoped to 2 repos" | real tokens panel (id / project / repo / active|revoked / created) — never the secret | `tokens` table (`ListTokens`) |

**Pricing honesty:** unpriced/unconfirmed models (e.g. the mock upstream) show `$0.00?` with an
explicit "some unpriced" pricing note — the cost is *unbilled, not fabricated as free*. This reuses the
existing `cost_unconfirmed` ledger flag.

---

## 2. New / changed API endpoints

All are served by `internal/server` and handled in `internal/gateway`.

### Read

- `GET /v1/dashboard/summary` — **token-authenticated** (same Bearer token as `/v1/chat/completions`).
  Returns the whole operator snapshot (see `internal/gateway/dashboard.go`). Assembled entirely from
  real state; unwired values are omitted or flagged, never faked. Includes: `system`, `uptime`,
  `principal`, `providers[]`, `repos[]` (+ memory freshness), `tokens`, `spend` (+ caps + history),
  `activity[]` (ledger), `audit[]`, `alerts[]`.
- `GET /v1/setup/status` — unauthenticated, no secrets. `{setup_complete, vault_initialized,
  provider_count, active_token_count, next_step, network{…}}`. Safe to expose like `/healthz`.

### Setup (first-run only — see §4)

- `POST /v1/setup/vault` — initialize the vault master key (auto-generate, or accept a base64-32 key).
- `POST /v1/setup/provider/test` — validate a provider key with a **real** upstream call; stores nothing.
- `POST /v1/setup/provider` — validate-then-store a provider (same `INSERT` as CLI `provider add`).
- `POST /v1/setup/token` — mint the first token (same primitive as CLI `token mint`).

### Changed

- `GET /` now serves the **setup wizard** while unconfigured and the **dashboard** once setup completes.
- `serve` no longer aborts when the master key is missing — it boots into setup mode. Bind-safety
  (no non-loopback bind without TLS) is still fatal. (`config.BindProblems` / `config.MasterKeyPresent`.)
- CLI: `l00prite provider test <name>` — validates via the same `gateway.TestProviderKey` primitive the
  wizard uses.

---

## 3. Wizard UI: separate template (`public/setup.html`)

**Decision: a separate first-run template, not an extension of `dashboard.html`.** Rationale:

- The wizard and the dashboard have **opposite security contexts**: the wizard is reachable
  *unauthenticated but only pre-setup*; the dashboard is *authenticated but only post-setup*. Folding
  two lifecycles into one 900-line file would entangle them.
- The wizard is a small linear state machine over `POST /v1/setup/*`; the dashboard is a data-driven
  read view over `GET /v1/dashboard/summary`. They share a design language, not code.
- `GET /` picks which to serve from real setup state, so the split is invisible to the user.

The wizard steps (`public/setup.html`): Welcome → Vault (generate/own) → Provider (with a real
validate-before-save call) → Network (real bind/TLS/exposure explanation) → Token (shown once) → Done
(working base URL + token + copy-paste curl and a Claude-Code-style config snippet). On completion it
stores the minted token in `localStorage` and opens the dashboard, which then shows real data reflecting
exactly what was configured.

---

## 4. Security note — setup endpoints are locked after setup

`SetupComplete()` (`internal/gateway/setup.go`) is the single source of truth, derived from real state:
**vault initialized AND ≥1 provider AND ≥1 non-revoked token**. It is not a flag, so the CLI and the
wizard can never disagree.

- While `!SetupComplete()`: the setup mutating/action endpoints are reachable (this is unavoidable — the
  flow *creates* the first credential, so it cannot require one). Exposure is bounded by the fact that
  the server **refuses to bind a non-loopback address without TLS**, so first-run setup runs on a safe
  bind (loopback by default).
- The instant `SetupComplete()` becomes true: `setupGate` makes **every** mutating setup endpoint
  (`vault`, `provider`, `provider/test`, `token`) return `403 {code:"setup_complete"}` and perform no
  action. They are effectively disabled — there is no way to re-open them short of an explicit reset
  (removing the vault/providers/tokens, e.g. deleting the data dir).
- `GET /v1/setup/status` stays readable (booleans/counts only, no secrets), like `/healthz`.
- `GET /v1/dashboard/summary` requires a valid token in every state — including before setup.

This is covered by tests (`TestFirstRunWizardE2E` asserts 403 + no mutation on all four endpoints after
completion) and verified end-to-end against the real binary.

---

## 5. CLI ↔ wizard parity (one source of truth)

The wizard is a thin UI over the exact primitives the CLI uses — there is no second implementation:

| Action | Wizard endpoint | Same underlying primitive as CLI |
|---|---|---|
| Vault | `POST /v1/setup/vault` | `security.EnsureMasterKey` (`l00prite init`) |
| Validate key | `POST /v1/setup/provider/test` | `gateway.TestProviderKey` (`l00prite provider test`) |
| Add provider | `POST /v1/setup/provider` | same `INSERT INTO providers …` as `provider add` |
| Mint token | `POST /v1/setup/token` | `security.MintToken` (`token mint`) |

Verified: after completing the wizard in the browser, `l00prite provider list` / `token list` / `health`
show exactly what the wizard wrote, and a request made through the gateway appears in the dashboard's
real numbers on the next refresh.

---

## 6. Tests

- `internal/server/setup_test.go`
  - `TestFirstRunWizardE2E` — fresh install → wizard endpoints → working gateway → dashboard shows real
    data reflecting what was configured; setup endpoints locked (403) afterward.
  - `TestSetupProviderRealValidation` — a bad key is rejected and stored nowhere; a good key passes and
    is stored **encrypted** (round-trips through the vault); validated against a fake OpenAI-compatible
    upstream that authorizes only one key.
  - `TestSetupVaultAcceptsProvidedKey` — operator-supplied 32-byte key accepted; malformed key rejected.
- `internal/config/config_test.go`
  - `TestMasterKeyPresence` — master-key detection; a missing key is *not* a bind problem (setup mode).
  - `TestBindSafetyStaysFatal` — non-loopback bind without TLS stays fatal; `LOOPRITE_ALLOW_INSECURE_BIND`
    opt-in clears it.
