# Heartbeat Prompt

You are performing a l00prite heartbeat check. Do not implement features during this check.

## Read first

- `.l00prite/blueprint.md`
- `.l00prite/ledger.md`
- `.l00prite/todos.md`
- `.l00prite/state.json`
- `.l00prite/heartbeat.json`
- `.l00prite/lock.json`
- `.l00prite/events/pending/`
- `.l00prite/events/processing/`

## Checks

Determine:

1. Is the project complete according to the blueprint and completion criteria?
2. Is the current run blocked?
3. Are there pending events?
4. Are there failed CI events?
5. Are there PR review events?
6. Is human review required by a gate, event, or stop condition?
7. Should the next loop process an event before normal roadmap work?
8. Has `current_iteration` reached or exceeded `max_iterations`?
9. Is `.l00prite/lock.json` currently `active` and not expired, and if so, who owns it?
10. Should the next loop continue, pause, or stop?

## Precedence rules

When signals disagree, resolve in this order:

1. An active, non-expired lock held by another agent wins over any recommendation to
   continue — recommend `pause` until it is released or expires.
2. `state.json.blocked: true` wins over `heartbeat.json.should_continue`.
3. Human review gates win over normal roadmap work.
4. Failed CI / PR review / other blocker-priority events outrank normal roadmap tasks.

## Priority order

When recommending the next loop, prioritize:

1. blockers
2. failed CI
3. PR review comments
4. security alerts
5. human TODOs
6. normal roadmap tasks

## Required output and updates

- If you need to write `heartbeat.json`/`state.json` below, follow the lock rules in
  `LOCKING.md` first: acquire if unlocked, respect an active unexpired lock, reclaim and log
  a stale one, release before stopping.
- Update `.l00prite/heartbeat.json` with last_run_time, completion_status, current_iteration if appropriate, should_continue, and pause_reason.
- Update `.l00prite/state.json` with pending_event_count, active_event_id, last_event_processed, review_response_required, ci_status, and next_recommended_action when known.
- If status changed, update `.l00prite/state.json` consistently.
- Produce a short status report: `continue`, `pause`, or `stop`, plus the reason and next recommended action.
- If events should come first, recommend `.codex/prompts/event-loop.md`, `.codex/prompts/respond-to-review.md`, or the equivalent agent prompt.
- Release the lock before stopping if you acquired one.
