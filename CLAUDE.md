## 1. Mission

Extend l00prite with opt-in execution mode — the `--execute` flag, pre-flight confirmation display, hard stop conditions, and a full execution loop protocol — without breaking the scaffold-first default that makes l00prite safe by design.

Target user: the l00prite maintainer (jackofall1232) and any contributor extending the protocol. This session operates on the l00prite repo itself using its own Loop Engineering protocol — meta, intentional, and the correct dogfood test for execution mode before it ships to anyone else.

This session does NOT scaffold a new project. It builds the execution-mode feature into the existing l00prite repo by writing and modifying real files, running the validator, and verifying each change before moving on.

## 2. Architecture

Files to create (new):

- `.claude/commands/execute-loop.md` — dedicated Claude Code slash command for execution mode; contains pre-flight display, confirmation gate, execution loop, and all stop conditions
- `.codex/prompts/execute-loop.md` — Codex/CLI equivalent of the above
- `templates/codex/prompts/execute-loop.md` — template version copied into target repos by build-loop

Files to modify (existing):

- `.claude/commands/build-loop.md` — add `--execute` flag handling in Step 7; when flag is present, hand off to execute-loop behavior after scaffold instead of stopping; default (no flag) behavior unchanged
- `.codex/prompts/resume-loop.md` — add execution permission model and stop conditions; execution only proceeds when explicitly permitted
- `.codex/prompts/event-loop.md` — same execution permission addition
- `.claude/prompts/event-loop.md` — same
- `templates/codex/prompts/resume-loop.md` — sync with updated resume-loop
- `templates/codex/prompts/event-loop.md` — sync with updated event-loop
- `templates/l00prite/heartbeat.json` — add fields: `execution_permitted`, `pre_flight_confirmed`, `last_stop_reason`, `execution_iteration`, `max_execution_iterations`
- `templates/l00prite/state.json` — add fields: `execution_mode`, `stop_reason`, `destructive_action_pending`, `awaiting_confirmation`
- `examples/vendor-neutral-output/.l00prite/heartbeat.json` — sync new fields
- `examples/vendor-neutral-output/.l00prite/state.json` — sync new fields
- `scripts/validate-l00prite.js` — add checks: execute-loop prompts exist, cover all 8 stop conditions, contain pre-flight display requirement, contain confirmation gate, forbid push/merge/deploy/delete/credential change without permission
- `README.md` — add Execution Mode section documenting `--execute`, pre-flight, stop conditions, and safety properties
- `AGENTS.md` — add execution rules: when execution is permitted, what agents must display before starting, what triggers a mandatory stop
- `HANDOFF.md` — update with this session's changes

No backend, no hosted service, no external dependencies added. Everything is prompt files, JSON schemas, and a Node validator — same architecture as the rest of l00prite.

## 3. Requirements

- [ ] `build-loop` default (no flag) behavior is completely unchanged — scaffold only, stops after Step 7
- [ ] `--execute` flag causes build-loop to continue into execute-loop behavior after scaffold is complete
- [ ] Before the first execution loop begins, the agent must display all of the following and wait for explicit user confirmation:
  - Selected goal (from `.l00prite/blueprint.md` or `state.json`)
  - Max iterations for this execution run
  - Stop conditions that will halt the loop
  - Files likely to change
  - Destructive actions that are forbidden without explicit permission
  - Tests and checks that will be run to verify each step
- [ ] Execution loop must stop immediately on any of these conditions:
  - Max iterations reached
  - Failing tests that cannot be fixed in one step
  - Destructive operation needed (file delete, db migration, schema drop, etc.)
  - Secrets or credentials needed that are not already present
  - Unclear or ambiguous requirement — agent must ask, not guess
  - Human review gate triggered (per `heartbeat.json`)
  - Lock conflict or concurrent write risk to `.l00prite/` files
