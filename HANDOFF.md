# HANDOFF

## What changed

- Expanded l00prite from a Claude-only scaffold generator into a vendor-neutral loop memory protocol.
- Added Codex/CLI prompts for build, resume, heartbeat, and handoff workflows.
- Added `.l00prite/` project memory templates for generated target projects.
- Updated Claude build-loop behavior to generate shared memory and Codex prompts while preserving the non-execution boundary.
- Rewrote README documentation around the vendor-neutral protocol and cross-agent handoff model.
- Added repo-level `AGENTS.md` instructions for future AI agents.
- Added a lightweight validation script and vendor-neutral example output.

## Files added

- `AGENTS.md`
- `HANDOFF.md`
- `.codex/README.md`
- `.codex/prompts/build-loop.md`
- `.codex/prompts/resume-loop.md`
- `.codex/prompts/heartbeat.md`
- `.codex/prompts/handoff-summary.md`
- `templates/l00prite/blueprint.md`
- `templates/l00prite/ledger.md`
- `templates/l00prite/memory.md`
- `templates/l00prite/heartbeat.json`
- `templates/l00prite/constraints.md`
- `templates/l00prite/failures.md`
- `templates/l00prite/todos.md`
- `templates/l00prite/state.json`
- `templates/l00prite/sessions/README.md`
- `scripts/validate-l00prite.js`
- `examples/vendor-neutral-output/CLAUDE.md`
- `examples/vendor-neutral-output/README.md`
- `examples/vendor-neutral-output/.l00prite/*`

## Files modified

- `README.md`
- `.claude/commands/build-loop.md`

## Current architecture

l00prite now has three protocol layers:

1. **Scaffold layer** — Claude and Codex build-loop prompts create target project guidance, `.l00prite/` memory, and tiered skeleton files without executing implementation.
2. **Memory layer** — generated `.l00prite/` files persist blueprint, ledger, durable memory, constraints, failures, todos, heartbeat, state, and session-log conventions.
3. **Handoff layer** — resume, heartbeat, and handoff prompts let Claude, Codex, and other agents continue from shared files instead of vendor-specific hidden state.

## Remaining gaps

- The Claude build-loop prompt describes generating `.codex/prompts/`, but there are no separate target-project templates for those prompts yet; it should copy/adapt the repo prompts directly for now.
- The validator is intentionally lightweight and does not parse every prompt for semantic consistency.
- Existing legacy example output remains Claude-focused; the new vendor-neutral example is separate.

## Recommended next steps

- Add explicit target-project Codex prompt templates if the repo needs generated prompts to differ from maintainer prompts.
- Expand examples with a fully filled sample `.l00prite/` for a realistic project.
- Consider validating that generated prompts mention all required `.l00prite/` files.
- Keep build-loop scaffold-only; do not turn it into an executor without a separate explicit design.

## Decisions made

- `.l00prite/` is the shared source of truth across all agents.
- Build-loop remains non-executing and scaffold-first.
- Heartbeat state is JSON for machine readability.
- Ledger remains Markdown for human readability and rich narrative context.
- Borderline scope should choose the smaller skeleton tier.
