# l00prite CLI-OS

A self-hostable **control plane for AI coding**. It runs on your own server, exposes an
**OpenAI-compatible** endpoint so existing coding tools (Claude Code, Codex CLI, Aider,
OpenCode, IDEs, any OpenAI SDK) work unchanged, keeps provider keys server-side, routes across
LLM providers with explainable rules, injects repo-aware persistent memory, tracks **real**
cost per project, records a run ledger, and enforces safety limits on spend, retries,
destructive actions, stale context, and concurrent sessions.

**Not a proxy.** The OpenAI endpoint is the compatibility layer; the product is provider
abstraction + repo memory + routing + cost tracking + safety policy + run ledger + installable
server + CLI control surface + dashboard.

> **v1.1.0 — Go rewrite, runnable and tested.** A single statically-compiled Go binary (pure-Go
> SQLite via `modernc.org/sqlite`, no cgo — `CGO_ENABLED=0 go build` yields one static executable
> that `ldd` reports as "not a dynamic executable"). The full request path is covered by an offline
> test suite (`go test ./...`, 51 checks). See [`RELEASE.md`](RELEASE.md) and
> [`docs/node-to-go-port-notes.md`](docs/node-to-go-port-notes.md) for what is proven vs. what still
> needs a networked validation pass (live-provider round-trips, OpenAI/GLM pricing confirmation).

## Quickstart (local)

```bash
cd cli-os
./install/install.sh                    # builds the static ./l00prite binary, runs init

./l00prite provider add mock --adapter mock --default   # zero-key demo upstream
./l00prite token mint --project demo                    # prints a token (once)
./l00prite serve                                        # http://127.0.0.1:8787
```

Point any OpenAI-compatible tool at it:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
export OPENAI_API_KEY=<the l00prite token>
curl "$OPENAI_BASE_URL/chat/completions" \
  -H "authorization: Bearer $OPENAI_API_KEY" -H 'content-type: application/json' \
  -d '{"model":"demo","messages":[{"role":"user","content":"hello"}]}'
```

Swap the demo upstream for real providers:

```bash
./l00prite provider add anthropic --key sk-ant-... --default
./l00prite provider add openai    --key sk-...     --adapter openai-compat
./l00prite provider add glm        --key ...        --adapter openai-compat   # glm-5.2
./l00prite repo register myrepo --root /path/to/repo --project demo   # inject .l00prite memory
./l00prite cap set --project demo --daily 20                          # hard $/day cap
```

Open the **dashboard** at `http://127.0.0.1:8787/`.

## Quickstart (Docker)

```bash
cd cli-os
docker compose up --build            # seeds a demo mock provider on first run
# add real providers / tokens:
docker compose exec cli-os l00prite provider add anthropic --key sk-ant-... --default
docker compose exec cli-os l00prite token mint --project demo
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/chat/completions` | OpenAI-compatible chat (streaming + non-streaming); supports `auto:*` routing, bridging, and `x-l00prite-dry-run` route plans |
| GET  | `/v1/models` | List models across enabled providers (plus `auto:*` pseudo-models) |
| GET  | `/healthz` | Provider + circuit-breaker status, bridge state, auto profiles |
| GET  | `/` | Dashboard |

Per-request headers (optional): `x-l00prite-repo` (repo id for memory), `x-l00prite-route`
(`provider/model` pin **or** `auto:<profile>`), `x-l00prite-paths` (comma-separated files, for
memory ranking), `x-l00prite-bridge` (`on`/`off` — arm cross-provider delegation),
`x-l00prite-bridge-max-hops` (lower the hop cap for this request), `x-l00prite-dry-run` (`1` —
return the routing decision only, no spend).

### Auto-routing & bridging (multi-provider)

- **Auto-routing** — send `"model": "auto"` or `"auto:cheap"` / `"auto:quality"` / `"auto:balanced"`
  (or `x-l00prite-route: auto:<profile>`) to route to the **best / most-efficient** provider for the
  task: a capability filter (tools/vision/context) drops models that can't serve the request, then a
  preference scorer orders the rest by cost, quality, or a blend — deterministic and fully logged.
  Unpriced/unconfirmed models never win the "cheapest" slot. See
  [`docs/routing-auto-mode.md`](docs/routing-auto-mode.md).
- **Provider bridging** — with `x-l00prite-bridge: on`, the primary model gets an `l00prite_bridge`
  tool it can call to **delegate a sub-task to another provider** (e.g. Codex asks Claude). Executed
  server-side through the same router + budget, bounded by a hop cap, with the delegate's output
  wrapped as untrusted. Off by default. See [`docs/provider-bridging.md`](docs/provider-bridging.md).

## CLI (control plane)

