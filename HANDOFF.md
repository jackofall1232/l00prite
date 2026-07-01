# HANDOFF

## Latest update: README repositioning and visual identity

This update does not change protocol behavior. It rewrites `README.md` to match how the protocol actually works today (vendor-neutral memory, heartbeat, resume loops, Codex, and the event engine), and adds a minimal visual identity.

### What changed

- **README repositioned**: restructured around the requested section set (What is l00prite? / Why it exists / What it does / What it does NOT do / Core idea / Repository layout / The `.l00prite` protocol / Claude usage / Codex usage / Event and PR review workflow / Safety boundary / Install-setup / Validation / Current maturity / Roadmap / Contributing / License). Content is drawn from the existing protocol files (`AGENTS.md`, prompts, templates, validator) rather than invented — no new capabilities are claimed that the repo doesn't already have.
- **SVG logo added**: `assets/l00prite-infinity.svg` — a simple infinity-loop path plus the wordmark, text/paths only, no external or remote assets, sized to render cleanly in a GitHub-rendered README at both default and dark themes (mid-tone purple/blue chosen for contrast on both).
- **ASCII art added**: a small ASCII banner near the top of `README.md`, inside a fenced code block so it renders literally in Markdown instead of being interpreted.
- **Install/setup wording**: reframed as explicitly manual — clone, copy `.claude/commands/build-loop.md` or use `.codex/prompts/` directly, copy `templates/` by hand if scaffolding without a prompt. No install script or package exists, and the README says so instead of implying one does.
- **Canonical URL**: left as an explicit `TODO` rather than guessing an org/repo URL, since none was confirmed as canonical at the time of writing.

### Remaining branding/documentation gaps

- No canonical repository URL is wired into the README (badges, clone URL, issue links) — needs a maintainer decision.
- The SVG logo is a single static asset; no light/dark `<picture>` variant is provided (GitHub's `img`-embedded SVG doesn't inherit page theme via `currentColor`, so a true theme-aware logo would need two separate SVG files swapped via `<picture>` + `prefers-color-scheme`, which was judged out of scope for this pass).
- No favicon/social-preview image exists yet for the repo itself (separate from the README logo).

## Latest update: event and review response protocol

This update adds protocol-level support for event-driven work without turning l00prite into an autonomous GitHub bot.

## What changed in this update

- Added an event engine protocol: `Event → Classify → Plan → Execute → Verify → Persist → Respond`.
- Added PR review response protocol so review comments are first-class events.
- Added Codex/CLI prompts for event-loop and review-response workflows.
- Added Claude prompt mirrors for event-loop and review-response workflows.
- Updated heartbeat behavior to prioritize blockers, failed CI, PR reviews, security alerts, human TODOs, and then normal roadmap work.
- Updated ledger and state templates with event fields.
- Updated README and agent guidance around review events, verification, and non-autonomous push/merge behavior.
- Updated the validator to check event templates, event prompts, event schema JSON, and event-aware ledger/state fields.
- Added event/review template examples to the vendor-neutral example output.

## Files added in this update

- `.codex/prompts/event-loop.md`
- `.codex/prompts/respond-to-review.md`
- `.claude/prompts/event-loop.md`
- `.claude/prompts/respond-to-review.md`
- `templates/codex/prompts/event-loop.md`
- `templates/codex/prompts/respond-to-review.md`
- `templates/l00prite/events/README.md`
- `templates/l00prite/events/example-event.json`
- `templates/l00prite/events/pending/README.md`
- `templates/l00prite/events/processing/README.md`
- `templates/l00prite/events/completed/README.md`
- `templates/l00prite/reviews/README.md`
- `templates/l00prite/reviews/github/README.md`
- `examples/vendor-neutral-output/.l00prite/events/README.md`
- `examples/vendor-neutral-output/.l00prite/events/example-event.json`
- `examples/vendor-neutral-output/.l00prite/events/pending/README.md`
- `examples/vendor-neutral-output/.l00prite/events/processing/README.md`
- `examples/vendor-neutral-output/.l00prite/events/completed/README.md`
- `examples/vendor-neutral-output/.l00prite/reviews/README.md`
- `examples/vendor-neutral-output/.l00prite/reviews/github/README.md`

## Files modified in this update

- `README.md`
- `AGENTS.md`
- `HANDOFF.md`
- `.codex/README.md`
- `.codex/prompts/build-loop.md`
- `.codex/prompts/heartbeat.md`
- `.claude/commands/build-loop.md`
- `scripts/validate-l00prite.js`
- `templates/codex/prompts/heartbeat.md`
- `templates/l00prite/ledger.md`
- `templates/l00prite/state.json`
- `examples/vendor-neutral-output/.l00prite/ledger.md`
- `examples/vendor-neutral-output/.l00prite/state.json`

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
- The validator is intentionally lightweight and does not parse every prompt for semantic consistency.
- Existing legacy example output remains Claude-focused; the new vendor-neutral example is separate.

## Recommended next steps

- Define optional event ingestion adapters without enabling automatic push, merge, or bot behavior by default.
- Expand examples with a filled PR review event and completed resolution notes.
- Consider validating generated prompts against all required `.l00prite/` files and event lifecycle steps.
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
