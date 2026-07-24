# Vendor-Neutral Example Output

This directory shows example files that l00prite generates into a target project during
Planning Mode. It is documentation only, not active repo state.

A generated project puts the real payload under a single `l00prite/` folder at the repo
root, with thin discovery files at the paths each tool hardcodes:

- `l00prite/AGENTS.md` — the vendor-neutral operating guide (the real instructions).
- `l00prite/CLAUDE.md` — the project blueprint, carrying the fixed l00prite protocol
  section.
- `l00prite/.l00prite/` — shared memory, including `.l00prite/prompts/` with the canonical
  loop prompts (resume, heartbeat, event, review, handoff, execute) any agent can use.
- `l00prite/README.md` — a short human-facing explainer of the folder.
- Root pointer files for tools that discover at the repo root but can open other files:
  `AGENTS.md` (the AGENTS.md ecosystem — Codex, Cursor, Copilot, Windsurf, Zed, Jules,
  Factory, Amp, opencode, Devin, and others), `CLAUDE.md` (Claude Code), `GEMINI.md`
  (Gemini CLI, via `@./l00prite/AGENTS.md` import), `QWEN.md` (Qwen Code, same import),
  `CONVENTIONS.md` (Aider, via `--read`).
- Self-sufficient adapters at hardcoded dot-folder paths, carrying the six protocol rules
  inline: `.github/copilot-instructions.md` (Copilot), `.cursor/rules/l00prite.mdc`
  (Cursor), `.windsurf/rules/l00prite.md` (Windsurf), `.grok/GROK.md` (Grok CLI).

A real scaffold also writes the tier skeleton (`src/`, `tests/`, …), which is tier- and
stack-dependent, so no single copy would be representative — this example intentionally
omits it. The `l00prite/.l00prite/` memory files here are filled in for a small fictional
project (`example-project`, an RSS daily-digest CLI) so you can see what a freshly planned
project looks like.

Any of these agents — plus GPT, Gemini, and future ones — can hand off to each other
through the same project intelligence layer.
