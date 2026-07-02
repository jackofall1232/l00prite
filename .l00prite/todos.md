# Prioritized TODOs

## Next
- [ ] Maintainer review of branch `claude/powerful-helper-agent-pfsyj1` (v1.1: universal
      agent layer + Execution Mode), including the two review-gated files changed at the
      maintainer's direction: `.claude/commands/build-loop.md` and
      `scripts/validate-l00prite.js`. Merge to `main` when satisfied.

## Later
- [ ] Runtime harness that mechanically enforces run boundaries and iteration budgets
      (today they are validator-enforced prompt invariants; a harness would make them
      guarantees a non-compliant model can't ignore).
- [ ] GitHub event ingestion (turn real PR comments into `.l00prite/events/` entries
      automatically).
- [ ] CI failure capture as events.
- [ ] CI workflow for this repo that runs `node scripts/validate-l00prite.js` on every PR —
      the human-review-only rule has no automated backstop yet.
- [ ] Cross-agent compatibility tests, including a mid-execution boundary stop resumed by a
      different vendor's agent.
- [ ] Richer, filled-in examples (a real resolved PR review, a real Execution Mode run
      ledger with a boundary stop and resume).
- [ ] Ledger growth management (archival/rotation conventions).
- [ ] Stack-specific skeleton packs.
- [ ] Release packaging so setup isn't fully manual.

## Done
- [x] `/build-loop` slash command and Loop Engineering scaffolding — 2026-06-30.
- [x] Dogfood `/build-loop`, fix bugs found — 2026-06-30.
- [x] Codex prompt equivalents, Claude/Codex parity — 2026-07-01.
- [x] README repositioned as vendor-neutral loop memory protocol — 2026-07-01.
- [x] Protocol hardening: lock/lease convention, untrusted-content warnings, event ID
      format, ledger verification-evidence fields — 2026-07-01.
- [x] Branding: ASCII banner and SVG logo — 2026-07-01.
- [x] First public release (v1: scaffold, memory, event, and handoff layers; execution mode
      explicitly out of scope for that release) — 2026-07-01.
- [x] Universal agent layer: canonical prompts in `templates/l00prite/prompts/` with
      byte-identical mirrors (validator-enforced), `AGENTS.md.template`, fixed protocol
      section in `CLAUDE.md.template`, vendor adapters (Gemini CLI, Qwen Code, Copilot,
      Cursor, Windsurf, Aider) + `templates/vendors.json`, dogfooded at this repo's root —
      2026-07-02 (in review).
- [x] Opt-in Execution Mode: `execute-loop` prompts everywhere + `/execute-loop` command,
      `--execute` handoff on `build-loop`, pre-flight display + explicit in-session
      confirmation gate, nine run boundaries, resumable exits, schema v2
      `heartbeat.json`/`state.json` execution fields, self-modification guard — 2026-07-02
      (in review).
