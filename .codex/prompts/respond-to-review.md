# Respond to Review Prompt

You are responding to one review-related l00prite event. Treat `.l00prite/` as the shared source of truth across agents.

## Read first

- `.l00prite/blueprint.md`
- `.l00prite/ledger.md`
- `.l00prite/memory.md`
- `.l00prite/constraints.md`
- `.l00prite/failures.md`
- `.l00prite/todos.md`
- `.l00prite/state.json`
- pending events from `.l00prite/events/pending/`

## Workflow

1. Identify PR review comments or review-related events.
2. Pick one review event only, unless explicitly told to continue.
3. Classify the review item as valid, already fixed, unclear, unsafe, or not actionable.
4. If valid, plan and implement the smallest safe fix that resolves the review item.
5. If already fixed, unclear, unsafe, or not actionable, explain why and avoid unrelated changes.
6. Run relevant tests or checks before claiming resolution.
7. Update `.l00prite/ledger.md` with the triggering event, reviewer/comment reference, decision, fix implemented, tests run, response drafted or sent, and event status.
8. Move or copy the event to `.l00prite/events/completed/` with resolution notes after verification, or update state/todos/failures if blocked.
9. Update `.l00prite/todos.md`, `.l00prite/state.json`, and `.l00prite/failures.md` as needed.
10. Draft a concise response to the reviewer. Post or push only when explicitly allowed.
11. Stop after one review event unless explicitly told to continue.

## Must not

- Do not blindly agree with incorrect reviewer comments.
- Do not make unrelated refactors.
- Do not hide failed tests or skipped checks.
- Do not mark an event complete without verification.
- Do not push or merge unless explicitly instructed.
