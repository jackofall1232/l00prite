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

> **v1.0.0 — runnable and tested.** Zero external npm dependencies (Node ≥ 22 built-ins only:
> `http`/`fetch`/`crypto`/`node:sqlite`). The full request path is covered by an offline
> end-to-end test suite (`npm test`, 12 checks). See [`RELEASE.md`](RELEASE.md) for what is
> proven vs. what still needs a networked validation pass (live-provider round-trips, first-party
> pricing confirmation).

## Quickstart (local)

```bash
cd cli-os
./install/install.sh                                   # checks Node 22+, runs init

node bin/cli.js provider add mock --adapter mock --default   # zero-key demo upstream
node bin/cli.js token mint --project demo                    # prints a token (once)
node bin/cli.js serve                                        # http://127.0.0.1:8787
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
node bin/cli.js provider add anthropic --key sk-ant-... --default
node bin/cli.js provider add openai    --key sk-...     --adapter openai-compat
node bin/cli.js provider add glm        --key ...        --adapter openai-compat   # glm-5.2
node bin/cli.js repo register myrepo --root /path/to/repo --project demo   # inject .l00prite memory
node bin/cli.js cap set --project demo --daily 20                          # hard $/day cap
```

Open the **dashboard** at `http://127.0.0.1:8787/`.

## Quickstart (Docker)

```bash
cd cli-os
docker compose up --build            # seeds a demo mock provider on first run
# add real providers / tokens:
docker compose exec cli-os node bin/cli.js provider add anthropic --key sk-ant-... --default
docker compose exec cli-os node bin/cli.js token mint --project demo
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/chat/completions` | OpenAI-compatible chat (streaming + non-streaming) |
| GET  | `/v1/models` | List models across enabled providers |
| GET  | `/healthz` | Provider + circuit-breaker status |
| GET  | `/` | Dashboard |

Per-request headers (optional): `x-l00prite-repo` (repo id for memory), `x-l00prite-route`
(`provider/model` pin), `x-l00prite-paths` (comma-separated files, for memory ranking).

## CLI (control plane)

```
l00prite init | serve | health
l00prite provider add <name> [--key K] [--adapter native-messages|openai-compat|mock] [--base URL] [--default]
l00prite provider list | default <name> | enable|disable|remove <name>
l00prite token mint --project P [--repo ID] [--expires DAYS] | token list | token revoke <id>
l00prite repo register <id> --root PATH [--project P] | repo list
l00prite cap set --project P --daily USD | cap list
l00prite route explain <request-id> | ledger [--limit N]
```

## How it works

Two decoupled tracks behind a typed, latency-bounded interface, with a cross-cutting policy
layer. Read the design docs for the full picture:

- [`docs/architecture.md`](docs/architecture.md) — two-track Gateway/Memory design, request
  lifecycle, the Policy Enforcement Point.
- [`docs/interface-contract.md`](docs/interface-contract.md) — `MemoryQuery`/`MemoryContext`.
- [`docs/provider-adapters.md`](docs/provider-adapters.md) — verified provider specs (incl.
  **GLM 5.2 confirmed real**), egress/pricing caveats.
- [`docs/routing-rules-v1.md`](docs/routing-rules-v1.md) · [`docs/security-model.md`](docs/security-model.md)
  · [`docs/v1-scope.md`](docs/v1-scope.md) · [`docs/open-questions.md`](docs/open-questions.md)

Safety posture (inherited from l00prite): safe-by-default, no auto-everything; **persisted flags
are never authorization** — cost/retry/destructive gates are enforced by a Policy Enforcement
Point over an atomic store, not by the request handler; repo memory is **untrusted input**,
wrapped in a non-instruction envelope before injection; concurrency uses atomic DB
leases/transactions, not cooperative file locks.

## Module layout

```
cli-os/
  bin/cli.js                     # launcher (applies warning suppression, imports src/cli-main.js)
  src/
    cli-main.js                  # admin CLI implementation
    config.js                    # config load + no-insecure-defaults validation
    server.js                    # HTTP(S) server + static dashboard
    state/db.js                  # node:sqlite (WAL) transactional store
    security/vault.js            # AES-256-GCM provider-key vault
    security/tokens.js           # opaque gateway tokens (hashed, constant-time)
    policy/pep.js                # Policy Enforcement Point: caps, reservations, leases
    gateway/
      ingress.js                 # /v1/chat/completions pipeline (stream + non-stream)
      router.js                  # explainable routing + circuit breaker
      meter.js                   # real-usage cost accounting
      inject.js                  # untrusted-memory injection
      adapters/
        anthropic.js             # native /v1/messages translator (SSE blocks -> chunks)
        openaiCompat.js          # OpenAI-shaped passthrough (OpenAI, GLM, DeepSeek, Groq, …)
        mock.js                  # zero-key demo upstream
        registry.js              # adapter + manifest resolution
        _manifests/*.json        # per-provider base url, models, pricing, capabilities
    memory/memory.js             # Track 2: retrieval/ranking + staleness + degradation
    ledger/ledger.js             # run ledger (sqlite + jsonl)
    util.js
  public/dashboard.html          # served control-plane dashboard
  test/*.test.js                 # unit + end-to-end (node:test)
  install/ · Dockerfile · docker-compose.yml · .env.example
```
