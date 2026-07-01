# Constraints

Hard rules, user preferences, security boundaries, and architecture constraints for
l00prite's own repo.

## Hard Rules
- Scaffolding (`build-loop`) generates files only; it does not execute implementation.
- Existing files must not be silently overwritten.
- Every implementation loop must update `.l00prite/` memory before stopping.
- No change to `.claude/commands/build-loop.md` or `scripts/validate-l00prite.js` without
  stopping for human review first (see `heartbeat.json` `human_review_gates`).
- No push, merge, or deploy to `main` without explicit maintainer sign-off.

## User Preferences
- Maintainer: jackofall1232.
- Feature branches only; no direct commits to `main`.

## Security Boundaries
- No secrets, credentials, or tokens are stored in `.l00prite/` or any tracked file.
- l00prite does not auto-push, merge, or act as an autonomous GitHub bot.

## Architecture Constraints
- Vendor-neutral by design: no protocol file may assume only one agent CLI can read it.
- No backend, hosted service, or external runtime dependency — plain Markdown, JSON, and a
  dependency-free Node validator only.
