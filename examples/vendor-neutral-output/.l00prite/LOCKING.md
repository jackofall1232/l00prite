# Lock and Lease Protocol

`.l00prite/lock.json` is a lightweight, file-based mutual-exclusion convention for agents
writing to shared `.l00prite/` memory. It is a cooperative protocol enforced by agent
instructions, not a real distributed lock — see "What this does not guarantee" below.

## Fields

- `schema_version` — integer, protocol version of this lock file.
- `lock_id` — unique id for the current/last lock (`null` when unlocked).
- `owner_agent` — name/identifier of the agent holding the lock (e.g. `claude`, `codex`).
- `owner_session` — session/run identifier of the lock holder.
- `acquired_at` — ISO 8601 timestamp the lock was acquired.
- `expires_at` — ISO 8601 timestamp the lock expires (`acquired_at` + `ttl_seconds`).
- `ttl_seconds` — how long the lock is valid before it is considered stale.
- `purpose` — short human-readable reason for the lock (e.g. `resume-loop step 4`,
  `event-loop processing event-...`).
- `protected_paths` — the memory files/folders this lock guards.
- `status` — one of `unlocked`, `active`, `released`, `expired`.

## Protected paths

A lock protects: `ledger.md`, `memory.md`, `state.json`, `heartbeat.json`, `failures.md`,
`todos.md`, `events/`, `reviews/`, `sessions/`.

`blueprint.md`, `constraints.md`, `lock.json` itself, and this document are not protected —
they change rarely and reading them is always safe.

## Rules

1. **Check before writing.** Before mutating any protected path, an agent must read
   `lock.json`.
2. **Acquire if unlocked.** If `status` is `unlocked` or `released`, the agent may acquire
   the lock: set `status: "active"`, a new unique `lock_id`, `owner_agent`/`owner_session`
   to itself, `acquired_at` to now, `expires_at` to `acquired_at` + `ttl_seconds`, and
   `purpose` to what it's about to do.
3. **Respect an active lock.** If `status` is `active` and `expires_at` is in the future,
   and you are not the owner, do not write to any protected path. Treat the lock as a
   blocker and stop or wait instead of proceeding.
4. **Stale-lock recovery.** If `status` is `active` but `expires_at` has passed, the lock is
   stale — its owner likely crashed or was interrupted. An agent may reclaim it (acquire as
   in rule 2), but **must** record a `ledger.md` entry noting the reclaimed `lock_id`, its
   prior owner, and why it was judged stale (the expired timestamp).
5. **Release before stopping.** Before ending a run, the agent holding the lock must set
   `status` back to `released` and clear `owner_agent`/`owner_session`/`purpose`.
6. **TTL prevents deadlock.** `ttl_seconds` guarantees a crashed or abandoned lock becomes
   reclaimable rather than permanently blocking every other agent.

## What this does not guarantee

This is a cooperative convention, not filesystem-level locking. Two agents writing at the
exact same instant can still race past each other before either one reads the lock file. It
meaningfully reduces the odds of silent memory corruption for sequential and
loosely-concurrent handoff; it is not a substitute for real distributed-lock guarantees.
