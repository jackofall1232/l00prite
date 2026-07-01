# Known Failures

Record failed approaches and why they should not be retried unless conditions change.

## Failed Approaches
- Documenting `status: "expired"` as a valid `lock.json` state without a rule permitting its
  acquisition/reclamation (fixed — see `LOCKING.md` rules 2 and 4, and `memory.md`).
- Telling an agent to stop on *any* active, unexpired lock, including one it already owns —
  this made an agent updating several protected files in one run block on its own first
  write. Fixed by scoping the "respect an active lock" rule to locks owned by a different
  agent/session (`LOCKING.md` rule 3).

## Blockers
- None currently active.
