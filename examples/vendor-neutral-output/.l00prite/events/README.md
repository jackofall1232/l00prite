# Event Memory

Events are protocol objects that represent external or internal signals that may change the next loop of work. They are vendor-neutral records, not GitHub-bot commands.

Events may include:

- pull request review comments
- failed CI
- new issues
- security alerts
- merge conflicts
- human TODOs
- agent recommendations
- dependency update warnings

## Lifecycle

Each event should move through this lifecycle:

1. **Event** — capture the signal in a durable event file.
2. **Classify** — identify type, source, priority, validity, and whether human review is required.
3. **Plan** — choose the smallest safe response.
4. **Execute** — make only the changes required for that event.
5. **Verify** — run relevant checks before claiming resolution.
6. **Persist** — update `.l00prite/` memory, state, ledger, todos, and failures.
7. **Respond** — draft or post a response only when allowed.

Process one event per loop by default so review, verification, and memory updates stay focused.