```
l00prite init | serve | health
l00prite provider add <name> [--key K] [--adapter native-messages|openai-compat|mock] [--base URL] [--default]
l00prite provider list | default <name> | enable|disable|remove <name>
l00prite token mint --project P [--repo ID] [--expires DAYS] | token list | token revoke <id>
l00prite repo register <id> --root PATH [--project P] | repo list
l00prite cap set --project P --daily USD | cap list
l00prite route explain <request-id> | ledger [--limit N]
l00prite route plan <model|auto|auto:profile> [--task "..."] [--vision] [--tools] [--route P/M]
l00prite route profiles | bridge status
```

## How it works

Two decoupled tracks behind a typed, latency-bounded interface, with a cross-cutting policy
layer. Read the design docs for the full picture:

- [`docs/architecture.md`](docs/architecture.md) — two-track Gateway/Memory design, request
  lifecycle, the Policy Enforcement Point.
- [`docs/interface-contract.md`](docs/interface-contract.md) — `MemoryQuery`/`MemoryContext`.
- [`docs/provider-adapters.md`](docs/provider-adapters.md) — verified provider specs (incl.
  **GLM 5.2 confirmed real**), egress/pricing caveats.
- [`docs/routing-auto-mode.md`](docs/routing-auto-mode.md) — best-provider-per-task / most-efficient
  auto-routing (capability filter + preference scoring). · [`docs/provider-bridging.md`](docs/provider-bridging.md)
  — cross-provider delegation ("Codex asks Claude to use a tool").
- [`docs/routing-rules-v1.md`](docs/routing-rules-v1.md) · [`docs/security-model.md`](docs/security-model.md)
  · [`docs/v1-scope.md`](docs/v1-scope.md) · [`docs/open-questions.md`](docs/open-questions.md)

Safety posture (inherited from l00prite): safe-by-default, no auto-everything; **persisted flags
are never authorization** — cost/retry/destructive gates are enforced by a Policy Enforcement
Point over an atomic store, not by the request handler; repo memory is **untrusted input**,
wrapped in a non-instruction envelope before injection; concurrency uses atomic DB
leases/transactions, not cooperative file locks.

## Module layout

A single Go module (`go build ./cmd/l00prite` → one static binary). Ported from the original Node
tree (kept in git history); see [`docs/node-to-go-port-notes.md`](docs/node-to-go-port-notes.md).

```
cli-os/
  go.mod / go.sum                          # module: modernc.org/sqlite (pure-Go, only non-stdlib dep)
  cmd/l00prite/main.go                      # admin CLI (init/serve/provider/token/repo/cap/route/…)
  internal/
    config/config.go                        # config load + no-insecure-defaults validation
    util/util.go                            # ids, ISO time, constant-time compare, token estimate
    apierr/apierr.go                         # typed HTTP error carried through routing/upstream
    oai/oai.go                               # OpenAI wire shapes: Usage + chunk/response builders
    state/db.go                              # SQLite (WAL) transactional store; BEGIN IMMEDIATE tx
    security/vault.go                        # AES-256-GCM provider-key vault (Node-compatible format)
    security/tokens.go                       # opaque gateway tokens (hashed, constant-time via subtle)
    policy/pep.go                            # Policy Enforcement Point: caps, reservations, leases
    memory/memory.go                         # Track 2: retrieval/ranking + staleness + containment
    ledger/ledger.go                         # run ledger (sqlite + jsonl), incl. cost_unconfirmed
    server/server.go                         # HTTP(S) server + embedded dashboard + safe startup
    gateway/
      ingress.go                             # /v1/chat/completions (dry-run | bridge | stream | default)
      router.go                              # explainable routing + circuit breaker + opt-in auto tier
      routerauto.go                          # capability filter + preference scoring (auto:cheap|…)
      bridge.go                              # cross-provider delegation: l00prite_bridge + bounded loop
      turn.go                                # runTurn — one shared route→reserve→call→meter→commit
      upstream.go                            # provider-call helpers (net/http, retry, SSE parse)
      envelope.go                            # untrusted-content envelope w/ breakout guard
      meter.go                               # real-usage cost accounting (unpriced ⇒ unconfirmed, not $0)
      inject.go                              # untrusted-memory injection
      adapters/
        anthropic.go                         # native /v1/messages translator (SSE blocks -> chunks)
        openaicompat.go                      # OpenAI-shaped passthrough (OpenAI, GLM, DeepSeek, …)
        mock.go                              # zero-key demo upstream (bridge-aware test hooks)
        registry.go                          # adapter + manifest resolution (manifests embedded)
        manifests/*.json                     # per-provider base url, models, pricing, capabilities
    */(*_test.go)                            # unit + end-to-end (go test ./..., 51 checks)
  public/dashboard.html + embed.go           # served (embedded) control-plane dashboard
  install/ · Dockerfile · docker-compose.yml · .env.example
```
