# AGENTS.md

## Project Mission

l00prite is a vendor-neutral persistent loop memory protocol for AI coding agents. It scaffolds project blueprints, agent guidance, skeleton files, and `.l00prite/` shared memory so Claude, Codex, GPT, Gemini, and future CLI agents can hand off work safely across sessions.

## Safety Boundary

- l00prite scaffolds; it does not build.
- Do not execute generated blueprints, install dependencies, run builds, or start implementation loops unless the user explicitly asks for that separate action.
- Never remove the non-execution boundary from build-loop behavior.
- Existing files must not be silently overwritten.

## Protocol Rules

- Keep prompts vendor-neutral when possible.
- Preserve compatibility with Claude and Codex.
- Use `.l00prite/` as shared project memory for generated projects.
- Every implementation loop must update memory before stopping.
- Update relevant docs, examples, templates, and validation checks when changing protocol behavior.
- Avoid false precision about token or dollar costs.
- Prefer the smaller complexity tier when project scope is borderline.
