# Resume Loop Prompt

You are resuming a l00prite-managed project. Treat `.l00prite/` as the shared source of truth across Claude, Codex, GPT, Gemini, and future agents.

## Required context read

Before changing files, read:

- `.l00prite/blueprint.md`
- `.l00prite/ledger.md`
- `.l00prite/memory.md`
- `.l00prite/constraints.md`
- `.l00prite/failures.md`
- `.l00prite/todos.md`
- `.l00prite/state.json`
- `.l00prite/heartbeat.json`

## Required loop behavior

1. State your understanding of the current project, current goal, status, blocker state, and next recommended action.
2. State what you will **not** retry, based on `.l00prite/failures.md` and ledger do-not-retry notes.
3. Check heartbeat limits before implementation. Stop if blocked, human review is required, completion is already reached, or max iterations are reached.
4. Pick the next smallest useful step from `.l00prite/todos.md` or `.l00prite/state.json`.
5. Execute only that step. Do not expand scope without human approval.
6. Verify the step with the smallest meaningful test/check available.
7. Update `.l00prite/ledger.md` with goal, completed work, changed files, tests run, failures, decisions, confidence, next action, and do-not-retry notes.
8. Update `.l00prite/state.json` with current goal, phase, active/last agent, last_updated, status, blocked, blocker_reason, and next_recommended_action.
9. Update `.l00prite/todos.md` to reflect completed and next work.
10. Update `.l00prite/failures.md` if anything failed or should not be retried.
11. Update `.l00prite/heartbeat.json` before stopping.

Stop after the chosen step and memory updates. Every loop must update memory before stopping.
