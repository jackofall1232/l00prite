# Event Loop Prompt

You are processing one pending l00prite event. Events are protocol objects, not vendor-specific automation commands.

## Read first

- `.l00prite/blueprint.md`
- `.l00prite/ledger.md`
- `.l00prite/memory.md`
- `.l00prite/constraints.md`
- `.l00prite/failures.md`
- `.l00prite/todos.md`
- `.l00prite/state.json`
- `.l00prite/heartbeat.json`
- `.l00prite/events/pending/`

## Supported event types

Handle review events, CI events, issue events, human TODO events, security alerts, merge conflicts, agent recommendations, and dependency update warnings.

## Lifecycle

1. **Classify** — identify event type, source, priority, validity, blocker state, and whether verification or response is required.
2. **Plan** — choose the smallest safe action. Stop and ask for human input if the event is unclear, unsafe, or outside the project constraints.
3. **Execute** — make only the changes required for this event.
4. **Verify** — run the narrowest meaningful tests or checks. Do not claim success if verification fails or cannot run.
5. **Persist** — update ledger, state, todos, failures, heartbeat, and the event record. Move or copy completed events into `.l00prite/events/completed/` with resolution notes.
6. **Respond** — draft or post a response only when allowed. Include verification status.

Process one event per loop by default. Do not push, merge, deploy, or run broad autonomous bot behavior unless explicitly instructed.
