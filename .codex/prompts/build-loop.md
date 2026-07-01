# Codex Build Loop Prompt

You are using l00prite to scaffold a vendor-neutral project loop. Your job is to create a blueprint, `.l00prite/` memory folder, and skeleton only. Do **not** execute the generated project.

## 1. Ask clarifying questions first

Ask for project type, MVP scope and out-of-scope items, target languages/stack, target repo path, and hard constraints. Do not continue until answered, except where the user explicitly says to use judgment.

## 2. Pick a complexity tier

Choose `small`, `medium`, or `large` from `templates/skeleton/`. If borderline, choose the smaller tier. Explain why.

## 3. Generate project guidance

Create or update agent guidance files appropriate to the target repo:

- `CLAUDE.md` for Claude users, based on `templates/CLAUDE.md.template`.
- `.codex/prompts/resume-loop.md`, `.codex/prompts/heartbeat.md`, `.codex/prompts/event-loop.md`, `.codex/prompts/respond-to-review.md`, and `.codex/prompts/handoff-summary.md` for Codex/CLI users.
- `.claude/prompts/resume-loop.md`, `.claude/prompts/heartbeat.md`, `.claude/prompts/event-loop.md`, `.claude/prompts/respond-to-review.md`, and `.claude/prompts/handoff-summary.md` (from `templates/claude/prompts/`) so Claude sessions get the same lock-aware, event-aware loop behavior as Codex — `CLAUDE.md` alone does not encode lock/lease or event-lifecycle rules.
- Preserve vendor-neutral language where possible and point all agents to `.l00prite/` as shared source of truth.

Do not silently overwrite existing files. Ask whether to overwrite, write `.generated` copies, or abort.

## 4. Generate `.l00prite/`

Copy `templates/l00prite/` into the target repo and fill obvious project-specific fields in `blueprint.md`, `state.json`, `constraints.md`, and `todos.md`. Keep files human-readable and agent-readable. Leave `lock.json` in its shipped `"unlocked"` state — it is not project-specific and must not be pre-filled or set to `"active"`.

## 5. Scaffold the selected skeleton

Copy `templates/skeleton/<tier>/` into the target repo, skipping internal `TIER.md`. Adapt `.stub` names to the selected stack, but keep stubs minimal. Do not write real implementation.

## 6. Safety boundary

Stop after scaffold and handoff. Refuse to run build, test, install, migration, deployment, or implementation commands for the generated project during this build-loop session.

Tell the user how to resume:

- Claude: open the target repo and use `CLAUDE.md`, or paste `.claude/prompts/resume-loop.md` for lock-aware, event-aware loop behavior.
- Codex: open the target repo and paste `.codex/prompts/resume-loop.md`.
- All agents: use `.l00prite/` as the shared source of truth and update it before stopping.
