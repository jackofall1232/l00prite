---
name: l00prite-validation-and-qa
description: >
  Scope: dual — Part A covers any l00prite-managed project (what counts as evidence in YOUR
  ledger, the Verifier Theater failure mode and its guard, "NOT measured" labeling for
  performance/efficacy claims); Part B covers l00prite repo development (the golden/certified
  inventory — validator 519 PASS/0 FAIL, doctor HEALTHY 25 ok, `go test ./...` all-pass,
  `dist.sh` artifacts, the sandbox A/B benchmark branch; negative-testing discipline;
  regression-test-per-finding rule; adding Go tests without touching the gated validator).
  Load this skill when: a ledger entry (yours or one you're reviewing) says "tests passed" or
  "verified" without a `command`/`exit_code`/`timestamp`; you're about to write a "green"/passing
  claim into a ledger entry, PR description, or CLAUDE.md row and need to know what counts;
  you're adding a Go test or a protocol-level check and need to know where it goes and whether a
  regression test is required; you're about to state a performance, caching, or efficacy result
  and aren't sure whether it's measured or asserted; you see a claim like "18/18 checks passed"
  or a cited test/harness and need to know whether it's actually reproducible from the repo.
---

# l00prite validation and QA

## What this skill is for

This skill answers one question: **is a "verified"/"passing"/"green" claim actually backed by
evidence, or is it Verifier Theater?** It defines what counts as evidence in an l00prite ledger
entry, names the golden/certified facts about this repo you can cite without re-deriving them
yourself (each with a one-line re-check command), and teaches the negative-testing and
regression-test-per-finding disciplines this project actually practices. It does not diagnose
*why* something is broken (that's triage) and it does not ship the measurement scripts
themselves (that's tooling) — it is the standard those other skills are held to.

**Part A** (below) is for any l00prite-managed project: what your own ledger entries must
contain, the Verifier Theater failure mode your project's `failures.md` already warns about,
and how to label unmeasured claims honestly. **Part B** is for developing the l00prite repo
itself: the certified inventory of green checks, how this repo does negative testing, and how
to add tests without touching the gated validator.

## When NOT to use this

| If you actually need... | Use instead |
|---|---|
| The next diagnostic command for a live symptom (a FAIL, a stuck run, a routing surprise) | `l00prite-debugging-playbook` |
| To actually *run* the measurement (validator/doctor output grammar, `check-parity.sh`, `verify-all.sh`, git archaeology commands) | `l00prite-diagnostics-and-tooling` |
| The full settled-incident chronicle (every past PR round, symptom→root cause→status) | `l00prite-failure-archaeology` |
| Where a claim belongs in the docs-of-record, the update ritual, or external-positioning discipline | `l00prite-docs-and-claims` |
| A general first-principles proof method (worth-it analysis, adversarial design review, fail-closed analysis, security-gate analysis) used *beyond* test/ledger evidence | `l00prite-proof-and-analysis-toolkit` |
| The byte-parity edit procedure or the two review-gated files' change procedure | `l00prite-change-control` |
| The Dashboard Runs view campaign's own success-is-measurable contract | `l00prite-runs-view-campaign` |
| The hunch-to-accepted-result research pipeline and its evidence bar | `l00prite-research-methodology` |
| The Go runtime's package map / request flow / "where to add X" | `l00prite-cli-os-internals` |
| Day-to-day protocol operations (which prompt to run, lock etiquette, event lifecycle) | `l00prite-loop-operations` |

---

## Part A — in any l00prite-managed project

### 1. What counts as evidence

Every scaffolded project's `.l00prite/ledger.md` carries an **Entry Template** with a
`Tests run / Verification` field defined like this (quoted verbatim from the canonical
template — check your own project's `.l00prite/ledger.md`, which should match):

> **Tests run / Verification:** One entry per check run, each with `command`, `exit_code`,
> `summary`, `evidence_path` (optional), and `timestamp`. Do not write vague statements like
> "tests passed" without at least `command`, `exit_code`, and `summary`.

That is the whole standard. A compliant verification line looks like:

```
- `command`: node scripts/l00prite-doctor.js .
- `exit_code`: 0
- `summary`: 25 ok, 0 warn, 0 fail — HEALTHY
- `evidence_path`: none (console output only)
- `timestamp`: 2026-07-06T00:00:00Z
```

A non-compliant line looks like "ran the tests, all good" — no command, no exit code, nothing
another agent (or a human) could independently re-run to check. Treat any ledger entry, PR
description, or handoff note written that way as unverified until it's backed by a command +
exit code, regardless of how confident the prose sounds.

**Where this is enforced today:** `scripts/l00prite-doctor.js` — the dependency-free,
copy-able health check every l00prite project can run against its own `.l00prite/` — carries a
warn-level "Verifier Theater" check. It looks for a `## Runs` heading in your `ledger.md`, and
if the text after it is substantive (more than ~200 characters, i.e. real run history, not just
the template preamble) it requires at least one occurrence of `exit_code` or `evidence_path` in
that text. No hit → `warn`: *"ledger.md has run entries but no visible verification evidence
(command/exit_code/tests)"*. A hit → `ok`: *"ledger.md run entries carry verification evidence"*.

**The gotcha to know:** this check is keyed on finding a literal `## Runs` markdown heading. If
your ledger doesn't use that exact heading (renamed, reformatted, or the heading dropped), the
doctor silently skips the whole check — no `ok`, no `warn`, nothing. A silently-skipped check is
not the same as a passing one; if you've reorganized your ledger's structure, verify by eye that
your entries still carry real evidence rather than trusting the doctor's silence as a green light.

### 2. Verifier Theater — the named enemy

**Verifier Theater**: the ledger says a unit passed, but the check never really ran — or
"passed" means "looked right." A human or CI later finds the obvious break. This is generic
loop-failure wisdom (not specific to any one project's history), and if your project was
scaffolded by l00prite it is already seeded — compact and rated — into your own
`.l00prite/failures.md`, under "Inherited loop failure modes":

> Verifier Theater (claimed pass, check never ran) — S2 — Record `command`/`exit_code`/
> `timestamp` evidence in `ledger.md`; never claim success for a check that failed or didn't run.

("S2" means: wrong code committed, corrupted memory, or a misleading ledger — harmful but not a
security/data-loss-grade S3. Your project's `failures.md` header points to the l00prite repo's
`docs/failure-modes.md` if you want the full generic catalog with all severities.)

The rule this guards, verbatim from the `execute-loop.md` prompt every l00prite agent follows
(your project's own `.l00prite/prompts/execute-loop.md` is the authoritative copy — this is
quoted only to show the wording, not to replace it):

> Verify with the narrowest meaningful test or check. Record the command, exit code, summary,
> and timestamp (plus an evidence path when one exists). Never claim success when a check
> failed or could not run.

and, from the same prompt's non-negotiables:

> **Honest verification.** Failed or skipped checks are recorded as exactly that.

**Honest limit, stated in the generic catalog and worth carrying into your own project**: the
implementer and verifier are usually the *same agent* in an l00prite loop today, which is
structurally weak (confirmation bias) — an independent-verifier prompt is only genuinely
independent once a runtime harness mechanically separates the two roles. Until then, the
evidence fields above are the mitigation, not a second opinion. Do not treat a self-approval
without recorded evidence as verification, no matter how confident the phrasing.

### 3. "NOT measured" labeling

Any performance or efficacy claim — caching speedups, memory-value claims, "this made runs
faster/cheaper/more reliable" — needs one of these labels, in descending strength:

| Label | Means |
|---|---|
| **Measured** | A benchmark harness ran against real (or realistically simulated) traffic and produced a number. |
| **Asserted from construction** | No harness ran; the claim follows logically from a verified structural property (e.g., "these two requests are byte-identical, and byte-identical prefixes are what the cache keys on") but the actual runtime benefit was never observed. |
| **Project-recorded** | A fact carried from a design doc or a third-party spec, not independently reproduced here. |
| **Unverified** | Nobody checked it against anything. Don't ship this label in a claim you're making yourself — drop the claim instead. |

The l00prite repo's own prompt-caching passes are the model for how to write this honestly: a
ledger entry for the Anthropic prompt-cache split states explicitly (quoted, condensed):

> there is still NO benchmark harness, so the real planner hit-rate improvement is asserted
> from construction (byte-identical stable prefix across turns), not measured against the live
> API.

That is: the unit tests prove the *mechanism* is correct (two constructed requests carrying
different memory digests produce byte-identical stable prefixes), which is real, verified
evidence — but it is evidence for the mechanism, not a measurement of the actual cache hit-rate
improvement in production. Do the same in your own project: when you can't run the real
workload, say what you *did* verify (the mechanism) and what you did *not* (the payoff), rather
than letting a verified mechanism imply an unverified payoff.

### Acceptance in your project

- The only machine-checkable gate most l00prite projects have out of the box is **exit code**:
  your own test suite's exit code, and — if you've copied it in — `l00prite-doctor.js`'s exit
  code (`0` on `fail == 0`, `1` otherwise).
- **`warn` is not `fail`.** The doctor's exit code is driven only by fail-count; a project with
  outstanding warnings still exits `0`. Don't read a `0` exit code as "no issues" — read the
  actual ok/warn/fail counts.
- A ledger claim of "green" must mean: the specific command you ran, its exit code, and a
  one-line summary — for every check that contributed to the claim, not just the last one you
  happened to run.

---

## Part B — in the l00prite repo

This part assumes you are developing the l00prite protocol/runtime itself (this repo), not
operating a project that adopted it. If that's not your situation, see Part A above instead.

### 4. The golden/certified inventory (as of 2026-07-06 — re-verify before relying on)

| Fact | Re-check command | Expected |
|---|---|---|
| Validator is clean | `node scripts/validate-l00prite.js 2>&1 \| tail -5` (and count with `grep -c '^PASS'`) | 519 PASS, 0 FAIL, exit 0 |
| Doctor is healthy | `node scripts/l00prite-doctor.js .` | `25 ok · 0 warn · 0 fail` — HEALTHY, exit 0 |
| Go test suite is green | `cd cli-os && go test ./...` | all packages `ok` (144 top-level `Test*` functions, ~170 incl. subtests) |
| Cross-platform packaging works | `cd cli-os && bash scripts/dist.sh vtest` | 5 static archives (linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64) + `SHA256SUMS` written under `cli-os/dist/` (git-ignored; the script does not delete `dist/` itself when it finishes — remove it yourself after inspecting) |
| The only benchmark artifact | `git log --oneline origin/sandbox -1` | `60aadbd Sandbox A/B test: l00prite stack vs. Sonnet 5 solo (#11)` — merged deliberately to the `sandbox` branch, **never** to `main`; the comparison lives at `sandbox-results/comparison.md` on that branch, not on any branch you have checked out by default |

**What this inventory does NOT cover** (state this honestly, don't let a green run above imply
more than it does):
- **No CI.** There is no `.github/workflows/` in this repo (verify: `ls .github/workflows/` —
  does not exist as of this date). Every green result above is a human- or agent-run command,
  not an automatically-enforced gate on every push.
- **No committed UI end-to-end harness.** A Playwright harness (`uitest.js`) is cited twice in
  `.l00prite/ledger.md` (a "18/18" checks claim, twice) and once in `CLAUDE.md`'s Run Ledger,
  but it was never committed to the repo (verify: `git log --all --oneline -- '**/uitest.js'`
  returns nothing). Treat that specific "18/18" claim as **not reproducible from the repo** —
  it is not evidence you can re-run, only a historical assertion. Generalize it as: a check
  that isn't committed isn't a check anyone else can re-run — cite it as historical, not as
  current evidence, until the harness itself lands.
- **No live-provider smoke test.** Every adapter's live-API behavior is unit- and
  mock/e2e-tested; nothing here has actually round-tripped a real provider key in this
  environment (the build environment blocks that egress). Ledger do-not-retry notes say this
  explicitly: don't claim live-provider readiness without an egress-enabled smoke test, and
  don't backfill provider pricing from training-data memory.

### 5. Negative-testing discipline

The rule: after building any checker, deliberately break what it's supposed to catch, confirm
it actually fails (not silently passes), then restore and confirm it passes again. A checker
that has never been proven to fail on a bad input has not been proven to catch anything. Two
worked examples from this repo's own history, plus the rule this repo derived from a real
review round:

**v1.1 drift-injection (byte-parity + schema checks), from the ledger:**
- Injected drift into a prompt mirror, an adapter dogfood copy, and `.l00prite/heartbeat.json`
  (flipped `enabled: true`).
- Result: `node scripts/validate-l00prite.js` exit code went to `1` (byte-parity, adapter-parity,
  and disarmed-schema checks each FAILed on the injected drift), then back to `0` after restore.

**Doctor 5-way broken-copy test, from the ledger:**
- Broke a scaffolded copy five ways: armed-without-lock, prompt drift, stall (no-progress
  telemetry inconsistent), pending-event-count mismatch, missing denylist block.
- Result: doctor reported 3 FAIL + 2 WARN, exit code `1`, as intended — no crash, no false ok.

You can reproduce the shape of this yourself cheaply: copy `.l00prite/` to a scratch directory,
edit one field to something the doctor checks (e.g. flip `heartbeat.json`'s
`execution.enabled` to `true` without a matching lock), run
`node scripts/l00prite-doctor.js <scratch-dir>`, and confirm it reports the expected fail/warn
instead of passing quietly.

**Regression-test-per-finding rule** (from the PR #24 engine review round — 21 automated
findings across two rounds, each verified against the actual code before fixing, each landing
with a dedicated regression test, not just a code fix): the three security-critical gate
bypasses each have a named test proving the bypass is closed, verified here to actually exist
and pass:

| Bypass closed | Regression test | Verified |
|---|---|---|
| Command allowlist prefix-match let an approved command have shell metacharacters appended and run unapproved (`"go test ./..."` allowlisted → `"go test ./... ; rm -rf /"` ran silently) | `TestCommandAllowlistRejectsShellChaining` (`cli-os/internal/engine/l00pfiles_test.go`) | `go test ./internal/engine/... -run TestCommandAllowlistRejectsShellChaining -v` → PASS |
| `.l00prite/constraints.md` (which carries the Autonomous-Edit Denylist itself) was neither hard-denied nor covered by the default denylist — a run could loosen its own denylist | `TestConstraintsMdIsProtocolProtected` (`cli-os/internal/engine/l00pfiles_test.go`) | PASS |
| `search_files` followed a symlink outside the repo root, unlike `read_file`'s path containment | `TestSearchFilesSkipsSymlinkedFiles` (`cli-os/internal/engine/l00pfiles_test.go`) | PASS |
| An approval could be `Decide()`d against a run it didn't belong to (cross-run, even cross-project) | `TestDecideRejectsCrossRunApproval` (`cli-os/internal/engine/run_integration_test.go`) | PASS |

Two more from round 1 of the same PR, same discipline: `TestParseArgsAcceptsStringOrObject`
(`helpers_test.go`) and `TestBuildPreflightRecoversOwnUnexpiredLease`
(`preflight_test.go`, own-lease crash recovery). When you fix a bot- or human-reported finding
in this repo, name the test after the specific bypass/bug it closes, not a generic
`TestFix1` — the table above is the pattern to copy.

### 6. How to add tests without touching the gated validator

**Go tests** (this is most protocol-behavior work today):
- Package convention: one `_test.go` file per source file or feature area, in the same package
  (`internal/engine/tools_test.go`, `internal/engine/l00pfiles_test.go`, etc.) — this repo has
  no separate `_test` package convention to fight.
- Table-driven style is idiomatic here — see `TestMatchDenylist` in
  `cli-os/internal/engine/l00pfiles_test.go` (a `[]struct{ rel string; wantMatch bool;
  wantPat string }` table) or the equivalent tables in `internal/config/config_test.go` and
  `internal/engine/roles_test.go`.
- Run a single test or a matching set with `-run`: `go test ./internal/engine/... -run
  'TestName1|TestName2' -v` (verified above — this is exactly how the four PR #24 tests were
  re-checked for this skill).
- Integration-style, multi-step tests live in `cli-os/internal/engine/run_integration_test.go`
  (full run lifecycles, e.g. `TestRunReachesDefinitionOfDone`,
  `TestStartRequiresFreshPreflightAndConfirm`, `TestReconcileOrphansAfterCrash`) and in
  `cli-os/internal/server/{e2e_test.go,runs_api_test.go}` for the HTTP surface.
- Run everything: `cd cli-os && go test ./...` (no root `go.mod` — Go commands only work from
  inside `cli-os/`).

**Protocol-level checks** (the six canonical loop prompts, `.l00prite/` schema, byte-parity):
`scripts/validate-l00prite.js` is one of the **two review-gated files** — do not add assertions
to it in an ungated pass. New protocol-level invariants that would need a new validator
assertion belong in the quarantined **v1.2 gated batch** (`.l00prite/todos.md`, "v1.2 gated
batch" section) — reviewed together with the other gated-file changes, never piecemeal. If you
need a check *now* without touching the validator: write it as an external, doctor-style script
(read-only, exits non-zero on a real problem, does not live inside the gated file) — see
`l00prite-diagnostics-and-tooling` for the shipped examples of that pattern
(`check-parity.sh`, `verify-all.sh`).

**Scaffolded-project checks**: for anything checking the shape/health of a *target* project's
`.l00prite/` (as opposed to this repo's own protocol source), that's what
`scripts/l00prite-doctor.js` is for — it's not gated, and it's the tool referenced throughout
Part A above.

### Acceptance thresholds in this repo

- **Exit codes are the only automated machine gate today** — there is no CI to fall back on
  (see the "NOT covered" note in §4). `go test ./...`, `node scripts/validate-l00prite.js`, and
  `node scripts/l00prite-doctor.js .` each communicate pass/fail purely through their process
  exit code; treat a nonzero exit from any of them as a hard stop, not a warning to note and
  continue past.
- **Doctor's `warn` still exits `0`.** Only `fail > 0` flips the doctor's exit code to `1`
  (verified by reading `scripts/l00prite-doctor.js`'s final `process.exit(counts.fail > 0 ? 1
  : 0)`). A `warn` is a real signal to read, but it will not stop a script that only checks the
  exit code.
- **What "green" must mean in a ledger claim**, restated for repo-dev work specifically: the
  exact command, its exit code, and a one-line summary of the count (e.g. "519 PASS, 0 FAIL",
  not "validator passed") — for every check you're claiming, per the evidence standard in Part
  A §1. A PR description or ledger entry that says "all tests pass" with nothing else is
  exactly the Verifier Theater pattern this whole skill exists to catch — including when you
  are the one writing it.

---

## Provenance and maintenance

| Volatile fact stated above | One-line re-verification command |
|---|---|
| Validator: 519 PASS, 0 FAIL, exit 0 | `node scripts/validate-l00prite.js 2>&1 \| tee /tmp/v.out >/dev/null; echo exit:$?; grep -c '^PASS' /tmp/v.out; grep -c FAIL /tmp/v.out` |
| Doctor: 25 ok / 0 warn / 0 fail, HEALTHY, exit 0 | `node scripts/l00prite-doctor.js .; echo exit:$?` |
| Go test: all packages pass, 144 top-level test functions (~170 incl. subtests) | `cd cli-os && go test ./... && grep -rE '^func Test' --include='*_test.go' . \| wc -l` |
| The four named PR #24 regression tests exist and pass | `cd cli-os && go test ./internal/engine/... -run 'TestCommandAllowlistRejectsShellChaining|TestConstraintsMdIsProtocolProtected|TestSearchFilesSkipsSymlinkedFiles|TestDecideRejectsCrossRunApproval' -v` |
| `dist.sh` produces 5 archives + `SHA256SUMS` | `cd cli-os && bash scripts/dist.sh vcheck && ls dist/ && rm -rf dist/` |
| The `sandbox` branch is the only benchmark artifact and is not on `main` | `git log --oneline origin/sandbox -1` and `git merge-base --is-ancestor origin/sandbox origin/main; echo $?` (nonzero = not an ancestor, i.e. not merged) |
| No `.github/workflows/` (no CI backstop) exists | `ls .github/workflows/ 2>&1` (expect "No such file or directory") |
| `uitest.js` was never committed | `git log --all --oneline -- '**/uitest.js'` (expect no output) |
| The doctor's Verifier Theater check keys on a literal `## Runs` heading | `grep -n "Runs" scripts/l00prite-doctor.js` and read the surrounding block |
| The two review-gated files are unchanged by this skill's guidance | `git log -1 --oneline -- .claude/commands/build-loop.md scripts/validate-l00prite.js` |
| The ledger's evidence-field wording (Part A §1) matches the canonical template | `diff <(sed -n '1,25p' .l00prite/ledger.md) <(sed -n '1,25p' templates/l00prite/ledger.md)` |
| Verifier Theater is seeded into a fresh scaffold's `failures.md` | `grep -n "Verifier Theater" examples/vendor-neutral-output/.l00prite/failures.md` |
