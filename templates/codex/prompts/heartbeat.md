# Heartbeat Prompt

You are performing a l00prite heartbeat check. Do not implement features during this check.

## Read first

- `.l00prite/blueprint.md`
- `.l00prite/ledger.md`
- `.l00prite/todos.md`
- `.l00prite/state.json`
- `.l00prite/heartbeat.json`

## Checks

Determine:

1. Is the project complete according to the blueprint and completion criteria?
2. Is the current run blocked?
3. Has `current_iteration` reached or exceeded `max_iterations`?
4. Is human review required by a gate or stop condition?
5. Should the next loop continue, pause, or stop?

## Required output and updates

- Update `.l00prite/heartbeat.json` with last_run_time, completion_status, current_iteration if appropriate, should_continue, and pause_reason.
- If status changed, update `.l00prite/state.json` consistently.
- Produce a short status report: `continue`, `pause`, or `stop`, plus the reason and next recommended action.
