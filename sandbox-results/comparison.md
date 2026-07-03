# l00prite Stack vs. Sonnet 5 Solo — A/B Comparison

Six isolated runs (3 tasks × 2 arms), each from a fresh git worktree checked out at
`sandbox`/`5daf92b7ae0c1e8fd579e281a24abe2947b4728f`. Per-run detail, self-reported and
independently verified, lives in `sandbox-results/runs/{task}-{arm}.md`; full diffs are in
`sandbox-results/runs/{task}-{arm}.diff`. Task specs are fixed in `sandbox-results/task-specs.md`.

**Arm C** = Sonnet 5 alone. **Arm B** = Sonnet 5 planner → real Opus 4.8 advisor (read-only
plan review) → Sonnet 5 executor, brokered by the orchestrating workflow script — see
*Methodology deviation* below for why this differs from the literally-specified mechanism.

## 1. Results table

| Task | Arm | Wall-clock | Cost (intro / standard pricing) | Validator | Own test suite | DoD met | Diff size |
|---|---|---|---|---|---|---|---|
| 1 — CI workflow | C | 1m56s | $0.18 / $0.27 | 519 PASS / 0 FAIL | manual YAML parse only | yes | 1 file, +36 |
| 1 — CI workflow | B | 5m54s | ≥$0.53 / ≥$0.80 (floor) | 519 PASS / 0 FAIL | manual YAML parse + schema validation | yes | 1 file, +38 |
| 2 — Iteration harness | C | 5m59s | $0.43 / $0.64 | 519 PASS / 0 FAIL | manual demo only | yes | 4 files, +395/−6 |
| 2 — Iteration harness | B | 23m38s | ≥$1.71 / ≥$2.56 (floor) | 519 PASS / 0 FAIL | automated, 9/9 passing | yes | 9 files, +817/−17 |
| 3 — Cross-agent test | C | 16m10s | $1.15 / $1.73 | 519 PASS / 0 FAIL | automated, 33/33 + violation self-test | yes | 19 files, +1646/−6 |
| 3 — Cross-agent test | B | 30m45s | ≥$2.06 / ≥$3.10 (floor) | 519 PASS / 0 FAIL | automated, 91/91 + negative control + bug-injection self-test | yes | 10 files, +1551/−11 |
| **Total** | **C** | **24m05s** | **$1.76 / $2.64** | 3/3 clean | — | 3/3 | — |
| **Total** | **B** | **1h00m17s** | **≥$4.30 / ≥$6.46 (floor)** | 3/3 clean | — | 3/3 | — |

"Cost" for Arm C is the actual Sonnet 5 cost (all tokens are Sonnet). "Cost" for Arm B is a
**floor estimate** — it prices every token as Sonnet, when in fact the advisor stage ran on
pricier Opus 4.8; the true Arm B cost is higher than shown by an amount this experiment's
instrumentation cannot isolate (see Limitations). Both DoD columns are "yes" for all six runs
— none of the six stopped at a run boundary or failed.

## 2. Cost and time deltas, per task (B vs. C)

| Task | Time delta (B − C) | Time ratio (B / C) | Cost delta (B − C, floor, intro pricing) | Cost ratio (B / C, floor) |
|---|---|---|---|---|
| 1 — CI workflow | +3m58s | ≈3.0x | ≥+$0.35 | ≥2.9x |
| 2 — Iteration harness | +17m39s | ≈4.0x | ≥+$1.28 | ≥4.0x |
| 3 — Cross-agent test | +14m35s | ≈1.9x | ≥+$0.91 | ≥1.8x |
| **Total** | **+36m12s** | **≈2.5x** | **≥+$2.54** | **≥2.4x** |

The variance across tasks is itself a finding: the overhead ratio is not constant. Task 2 shows
the largest multiplier on both cost and time — the advisor found a real, non-trivial correctness
bug there (an unhandled write-path error case) and the executor's fix-and-retest cycle added
real wall-clock. Task 3 shows the smallest ratio despite Arm B's deliverable being qualitatively
the most different from its Arm C counterpart of the three tasks — Arm C's solo run happened to
also be unusually thorough for a Sonnet-alone attempt (it built and ran a real automated
two-process harness rather than a purely manual protocol), which narrowed the gap on this task
specifically. Task 1, the simplest task, shows Arm B paying triple the wall-clock and roughly
triple the floor cost for a functionally near-identical deliverable.

## 3. Quality notes per task (self-assessment — see caveat below)

