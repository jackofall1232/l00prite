# Vendor-Neutral Example Output

This directory shows example files that l00prite generates into a target project during
Planning Mode. It is documentation only, not active repo state.

A generated project includes:

- `CLAUDE.md` — the project blueprint for Claude Code, carrying the fixed l00prite
  protocol section.
- `AGENTS.md` — the vendor-neutral operating guide, read natively by OpenAI Codex, Cursor,
  GitHub Copilot, Windsurf, Zed, Jules, Factory, Amp, opencode, Devin, and others.
- `.l00prite/` — shared memory, including `.l00prite/prompts/` with the canonical loop
  prompts (resume, heartbeat, event, review, handoff, execute) any agent can use.
- Vendor adapters for tools that need their own file: `GEMINI.md` (Gemini CLI), `QWEN.md`
  (Qwen Code), `CONVENTIONS.md` (Aider), `.github/copilot-instructions.md` (Copilot),
  `.cursor/rules/l00prite.mdc` (Cursor), `.windsurf/rules/l00prite.md` (Windsurf).

Any of these agents — plus GPT, Gemini, and future ones — can hand off to each other
through the same project intelligence layer.
