# Track 1 — Gateway

Routing + compatibility layer. Turns an OpenAI-shaped request into a provider-native call and
back, while enforcing safety (via the PEP in `../policy/`) and recording cost (`meter/`).

Submodules: `ingress/` (OpenAI-compat HTTP), `auth/` (token → principal), `router/` (explainable
rules + decision log), `adapters/` (per-provider translation + `_manifests/`), `retry/`
(idempotency-aware backoff + circuit breaker), `meter/` (real-usage cost accounting).

Design: [`../../docs/architecture.md`](../../docs/architecture.md) §2.1, §7 ·
[`../../docs/routing-rules-v1.md`](../../docs/routing-rules-v1.md) ·
[`../../docs/provider-adapters.md`](../../docs/provider-adapters.md).

The Gateway talks to the Memory track **only** through `MemoryQuery`/`MemoryContext`
([`../../docs/interface-contract.md`](../../docs/interface-contract.md)) and never imports
Memory internals.
