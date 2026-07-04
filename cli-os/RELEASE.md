# l00prite CLI-OS v1.0.0 — release notes

A runnable, self-hostable v1 of the CLI-OS control plane. This document states plainly what is
proven and what still needs a networked validation pass, so "ready to ship" is an honest claim.

## What ships in v1.0.0

- **OpenAI-compatible gateway** — `POST /v1/chat/completions` (streaming + non-streaming),
  `GET /v1/models`, `GET /healthz`, and a served dashboard at `/`.
- **Provider adapters** — a real native Anthropic `/v1/messages` translator (system-as-field,
  `input_schema` tools, tool_use/tool_result, typed SSE events rebuilt into OpenAI chunk
  deltas) and an OpenAI-compatible passthrough covering OpenAI, GLM/Zhipu (`glm-5.2`), DeepSeek,
  Gemini's compat layer, Groq, Mistral, OpenRouter, and local Ollama/vLLM. A zero-key `mock`
  upstream lets a fresh install demo the whole path with no keys or network.
- **Explainable routing** — first-match rules (explicit pin → alias → model-owner → default →
  fallback) with a circuit breaker; every decision is logged and inspectable via
  `l00prite route explain`.
- **Real cost tracking** — usage is taken from provider responses (cache tokens included),
  priced from per-model manifests with separate input/output/cache rates; unknown/unconfirmed
  prices are recorded as `estimated` rather than fabricated.
- **Policy Enforcement Point** — daily $ caps enforced by atomic reserve→commit/refund over a
  SQLite (WAL) store, separate from the request handler; concurrency leases; retry cap.
- **Repo memory** — `.l00prite/` files ranked and injected within a token budget, with
  mtime-based staleness, graceful degradation, and an untrusted-content envelope
  (prompt-injection guard).
- **Security** — provider keys AES-256-GCM encrypted at rest under a server-only master key;
  opaque, hashed, revocable gateway tokens; least-privilege repo reads (containment check);
  safe-by-default startup (refuses non-loopback bind without TLS unless explicitly opted in;
  refuses to start without a master key).
- **Ops** — admin CLI, run ledger (SQLite + JSONL), audit log, one-command install, Dockerfile
  + compose.
- **Tests** — `npm test`: 12 checks covering the vault, tokens, PEP cap enforcement, the cost
  meter, Anthropic request + SSE translation, memory, and a full end-to-end server run (auth,
  routing, memory injection, streaming, 402 cost-cap) against the mock upstream. All pass.

## Decisions made (recorded from the open questions)

- **Runtime: Node.js, zero external dependencies** (was recommended as Go). Node runs and is
  fully testable in the build environment and matches the existing Node validator; `node:sqlite`
  gives real ACID with no dependency. `bin/cli.js` runs offline; `l00prite serve` is one command.
- **Providers in v1:** the adapter framework + Anthropic (native) + OpenAI-compatible (covers
  GLM 5.2 and the rest) + mock. Any OpenAI-compatible provider is a config add.
- **Routing "quality":** operator-assigned static rank in config; no ML.
- **`/v1/responses`:** deferred to v2 (chat/completions first).
- **Memory retrieval:** naive rank-and-select v1 (no embeddings); the interface makes it
  swappable without touching the gateway.

## Honest ship caveats (validate before trusting with real money at scale)

- **Live-provider round-trips were not executed here.** The build environment blocks egress to
  provider domains (openai.com, z.ai, etc. return 403). Adapter *translation* is unit-tested and
  the full pipeline is e2e-tested against the mock upstream, but a smoke test against real
  Anthropic/OpenAI/GLM keys must be run in a networked environment before production traffic.
- **Pricing:** Anthropic prices are first-party-confirmed; other providers' price maps ship with
  `null`/unconfirmed values (their first-party pricing pages were egress-blocked), so their cost
  is recorded as `estimated` until a confirmation pass fills the manifests.
- **Single-node.** SQLite WAL gives atomicity and cross-process safety on one host; multi-node/HA
  is v2. The PEP is a separate module (not a separate process) in v1.
- **Dashboard** (`public/dashboard.html`) is a static control-plane view with representative
  sample state; wiring it to live `/healthz`/ledger data is a small follow-up.
- **Deferred to v2:** `/v1/responses`, embedding retrieval, cross-repo memory scoping,
  multi-tenant RBAC, and prompt-cache-aware routing (all designed in `docs/`).

## Upgrade / run

`./install/install.sh` then `l00prite serve`, or `docker compose up --build`. See
[`README.md`](README.md).
