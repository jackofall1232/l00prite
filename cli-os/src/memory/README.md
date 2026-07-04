# Track 2 — Repo Memory

Context reconstruction. Given a request + repo + budgets, selects *the right* context (a
retrieval/ranking problem, not just storage), handles staleness, and degrades gracefully to raw
context rather than confidently serving stale/wrong context.

Submodules: `retrieval/` (ranking + selection — naive v1, embeddings v2), `staleness/`
(mtime/hash, TTL, explicit invalidation), `store/` (built on the existing `.l00prite/` files +
a rebuildable derived index; the protocol files are the source of truth).

Design: [`../../docs/architecture.md`](../../docs/architecture.md) §2.2 ·
[`../../docs/interface-contract.md`](../../docs/interface-contract.md).

Memory answers **only** `MemoryQuery` and returns `MemoryContext` *blocks* — never a finished
prompt (the Gateway owns injection and untrusted-delimiting). It never reaches into Gateway
internals. This seam is what lets Memory evolve without touching the Gateway.
