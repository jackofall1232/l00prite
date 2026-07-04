# l00prite CLI-OS

> **Status: design + module layout under maintainer review.** This subtree contains the
> architecture for turning l00prite from a scaffold-only memory protocol into a self-hostable
> **control plane for AI coding**. No runtime implementation has landed yet beyond the example
> provider manifests that validate the adapter approach. Read
> [`docs/architecture.md`](docs/architecture.md) first, then
> [`docs/open-questions.md`](docs/open-questions.md) — several product decisions are pending.

l00prite CLI-OS runs on a user-controlled server. It exposes OpenAI-compatible endpoints so
existing coding tools (Claude Code, Codex CLI, Aider, OpenCode, IDEs) work unchanged, manages
provider keys server-side, routes across LLM providers with explainable rules, injects
repo-aware persistent memory, tracks real cost/usage per project, records run ledgers, and
enforces safety limits on retries, spend, destructive actions, stale context, and concurrent
sessions.

**Not a proxy.** The OpenAI-compatible endpoint is the compatibility layer; the product is
provider abstraction + repo memory + routing + cost tracking + safety policy + run ledgers +
installable server + CLI/admin surface (+ future dashboard).

The intended developer flow: clone → one install command → add provider keys → register repos →
point a coding tool at the l00prite endpoint → switch providers by config/flag/dashboard →
keep memory, cost tracking, logs, and history across sessions.

## Why it lives in `cli-os/`

l00prite today is a prompt-file protocol (Markdown + JSON + a dependency-free Node validator).
CLI-OS is greenfield runtime code that takes real dependencies, so it lives in its own subtree,
leaving the protocol files and `scripts/validate-l00prite.js` untouched (validator still passes).

## Docs

| Doc | What |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Two-track design, request lifecycle, safety/PEP, module boundaries |
| [`docs/interface-contract.md`](docs/interface-contract.md) | `MemoryQuery` / `MemoryContext` — the Gateway↔Memory seam |
| [`docs/provider-adapters.md`](docs/provider-adapters.md) | Verified provider specs (incl. **GLM 5.2 confirmed real**), egress/pricing caveats |
| [`docs/routing-rules-v1.md`](docs/routing-rules-v1.md) | Explainable (non-ML) routing rules |
| [`docs/security-model.md`](docs/security-model.md) | Key storage, auth, least-privilege file access, no insecure defaults |
| [`docs/v1-scope.md`](docs/v1-scope.md) | v1 (ships) vs v2 (deferred), with the cut line justified |
| [`docs/open-questions.md`](docs/open-questions.md) | Assumptions + decisions needed before implementation |

## Proposed module layout

```
cli-os/
  README.md                     # this file
  docs/                         # the architecture + decision docs above
  src/
    gateway/                    # Track 1: routing + compatibility layer
      ingress/                  # OpenAI-compat HTTP handlers (chat/completions, models)
      auth/                     # token verify, principal resolution
      router/                   # explainable rules + decision log
      adapters/                 # one dir per provider + shared base
        anthropic/              #   full native /v1/messages adapter
        openai/                 #   native schema (+ optional /v1/responses)
        _manifests/             #   per-provider JSON: base url, models, pricing, capabilities
      retry/                    # idempotency-aware backoff + circuit breaker
      meter/                    # real-usage cost accounting (provider usage > estimate)
    memory/                     # Track 2: context reconstruction
      retrieval/                # ranking + selection (naive v1, embeddings v2)
      staleness/                # invalidation (mtime/hash, TTL, explicit)
      store/                    # .l00prite/-backed store + rebuildable index
    policy/                     # PEP: caps, gates, atomic spend reservations
    state/                      # transactional store (SQLite WAL v1), leases
    ledger/                     # run ledger + usage DB writer
    cli/                        # admin surface (keys, tokens, repos, route explain, caps)
    config/                     # typed config load/validate (no insecure defaults)
  test/
    adapters/                   # per-provider conformance suites (recorded fixtures)
    interface/                  # MemoryQuery/MemoryContext contract tests
    safety/                     # cap / retry / gate enforcement tests
  install/                      # one-command install (script + optional container)
```

The runtime **language is an open question** ([`docs/open-questions.md`](docs/open-questions.md)
Q3); the layout is language-agnostic. `src/gateway/adapters/_manifests/*.json` are populated now
as concrete, verified examples that validate the manifest-driven adapter approach.

## Safety posture (inherited from l00prite)

- Safe-by-default; no "auto-everything." Costly/destructive actions have explicit stop
  conditions.
- **Persisted flags are never authorization** — cost/retry/destructive-action gates are enforced
  by a Policy Enforcement Point *outside* the process that would benefit from ignoring them.
- Repo memory (PR comments, issues, logs) is **untrusted input**, never instructions.
- Concurrency uses **atomic** leases/transactions, not cooperative file locks, for anything
  money- or memory-affecting.
