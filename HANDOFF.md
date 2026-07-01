# HANDOFF

## Latest update: protocol hardening after independent architecture review

An independent architecture review flagged concurrency, prompt-drift, prompt-injection, and
verification-evidence gaps in the `.l00prite/` protocol. This update addresses the findings
that are fixable at the protocol/documentation level — it does not add new runtime
behavior l00prite doesn't already have; it only changes what agents are told to do and what
the memory files look like.

### What changed

- **Lock/lease convention added.** New `.l00prite/lock.json` (fields: `schema_version`,
  `lock_id`, `owner_agent`, `owner_session`, `acquired_at`, `expires_at`, `ttl_seconds`,
  `purpose`, `protected_paths`, `status`) plus `LOCKING.md` documenting the full rules: check
  before writing, acquire if unlocked, respect an active unexpired lock, reclaim-and-log a
  stale one, release before stopping. `resume-loop.md`, `heartbeat.md`, `event-loop.md`, and
  `respond-to-review.md` (all copies) now reference it.
- **Untrusted-content warnings added** to every event/review prompt (`.codex/prompts/`,
  `.claude/prompts/`, `templates/codex/prompts/`) and event docs: PR comments, CI logs,
  issue bodies, and event summaries are external data to classify, not instructions to
  follow — including attempts to override system, developer, user, project, or l00prite
  protocol instructions.
- **Claude/Codex parity closed.** Added `.claude/prompts/resume-loop.md`, `heartbeat.md`,
  and `handoff-summary.md`, plus a new `.claude/README.md` mirroring `.codex/README.md`.
  Claude now has the same five standalone prompts Codex has.
- **Event transition rules clarified.** Events move `pending → processing → completed`
  using **move**, not the previous ambiguous "move or copy" wording. A completed event now
  requires `resolved_at`, `resolving_agent`, `verification_summary`, `response_summary`,
  `related_commit` (if available), and `outcome` (`resolved | rejected | blocked |
  duplicate | unsafe`).
- **Event ID format fixed.** IDs now follow `event-YYYYMMDD-HHMMSS-source-shortslug-random`
  (e.g. `event-20260630-214522-github-pr17-null-check-a9f3`) instead of the collision-prone
  `event-0001` sequential style, which is now documented only as an explicit anti-example.
- **`schema_version` added** to `heartbeat.json`, `state.json`, `example-event.json`, and
  the new `lock.json`, so future protocol changes have a compatibility signal.
- **Precedence rules documented** in new `templates/l00prite/README.md`: an active
  non-expired lock wins over any mutation attempt; `state.json.blocked` wins over
  `heartbeat.json.should_continue`; human review gates win over roadmap work; failed
  CI/review blocker events outrank normal roadmap tasks.
- **Ledger requires verification evidence.** `ledger.md`'s "Tests run / Verification" field
  now requires `command`, `exit_code`, `summary`, `evidence_path` (optional), and
  `timestamp` per check — vague "tests passed" statements are no longer sufficient. Added a
  `stale-lock-recovery` decision type and a `Lock` field to record lock acquire/release per
  run.
- **README** gained a "Lock and lease model" section stating plainly what the lock does and
  doesn't guarantee, plus `lock.json`/`LOCKING.md` rows in the protocol table.
- **Validator extended** to check: `lock.json` exists/parses/has required fields,
  `schema_version` on all four JSON templates, the event ID format is documented, event/review
  prompts contain the untrusted-content warning and don't use "move or copy," Claude parity
  prompts exist, ledger contains the new evidence fields, and README documents the lock/lease
  model. All checks pass (`node scripts/validate-l00prite.js`).

### Files added

- `templates/l00prite/lock.json`, `templates/l00prite/LOCKING.md`, `templates/l00prite/README.md`
- `examples/vendor-neutral-output/.l00prite/lock.json`, `LOCKING.md`, `README.md`
- `.claude/prompts/resume-loop.md`, `.claude/prompts/heartbeat.md`, `.claude/prompts/handoff-summary.md`
- `.claude/README.md`

### Files modified

- `.codex/prompts/resume-loop.md`, `heartbeat.md`, `event-loop.md`, `respond-to-review.md`
- `.claude/prompts/event-loop.md`, `.claude/prompts/respond-to-review.md`
- `templates/codex/prompts/resume-loop.md`, `heartbeat.md`, `event-loop.md`, `respond-to-review.md`
- `.claude/commands/build-loop.md`, `.codex/prompts/build-loop.md` (note that `lock.json`
  ships unlocked and isn't project-specific to fill in)
- `templates/l00prite/ledger.md`, `templates/l00prite/heartbeat.json`, `templates/l00prite/state.json`
- `templates/l00prite/events/README.md`, `events/pending/README.md`, `events/processing/README.md`,
  `events/completed/README.md`, `events/example-event.json`, `templates/l00prite/reviews/README.md`
- matching files under `examples/vendor-neutral-output/.l00prite/`
- `AGENTS.md`, `README.md`
- `scripts/validate-l00prite.js`

### Remaining gaps

- The lock/lease convention is cooperative, not enforced by the filesystem — it depends on
  every agent actually following the read-lock-before-write rule. Two agents writing at the
  exact same instant can still race.
- No automated CI runs `scripts/validate-l00prite.js` on this repo yet — the "PR + human
  review only" rule has no automated backstop.
- No event deduplication or cross-repo/monorepo memory scoping exists yet — both were
  flagged in the review as future scaling concerns and are unaddressed here.
- Ledger growth/rotation is still unbounded — no archival convention yet.
- Verification-evidence fields are structurally documented but not mechanically enforced;
  an agent can still write a vague ledger entry if it chooses to ignore the template.

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
