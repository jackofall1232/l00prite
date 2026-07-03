# Task Specs — Fixed Before Any Run

Written once, before Arm C or Arm B starts on any task. Not modified after either arm
begins. All three tasks are taken directly from `.l00prite/todos.md`'s "Later" section, at
the base commit `5daf92b7ae0c1e8fd579e281a24abe2947b4728f` (both `sandbox` and this
session's branch point here at experiment start).

## Task 1 — CI validator workflow

Add a GitHub Actions workflow to this repository (e.g. `.github/workflows/validate.yml`)
that triggers on `pull_request` targeting the default branch and runs
`node scripts/validate-l00prite.js`, failing the check if the script exits non-zero. The
workflow must check out the repo, set up a Node.js runtime via a supported action, and run
the validator with no additional install step beyond what the validator itself needs
(matching the script's documented zero-dependency design — no `npm install` of third-party
packages). Definition of done: the workflow YAML is syntactically valid; it runs the
validator on every PR against the default branch; it does not claim to replace or remove
the existing human-review-only gates listed in `CLAUDE.md` §6 and `.l00prite/heartbeat.json`
(`human_review_gates`) — this is an automated backstop *in addition to* human review, not a
substitute for it; no other files are modified.

## Task 2 — Runtime harness (scoped subset): enforce `max_iterations`

Build a minimal, dependency-free Node.js script (e.g. `scripts/execution-harness.js`) that
mechanically enforces exactly one Execution Mode run boundary — `iteration_limit_reached` —
from `.l00prite/heartbeat.json`'s `execution` block. Scope is fixed to this one boundary
only; the other eight run boundaries (`definition_of_done_met`, `human_review_gate`,
`destructive_operation_required`, `ambiguous_requirements`, `unfixable_failing_tests`,
`missing_secrets_or_credentials`, `lock_lease_conflict`, `stop_signal`) remain
protocol-only/unenforced by this harness, as before — do not attempt to implement them.
The harness must: read `execution.current_iteration` and `execution.max_iterations` from
`.l00prite/heartbeat.json`; when invoked to advance one iteration, increment
`current_iteration` and persist it back to the file; and refuse to advance (non-zero exit,
clear message identifying the `iteration_limit_reached` boundary) once
`current_iteration >= max_iterations`, regardless of any prompt or agent instruction telling
it to continue — i.e., enforcement is in the script's own control flow, not something an LLM
is merely asked to respect. Must not let the loop raise its own `max_iterations` value
(matching the self-modification guard principle already documented in `CLAUDE.md` §2).
Definition of done: `node scripts/validate-l00prite.js` still passes; a demonstration or
small test (a documented manual run is acceptable) shows the harness blocking a call once
the limit is reached; no claim is made that any boundary besides `iteration_limit_reached`
is mechanically enforced.

## Task 3 — Cross-agent compatibility test

Write a documented test scenario — automated if feasible, otherwise a precise manual test
protocol (e.g. `docs/cross-agent-compat-test.md`, or a script under `scripts/` or `tests/`)
— that verifies: Agent A (representing one vendor) runs an Execution Mode loop, hits a run
boundary mid-execution (e.g. `iteration_limit_reached` or `human_review_gate`), stops, and
persists its state to `.l00prite/heartbeat.json`, `.l00prite/state.json`, and related memory
files; then Agent B (representing a *different* vendor) — reading only `.l00prite/` files,
no vendor-specific session state — resumes the loop from exactly where Agent A stopped,
without redoing completed work and without violating the boundary Agent A hit. Definition
of done: the deliverable specifies exact preconditions, step-by-step actions, the expected
file states before and after each step, and explicit pass/fail criteria, precise enough that
two different people (or agents) following it would reach the same verifiable result; full
automation is not required, but if a manual protocol is used it must be actionable without
further interpretation; `node scripts/validate-l00prite.js` still passes; no capability is
claimed that isn't actually demonstrated by the deliverable.

## Shared ground rules for both arms

- Base commit for every run: `5daf92b7ae0c1e8fd579e281a24abe2947b4728f` (`sandbox` branch).
- Each run works in its own isolated git worktree/branch, never touching the main checkout
  or any other run's worktree.
- Definition of Done bar for all three tasks matches what l00prite already uses elsewhere:
  validator passes, a ledger-style entry is written, and no claimed capability the code
  doesn't actually have.
- Arm C (control): Sonnet 5 alone completes the task with no calls to any other model.
- Arm B (treatment): Sonnet 5 acts as executor; before every substantive write (creating or
  materially modifying a file), it must consult an Opus 4.8 advisor (a one-shot design/
  correctness review of the planned change) and incorporate that feedback before writing.
  This mechanism is not separately documented elsewhere in this repo — it is defined here,
  for this experiment, as the operational stand-in for "the existing l00prite stack
  pattern," since no more specific implementation is checked into the codebase.
