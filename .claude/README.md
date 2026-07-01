# Claude Prompts for l00prite

These prompts mirror the Codex workflow for use directly with Claude Code (or any
Claude-based session) against a l00prite-managed project, instead of relying on `CLAUDE.md`
prose alone.

- `prompts/resume-loop.md` resumes implementation from `.l00prite/` memory.
- `prompts/heartbeat.md` checks whether the loop should continue, pause, or stop, including whether events should preempt roadmap work.
- `prompts/event-loop.md` processes one pending event through classify, plan, execute, verify, persist, and respond.
- `prompts/respond-to-review.md` handles one PR review event and drafts a verified reviewer response.
- `prompts/handoff-summary.md` prepares a cross-agent handoff summary.

All agents should treat `.l00prite/` as the shared source of truth and check
`.l00prite/lock.json` before mutating protected memory files.
