# `.l00prite/` Memory Protocol

This folder is the shared, file-based memory for a project using l00prite. Any agent —
Claude, Codex, GPT, Gemini, or a future agent — should treat these files as the source of
truth for project state, and update them before stopping.

## Files

| File | Purpose |
|------|---------|
| `blueprint.md` | Mission, architecture, requirements, and definition of done for the project. |
| `ledger.md` | Rich, human-readable run history, including evidence-backed verification. |
| `memory.md` | Durable decisions and facts only. |
| `heartbeat.json` | Machine-readable loop control. |
| `constraints.md` | Hard rules, user preferences, security boundaries. |
| `failures.md` | Approaches that already failed. |
| `todos.md` | Prioritized next actions. |
| `state.json` | Current machine-readable state. |
| `lock.json` | Lock/lease for safe mutation of protected memory files — see `LOCKING.md`. |
| `events/` | Pending, processing, and completed events. |
| `reviews/` | Review-specific records. |
| `sessions/` | Session log conventions. |

## Precedence rules

When signals disagree, resolve in this order:

1. **An active, non-expired lock wins over all mutation attempts.** If `lock.json` shows
   `status: "active"` and `expires_at` is in the future and you are not the owner, do not
   write to any protected path — see `LOCKING.md`.
2. **Blocked state wins over "should continue."** If `state.json.blocked` is `true`, that
   overrides `heartbeat.json.should_continue`, even if `should_continue` is `true`. Resolve
   the block before continuing roadmap work.
3. **Human review gates win over normal roadmap work.** If a `heartbeat.json`
   `human_review_gates` condition applies, stop and wait for review rather than continuing.
4. **Failed CI or review-blocker events outrank normal roadmap tasks.** Process pending
   blocker-priority events (failed CI, PR review requests, security alerts) before picking
   up the next `todos.md` item — see the priority order in `heartbeat.md`.

## Not a distributed system

This protocol is a set of file conventions and agent instructions, not a database with
transactions. It works well for one agent at a time, and reduces — but does not eliminate —
risk when multiple agents operate close together in time. See `LOCKING.md` for the
lock/lease convention and its limits.
