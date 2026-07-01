## 1. Mission

l00prite is an open-source Claude Code slash command, `/build-loop`, that takes a user's project idea, asks clarifying questions, and generates a `CLAUDE.md` plus a skeleton repo structure following the Loop Engineering 8-section protocol. It explicitly does NOT run the build loop itself — execution of the resulting blueprint is handled entirely by the user's own separate Claude Code session, under that session's native tool-approval flow. l00prite scaffolds; it never executes.

Target user: developers who already understand Claude Code basics and the risks of agentic/autonomous loops (unsupervised tool calls, runaway API spend). The repo name "l00prite" is intentionally non-obvious — a soft filter so people who stumble onto it without that context are less likely to run it blind.

## 2. Architecture

- `/.claude/commands/build-loop.md` — the slash command definition (prompt flow: clarify, generate, validate, stop)
- `/templates/CLAUDE.md.template` — the 8-section template with `{{placeholders}}`, used by `/build-loop` to generate a target project's `CLAUDE.md`
- `/templates/skeleton/` — base folder structures by complexity tier: `small/`, `medium/`, `large/`
- `/examples/example-output/` — a filled, realistic reference `CLAUDE.md` showing what `/build-loop` actually produces for a sample project
- `/CLAUDE.md` — l00prite's own blueprint (this file; meta: l00prite is built using its own protocol)
- `/README.md`, `/LICENSE` (MIT, already present)
- No backend, no hosted service, no stored credentials, no telemetry. Everything is local files plus the user's own Claude Code session.

## 3. Requirements

- [ ] `/build-loop` must ask clarifying questions BEFORE generating anything: project type, scope, languages/stack, target repo, constraints
- [ ] Must generate a complete `CLAUDE.md` following the 8-section Loop Engineering format
- [ ] Must generate a skeleton folder structure matching one of three complexity tiers (small / medium / large)
- [ ] Must give a ROUGH complexity-tier cost estimate, NOT a precise token number — state honestly that predicting exact agentic loop cost before execution is not reliable
- [ ] Must explicitly stop after scaffolding — never auto-execute the generated `CLAUDE.md` against the target repo
- [ ] README must state the risk/reward tradeoff in plain language: unsupervised agentic loops can burn real API spend if the user doesn't set an Anthropic Console spend limit and doesn't review the generated `CLAUDE.md` before running it

## 4. Definition of Done

- [x] `/build-loop` runs in a fresh Claude Code session and produces a valid `CLAUDE.md` + skeleton without errors — verified via 2 dogfood runs (2026-06-30, see Run Ledger)
- [x] Generated `CLAUDE.md` is itself valid Loop Engineering format: all 8 sections present, no placeholder text left unfilled — verified directly on both dogfood outputs
- [x] README clearly documents setup, risk, and recommended Anthropic Console spend-limit configuration — reviewed 2026-06-30, has a dedicated "Read this before you run a generated blueprint" section
- [x] MIT LICENSE present (done)
- [x] Works on a clean test repo with no prior Claude Code history — both dogfood runs targeted fresh, empty directories

## 5. Agent Operating Loop

- **Generator role** — drafts the `CLAUDE.md.template` logic and the `/build-loop` slash command prompt flow (clarifying questions, generation steps, skeleton selection).
- **Evaluator role** — reviews generated output against the 8-section spec for completeness, and against the "never auto-execute" constraint specifically. Rejects any draft that touches the target repo beyond scaffolding.
- This project generates blueprints FOR loops rather than running one itself, so the loop here is bounded and single-pass: clarify → generate → validate structure → stop. No multi-iteration agentic execution within l00prite's own build process.

## 6. Heartbeat Rules

These govern l00prite's OWN DEVELOPMENT process, not anything at runtime — l00prite has no runtime loop.

- Cap exploratory iterations at 10 per Claude Code session working on this repo; stop and check in with a human before continuing past that
- Mandatory human review before merging any change to slash-command logic (`.claude/commands/build-loop.md`) or to `templates/CLAUDE.md.template`
- No direct pushes to `main` — all changes via branch + PR + review

## 7. Run Ledger

Living record of what's actually been built and tested, per session. Update this every session — do not leave it static.

| Date | Component | Status |
|------|-----------|--------|
| 2026-06-30 | `CLAUDE.md.template` (8-section template) | Dogfooded via 2 live `/build-loop` runs (small CLI tool, medium web app). Found and fixed a bug where the template's own leading meta-comment block could leak into generated output; build-loop.md Step 3 now explicitly discards it. Re-verified after the fix: zero leftover `{{...}}` tokens or guidance comments in either run's output. |
| 2026-06-30 | Skeleton tiers (small/medium/large) | small and medium tested end-to-end via live dogfood runs and pass; `large` tier still untested live. Found and fixed two bugs: (1) `TIER.md` (internal maintainer doc) was being copied verbatim into generated target repos — build-loop.md Step 4 now explicitly excludes it; (2) `.stub`→extension swap alone produced Python test files named `*.test.py`, which pytest's default discovery silently never collects (reproduced the failure with a real `pytest --collect-only` run) — Step 4 now specifies language-specific test-naming conventions. Also tightened Step 4 to require docs/config stubs stay as minimal as code/test stubs, after one dogfood run inconsistently fleshed out docs/config with invented content. |
| 2026-06-30 | `/build-loop` slash command | Dogfooded end-to-end on 2 different project types: a small-tier CLI tool (RSS-digest mailer) and a medium-tier web app (habit tracker). Both runs independently re-verified (not just self-reported): all 8 section headers present in order, zero leftover template tokens/comments, content genuinely project-specific (not boilerplate), tier-appropriate skeleton, command stopped without executing anything in the target repo, source repo left untouched. 4 real bugs found and fixed (see rows above); all 4 fixes re-verified afterward with concrete evidence (`pytest --collect-only`, `grep` checks, byte-for-byte stub comparisons) via a fresh dogfood run (CSV→JSON CLI tool). |
| 2026-06-30 | Example output | Reviewed against live dogfood output. Added a clarifying note: its Run Ledger shows a mid-project snapshot for illustration, not what a fresh `/build-loop` run actually produces (which always starts with an empty, header-only table). |

## 8. Completion Criteria

v1 is complete when:

- [x] `/build-loop` works end-to-end on at least 2 different project types (e.g., a small WordPress plugin and a medium web app) — tested with a small CLI tool and a medium web app, see Run Ledger 2026-06-30
- [x] README is reviewed and the risk/reward language is clear and unambiguous — reviewed 2026-06-30
- [x] MIT license is in place
- [ ] The repo has been dogfooded on at least one real project idea before public announcement — the 2026-06-30 dogfood runs used synthetic test ideas to validate the mechanism, not a real project a maintainer actually wants built; this box should stay unchecked until someone runs `/build-loop` on an actual idea they intend to follow through on, and that's a human call before any public-announcement gate, not something to self-certify
