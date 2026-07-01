# Prioritized TODOs

## Next
- [ ] Design and build opt-in execution mode: `--execute` flag on `build-loop`, pre-flight
      confirmation display, standalone `.claude/commands/execute-loop.md` /
      `.codex/prompts/execute-loop.md`, and all 8 stop conditions (see `CLAUDE.md` "Not yet
      built: execution mode"). Requires human review before touching `build-loop.md`.

## Later
- [ ] Stronger, more semantic validation in `scripts/validate-l00prite.js` (beyond file
      existence and keyword checks).
- [ ] GitHub event ingestion (turn real PR comments into `.l00prite/events/` entries
      automatically).
- [ ] CI failure capture as events.
- [ ] Richer, filled-in examples (a real resolved PR review, a real multi-session handoff).
- [ ] Stack-specific skeleton packs.
- [ ] Cross-agent compatibility tests (Claude/Codex handoff verification).
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
      explicitly out of scope for this release) — 2026-07-01.
