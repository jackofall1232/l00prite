# Heartbeat Prompt

You are performing a l00prite heartbeat check. Do not implement features during this check.

## Read first

- `.l00prite/blueprint.md`
- `.l00prite/ledger.md`
- `.l00prite/todos.md`
- `.l00prite/state.json`
- `.l00prite/heartbeat.json`
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
9. Should the next loop continue, pause, or stop?

## Priority order

When recommending the next loop, prioritize:

1. blockers
2. failed CI
3. PR review comments
4. security alerts
5. human TODOs
6. normal roadmap tasks

## Required output and updates

- Update `.l00prite/heartbeat.json` with last_run_time, completion_status, current_iteration if appropriate, should_continue, and pause_reason.
- Update `.l00prite/state.json` with pending_event_count, active_event_id, last_event_processed, review_response_required, ci_status, and next_recommended_action when known.
- If status changed, update `.l00prite/state.json` consistently.
- Produce a short status report: `continue`, `pause`, or `stop`, plus the reason and next recommended action.
- If events should come first, recommend `.codex/prompts/event-loop.md`, `.codex/prompts/respond-to-review.md`, or the equivalent agent prompt.
