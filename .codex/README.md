# Codex Prompts for l00prite

These prompts mirror the Claude workflow without relying on Claude slash-command behavior. Copy a prompt into a Codex or CLI-agent session from the appropriate repository.

- `prompts/build-loop.md` scaffolds a new target project blueprint and `.l00prite/` memory folder, then stops.
- `prompts/resume-loop.md` resumes implementation from `.l00prite/` memory.
- `prompts/heartbeat.md` checks whether the loop should continue, pause, or stop, including whether events should preempt roadmap work.
- `prompts/event-loop.md` processes one pending event through classify, plan, execute, verify, persist, and respond.
- `prompts/respond-to-review.md` handles one PR review event and drafts a verified reviewer response.
- `prompts/handoff-summary.md` prepares a cross-agent handoff summary.

All agents should treat `.l00prite/` as the shared source of truth.