**These notes are a self-assessment by the same model family that did the work (Sonnet 5, as
both the arms' executor and this comparison's author). This is a materially weaker form of
evidence than an independent review, and it is explicitly recommended below that a blind
third-party review (e.g. via Gemini or Codex, following l00prite's existing cross-model review
pattern referenced in `CLAUDE.md`'s Run Ledger) be run separately before any of this data is
used in external-facing claims.**

**Task 1 — CI validator workflow.** Both arms produced a single-file GitHub Actions workflow
that does the same core thing: trigger on PRs against `main`, check out the repo, install
Node, run the validator, and disclaim that this doesn't replace the human-review gates. Arm B's
version is marginally more polished — it adds `permissions: contents: read` (least privilege),
a `concurrency` block to cancel stale re-runs, and (after the advisor pointed out Node 20's
approaching maintenance EOL) `node-version: "lts/*"` instead of a pinned version. None of this
changes whether the workflow does its job. This is the task where the advisor added the least
value: it approved everything except one minor version-pinning suggestion, and a solo Sonnet 5
run at roughly a third of the cost and time produced a functionally equivalent result.

**Task 2 — Iteration-limit runtime harness.** The two deliverables both mechanically enforce
`iteration_limit_reached` and both pass the validator, but Arm B's is more robust: it defines
and demonstrates a distinct exit code for I/O/write failures (verified in this comparison's own
independent testing via a real `chattr +i` permission failure) that Arm C's harness was not
specifically exercised against for that edge case, ships a durable automated test file
(`execution-harness.test.js`, 9/9 passing) rather than only a manual transcript, and updates
`CLAUDE.md`, `README.md`, and `HANDOFF.md` for consistency in three places Arm C did not touch.
Critically, the extra rigor here was not free polish — the Opus advisor caught a genuine
correctness bug in the *plan* before any code was written (an unhandled write-error path that
would have collided with the harness's own exit-code contract) and two documentation gaps that
would have left the repo with contradictory claims about what's enforced. This is the first of
two tasks where the advisor step visibly changed the outcome's substance, not just its polish.

**Task 3 — Cross-agent compatibility test.** Both arms went well beyond the task's stated
minimum bar (a documented manual protocol was explicitly allowed as sufficient) and built real,
executable automated harnesses using genuine OS-process isolation between simulated agents. Arm
C's harness covers 2 boundary scenarios (compliant resumption plus a deliberately non-compliant
violation mode that gets caught on all 8 expected checks) with 33 assertions. Arm B's harness
covers 4 boundary scenarios (`iteration_limit_reached`, `human_review_gate`, a crashed-mid-run /
stale-lock-recovery case, and `lock_lease_conflict`) with 91 assertions, plus a negative control
proving the no-redo checker has real discriminating power and a bug-injection self-test that
directly sabotages the enforcement logic itself (not just the simulated agent's behavior) and
confirms the check suite catches it. The clearest single data point in the whole experiment for
"the advisor changed the outcome" is here: the Opus advisor rejected Arm B's first plan and
identified a genuine, non-obvious bug — the plan's lock-ownership check would have inspected
`lock.json`'s `owner_agent` field *between* agent turns, but the repo's own `LOCKING.md` clears
that field to `null` on release, so the planned assertion was unobservable and would have
silently done nothing. It also flagged that several planned checks could pass vacuously (both
simulated agents run identical code) and required a negative control before approval. Both
fixes were independently confirmed present and working in this comparison's own verification
pass, not just claimed by the executor.

## 4. Limitations — read before using this data for any external-facing claim

- **n = 1 per task/arm combination.** Each cell in the results table is a single run, not an
  average over repeated trials. LLM outputs vary run to run; none of the deltas above should be
  read as a precise effect size, only as a directional signal from this one sample.
- **No blind quality review was performed.** Every qualitative judgment in Section 3 was made
  by the same model (Sonnet 5) that produced the work being judged, including judging its own
  Arm C output against Arm B's. This is explicitly flagged as weak evidence — see the
  recommendation above for a blind third-party pass before using this comparison externally.
- **Tasks were drawn from `.l00prite/todos.md`'s existing backlog, not randomly sampled** from
  a broader population of possible engineering tasks. They were chosen because they were
  already real, scoped work items, but three tasks — all from one project's backlog, all
  medium-sized — is not a representative sample of "software engineering tasks" in general.
- **Methodology deviation in how "the l00prite stack pattern" was operationalized for Arm B.**
  The task specification called for the Sonnet 5 executor to itself consult an Opus 4.8 advisor
  "before every substantive write." The first attempt at implementing this literally — having
  the executor call the Agent tool itself with `model: "opus"` — failed silently: the Agent tool
  is not available inside a Workflow-spawned subagent in this environment, so that attempt made
  zero advisor consultations and was discarded as invalid (recorded in Run 1-B's ledger notes).
  Every Arm B run reported in this comparison instead uses an orchestrator-brokered pipeline —
  a Sonnet planner produces a plan with no file writes, a real Opus 4.8 advisor (with `model`
  set directly by the orchestrating script, not by the executor) reviews it read-only, and a
  Sonnet executor implements the plan incorporating the feedback. This is a genuine, verified
  Opus consultation, but it is **one plan/advise cycle per task**, not one consult per
  individual file as originally specified — no mechanism was available in this environment for
  the executor to pause mid-implementation and get a fresh consult in real time. For Task 1
  (one file) this distinction is moot; for Tasks 2 and 3 (multiple files, one of which was
  added to Arm B's Task 3 scope *after* the single advisor consultation, per that run's own
  disclosed notes) a real deployed stack with true per-write advisor access might behave
  differently — plausibly more consultations, smaller each, with tighter feedback loops — than
  what this experiment measured. Readers should treat "Arm B" in this report as "the plan-then-
  advise-then-execute pattern actually testable in this environment," not as a literal
  implementation of the pattern named in the original task.
- **Token/cost accounting is incomplete for Arm B.** Output-token counts (via the workflow
  harness's `budget.spent()` instrumentation) are precise. Total-token counts (input+output
  combined) are available at the level of "all three agents in this run" but not broken down
  per agent, so for any Arm B run there is no way to isolate how many of those tokens were
  processed by the pricier Opus 4.8 advisor versus the cheaper Sonnet 5 planner/executor. Every
  Arm B cost figure in this report is therefore a **floor** — computed as if 100% of the run's
  tokens were Sonnet-priced — and the true cost is higher by an unmeasured amount. This means
  the real B/C cost gap is larger than what's reported above, not smaller.
- **One invalid run was discarded before data collection began.** The first attempt at Run 1-B
  (before the pipeline redesign above) consumed real tokens and wall-clock time but produced no
  usable data (zero advisor consultations, effectively a duplicate of Arm C) and is excluded
  from every total in this report. It is recorded transparently in Run 1-B's ledger notes for
  completeness, but readers should be aware the "true" overhead of building a working advisor
  mechanism in this environment — as opposed to running it once built — was higher than the
  reported Arm B numbers alone would suggest.
- **No scope drift within a run's own boundaries was observed** (no run silently expanded
  beyond its task spec in a way that broke comparability), but Arm B runs consistently touched
  more surrounding documentation files (`CLAUDE.md`, `README.md`, `HANDOFF.md`,
  `.l00prite/memory.md`) than their Arm C counterparts for the same task. This may be an
  artifact of the multi-stage pipeline (a planning stage that explicitly enumerates a file list
  tends to enumerate more files than an agent working file-by-file as it goes) rather than a
  fundamental property of "the stack." In all cases reviewed, the extra files were
  consistency-preserving edits within the task's stated scope, not unrelated additions — but a
  bigger diff is not automatically a better one, and this pattern is worth watching if the
  comparison is ever repeated with more samples.

## 5. Plain-language summary

On these three tasks, with n=1 per cell and no blind review, the l00prite stack's Sonnet 5 +
Opus 4.8 advisor pattern bought something real but not uniform: on the two harder,
more-correctness-sensitive tasks (the iteration-limit harness and the cross-agent compatibility
test), the Opus advisor caught genuine bugs and design gaps before code was written — an
unhandled write-error path in one case, an unobservable lock-ownership assertion and a set of
vacuous checks in the other — that a second pass by the same solo model did not independently
surface on its own runs. On the simplest task (the CI workflow), the advisor found nothing
worth blocking on and the two arms' outputs were functionally interchangeable. Across all three
tasks, the stack cost roughly 2.5x the wall-clock time and at least 2.4x the token cost of
solo Sonnet 5 (the true cost multiple is higher, since Arm B's reported cost is a floor that
undercounts the pricier Opus segment) — and that overhead scaled with task difficulty rather
than staying fixed, meaning the "worth it" answer plausibly depends on how correctness-critical
the task is, not on a single fixed price-to-quality ratio. This sample is too small and too
self-assessed to generalize beyond "on this evidence, the advisor step is not free padding — it
found real problems on 2 of 3 tasks — but it is also not free, and its value did not show up on
the easiest task." A larger, blind-reviewed, ideally randomly-sampled follow-up would be needed
before treating any of these numbers as a stable estimate of the stack's actual return on its
overhead.