- [ ] Every execution loop iteration must update `.l00prite/` memory before stopping, even if stopping due to an error or stop condition
- [ ] No push, merge, deploy, delete, credential change, or external side effect without explicit per-action user permission — not blanket permission granted once at the start
- [ ] `execute-loop` prompt exists as a standalone Claude slash command (`.claude/commands/execute-loop.md`) so users can invoke execution mode directly without re-running build-loop
- [ ] Codex equivalent exists (`.codex/prompts/execute-loop.md` and `templates/codex/prompts/execute-loop.md`)
- [ ] `heartbeat.json` schema carries all new execution fields
- [ ] `state.json` schema carries all new execution fields
- [ ] Validator checks execute-loop prompts for all 8 stop conditions and the pre-flight + confirmation gate
- [ ] README documents execution mode clearly, including the opt-in design decision and the full stop-condition list
- [ ] `AGENTS.md` updated with execution permission rules

## 4. Definition of Done

- [ ] `node scripts/validate-l00prite.js` passes with zero FAIL lines, including all new execute-loop checks
- [ ] `build-loop` run without `--execute` produces identical scaffold output to before this change — no regressions
- [ ] `execute-loop` slash command invoked in a test Claude Code session displays a correct pre-flight summary and stops for confirmation before doing anything
- [ ] All 8 stop conditions are represented in both `.claude/commands/execute-loop.md` and `.codex/prompts/execute-loop.md` — verified by grep and by validator
- [ ] `heartbeat.json` and `state.json` templates parse as valid JSON with all new fields present
- [ ] README execution mode section reviewed by maintainer and judged accurate and unambiguous
- [ ] No existing validator checks regressed — all checks that passed before this session still pass

## 5. Agent Operating Loop

- **Generator role** — writes or modifies one file per iteration, in the order defined in Section 2 (new files first, then modifications, then validator, then docs). Does not move to the next file until the current one is complete and verified. Does not invent requirements beyond what is stated in Section 3.
- **Evaluator role** — after each file is written or modified: (1) checks that all 8 stop conditions are present if the file is an execute-loop prompt, (2) checks that the pre-flight display and confirmation gate are present if the file is an execute-loop prompt, (3) runs `node scripts/validate-l00prite.js` after each validator or template change to confirm no regressions, (4) checks that JSON files parse correctly after schema additions, (5) rejects any change that silently alters scaffold-only default behavior.
- **Loop description** — generate one file → evaluator checks it → if it passes, update `.l00prite/ledger.md` and `.l00prite/todos.md` → move to the next file. If evaluator rejects, fix in the same iteration before moving on. Do not batch multiple files into one step.

## 6. Heartbeat Rules

- **Max iterations** — cap at 20 generator/evaluator round-trips for this session. The change set is well-defined (roughly 15 files), so 20 gives one retry per file on average. Stop and check in with the maintainer if the cap is reached before Definition of Done.
- **Human review gates** — mandatory human review before: (1) any change to `.claude/commands/build-loop.md` (core scaffold command), (2) any change to `scripts/validate-l00prite.js` (validator logic), (3) declaring Definition of Done met and closing this session.
- **Branch policy** — all changes on a feature branch (`feature/execution-mode`); no direct commits to `main`; each file change is its own commit with a message describing what was written and what was verified; open a PR for maintainer review once Definition of Done is met.

## 7. Run Ledger

| Session | Date | Built | Tested | Status |
|---------|------|-------|--------|--------|

## 8. Completion Criteria

v1 of execution mode is complete when:

- [ ] All items in Section 3 (Requirements) and Section 4 (Definition of Done) are checked
- [ ] Validator passes clean with zero FAIL lines
- [ ] `execute-loop` has been invoked at least once in a real Claude Code session and correctly displayed pre-flight, waited for confirmation, and stopped on a triggered stop condition during the test
- [ ] The maintainer has reviewed the PR, is satisfied that scaffold-only default is unchanged, and has merged to `main`
- [ ] `HANDOFF.md` is updated to reflect this session's changes and the current state of the repo
