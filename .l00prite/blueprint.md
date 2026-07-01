# Project Blueprint

## Mission
l00prite is a vendor-neutral protocol that gives AI coding agents durable, file-based
project memory, so Claude, Codex, GPT, Gemini, or a future CLI agent can hand off work
across sessions using files in the repo instead of vendor-specific session state. This
`.l00prite/` folder is the protocol applied to l00prite's own repo.

## Architecture
See `CLAUDE.md` Section 2 for the authoritative description: scaffold layer
(`.claude/commands/build-loop.md`, `.codex/prompts/build-loop.md`), memory layer
(`templates/l00prite/`, `examples/vendor-neutral-output/`), event layer
(`events/pending|processing|completed`, event-loop prompts), and handoff layer
(resume-loop, heartbeat, respond-to-review, handoff-summary, mirrored for Claude and
Codex). Cutting across all four: the lock/lease convention in `LOCKING.md`/`lock.json`.

## Requirements
See `CLAUDE.md` Section 3 for the full, current requirements list.

## Definition of Done
See `CLAUDE.md` Section 4 for this release's Definition of Done.

## Non-Execution Boundary
Scaffolding tools generate files only; they do not execute the projects they scaffold.
Execution mode (see `CLAUDE.md` "Not yet built: execution mode" and `todos.md`) will be an
explicit, separately-reviewed opt-in addition — it does not exist yet.
