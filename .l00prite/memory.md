# Project Memory

Durable project facts and decisions that future agents should preserve.

## Decisions
- `.l00prite/` is the shared source of truth across all agents.
- Events are protocol objects, not vendor-specific features.
- PR reviews are first-class events.
- Verification must happen before response.
- Process one event per loop by default.
- Build-loop remains non-executing and scaffold-first; execution mode will be a separate,
  explicitly opt-in addition (`--execute` flag), not a change to the default.
- Heartbeat state is JSON for machine readability; the ledger stays Markdown for
  human-readable narrative context.
- Borderline scaffold scope should choose the smaller complexity tier.
- Lock/lease `status: "expired"` is acquirable/reclaimable the same way a stale `active`
  lock is — this was a documented gap (found by Codex during PR review) fixed by making
  both the acquire rule and the stale-lock-recovery rule in `LOCKING.md` explicitly cover
  `expired`.
- No change to `.claude/commands/build-loop.md` or `scripts/validate-l00prite.js` without
  stopping for human review first.

## Facts
- l00prite ships no backend, hosted service, or install script; setup is manual (clone,
  copy prompts/templates).
- Claude and Codex have prompt parity: resume-loop, heartbeat, event-loop,
  respond-to-review, and handoff-summary all exist for both.
- `scripts/validate-l00prite.js` has no external dependencies and checks structural/protocol
  invariants, not full semantic correctness.

## Avoid
- Do not store random temporary notes, speculative ideas, or stale debugging output here.
