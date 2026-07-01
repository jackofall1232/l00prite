# HANDOFF

## What changed

- Expanded l00prite from a Claude-only scaffold generator into a vendor-neutral loop memory protocol.
- Added Codex/CLI prompts for build, resume, heartbeat, handoff, event-loop, and review-response workflows.
- Added `.l00prite/` project memory templates for generated target projects.
- Added an event engine protocol: `Event → Classify → Plan → Execute → Verify → Persist → Respond`.
- Added PR review response protocol so review comments are first-class events.
- Updated heartbeat behavior to prioritize blockers, failed CI, PR reviews, security alerts, human TODOs, and then normal roadmap work.
- Updated ledger and state templates with event fields.
- Updated Claude build-loop behavior to generate shared memory and Codex prompts while preserving the non-execution boundary.
- Rewrote README documentation around the vendor-neutral protocol, cross-agent handoff model, and event/review workflow.
- Added repo-level `AGENTS.md` instructions for future AI agents and open PR review work.
- Added a lightweight validation script and vendor-neutral example output.

## Files added

- `AGENTS.md`
- `HANDOFF.md`
- `.codex/README.md`
- `.codex/prompts/build-loop.md`
- `.codex/prompts/resume-loop.md`
- `.codex/prompts/heartbeat.md`
- `.codex/prompts/event-loop.md`
- `.codex/prompts/respond-to-review.md`
- `.codex/prompts/handoff-summary.md`
- `.claude/prompts/event-loop.md`
- `.claude/prompts/respond-to-review.md`
- `templates/l00prite/blueprint.md`
- `templates/l00prite/ledger.md`
- `templates/l00prite/memory.md`
- `templates/l00prite/heartbeat.json`
- `templates/l00prite/constraints.md`
- `templates/l00prite/failures.md`
- `templates/l00prite/todos.md`
- `templates/l00prite/state.json`
- `templates/l00prite/sessions/README.md`
- `templates/l00prite/events/README.md`
- `templates/l00prite/events/example-event.json`
- `templates/l00prite/events/pending/README.md`
- `templates/l00prite/events/processing/README.md`
- `templates/l00prite/events/completed/README.md`
- `templates/l00prite/reviews/README.md`
- `templates/l00prite/reviews/github/README.md`
- `scripts/validate-l00prite.js`
- `templates/codex/prompts/resume-loop.md`
- `templates/codex/prompts/heartbeat.md`
- `templates/codex/prompts/handoff-summary.md`
- `examples/vendor-neutral-output/CLAUDE.md`
- `examples/vendor-neutral-output/README.md`
- `examples/vendor-neutral-output/.l00prite/*`

## Files modified

- `README.md`
- `AGENTS.md`
- `HANDOFF.md`
- `scripts/validate-l00prite.js`
- `templates/l00prite/ledger.md`
- `templates/l00prite/state.json`
- `.codex/prompts/heartbeat.md`
- `templates/codex/prompts/heartbeat.md`
- `.claude/commands/build-loop.md`

## Current architecture

l00prite now has four protocol layers:

1. **Scaffold layer** — Claude and Codex build-loop prompts create target project guidance, `.l00prite/` memory, and tiered skeleton files without executing implementation.
2. **Memory layer** — generated `.l00prite/` files persist blueprint, ledger, durable memory, constraints, failures, todos, heartbeat, state, events, reviews, and session-log conventions.
3. **Event layer** — pending protocol events can interrupt roadmap work and are processed through classify, plan, execute, verify, persist, and respond.
4. **Handoff layer** — resume, heartbeat, event, review-response, and handoff prompts let Claude, Codex, and other agents continue from shared files instead of vendor-specific hidden state.

## Remaining gaps

- l00prite now documents event-driven behavior but is not a full autonomous GitHub bot.
- No API ingestion exists yet for GitHub, CI providers, issue trackers, security tools, or dependency update services.
- Event movement is file-based and prompt-driven; future tooling may automate pending/processing/completed transitions.
- The target-project Codex prompt templates currently mirror the repo-level Codex prompts in part; future changes may split maintainer and generated prompt wording further if needed.
- The validator is intentionally lightweight and does not parse every prompt for semantic consistency.
- Existing legacy example output remains Claude-focused; the new vendor-neutral example is separate.

## Recommended next steps

- Add generated target-project copies of event-loop and review-response prompts if build-loop should scaffold them into every target repo.
- Define optional event ingestion adapters without enabling automatic push, merge, or bot behavior by default.
- Expand examples with a filled PR review event and completed resolution notes.
- Consider validating that generated prompts mention all required `.l00prite/` files and event lifecycle steps.
- Keep build-loop scaffold-only; do not turn it into an executor without a separate explicit design.

## Decisions made

- `.l00prite/` is the shared source of truth across all agents.
- Events are protocol objects, not vendor-specific features.
- PR reviews are first-class events.
- Verification must happen before response.
- Process one event per loop by default.
- Build-loop remains non-executing and scaffold-first.
- Heartbeat state is JSON for machine readability.
- Ledger remains Markdown for human readability and rich narrative context.
- Borderline scope should choose the smaller skeleton tier.
