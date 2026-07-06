---
name: l00prite-change-control
description: >
  Scope: l00prite repo development. Load this BEFORE editing anything in the l00prite repo
  itself (not an adopter project). Triggers: about to touch .claude/commands/build-loop.md or
  scripts/validate-l00prite.js; editing any file under templates/l00prite/prompts/ or its six
  mirrors; writing to .l00prite/ memory files; a path matches the Autonomous-Edit Denylist in
  .l00prite/constraints.md; opening a PR, restarting a branch after a squash-merge, or ending a
  session (including one cut off by a usage limit). Delivers: the change-classification table
  (which gate applies to which kind of edit), the byte-parity edit procedure, the branch and
  merged-branch-restart protocol, the session-end ledger ritual, the model-tier convention, and
  the non-negotiables list with the incident behind each rule.
---

# l00prite change control

**Scope: l00prite repo development.** This skill is for a session working inside the l00prite
repo itself — the protocol and its tooling (`templates/`, `scripts/`, `.claude/`, `.codex/`,
`cli-os/`, this repo's own `.l00prite/`). If you are instead in some *other* project that has
adopted l00prite (it has its own `.l00prite/` folder but is not this repo), this skill does not
apply — see `l00prite-adopting` or `l00prite-loop-operations` instead, which are written for
that audience.

## What this skill is for

Before you change anything in this repo — a prompt, a doc, a memory file, a line of Go, a line
in a review-gated file — load this skill to know which class of change you're making, which
gate(s) apply, the exact procedure, and the incident that put the gate there in the first
place. This repo enforces its own discipline on itself: the two files that define the protocol's
rules (the scaffold command and the validator) are themselves gated so that no autonomous loop
can rewrite the rules it is supposed to follow. Getting this wrong is the single failure mode
the whole protocol exists to prevent (the "self-modification" problem) — so this is the skill to
load first, not last.

## When NOT to use this

| Situation | Use instead |
|---|---|
| You already broke something and need to diagnose a validator/doctor/go-test failure | `l00prite-debugging-playbook` (Part B — repo-dev triage) |
| You want the WHY behind a design decision, not the procedure for changing it | `l00prite-architecture-contract` |
| You want the full chronicle of a past incident, PR review round, or rejected design | `l00prite-failure-archaeology` |
| You want the shipped `check-parity.sh`/`verify-all.sh` scripts or exact validator/doctor output grammar | `l00prite-diagnostics-and-tooling` (Part B) |
| You're deciding what counts as acceptable ledger evidence, or adding a test | `l00prite-validation-and-qa` (Part B) |
| You're maintaining docs of record, house style, or the stale-docs inventory | `l00prite-docs-and-claims` |
| You're actually building the Dashboard Runs view | `l00prite-runs-view-campaign` |
| You're deciding whether an idea is worth building before you build it | `l00prite-research-methodology` |
| You need a fresh-clone-to-green build/test walkthrough | `l00prite-build-and-env` |
| You're working in an ADOPTER project's own `.l00prite/`, not this repo | `l00prite-adopting` / `l00prite-loop-operations` (portable family) |
| You need the Go internals of the engine's tool jail, not just the change-control rule | `l00prite-cli-os-internals` |

---

## 1. Change-classification table

Work out which row you're in before you touch anything. All commands below assume your working
directory is the repo root (`/home/user/l00prite` in this environment; use your own checkout's
root elsewhere).

| Class | Example | Gate(s) | Procedure | Verification |
|---|---|---|---|---|
| **(a) Ordinary code/doc change** | Editing `README.md`, a `docs/*.md` file, or a non-canonical script | Branch policy only (§5) | Edit → run whatever check the file affects (validator if it's a validated path, `go build`/`go vet` if Go) → commit → ledger entry if substantive | `node scripts/validate-l00prite.js 2>&1 \| tail -5` if the file is validator-checked |
| **(b) Canonical prompt change** | Editing `templates/l00prite/prompts/execute-loop.md` (or any of the other five) | Byte-parity (§4) | Edit the **canonical** file only, then re-copy to all six mirrors, then validate | `node scripts/validate-l00prite.js` → expect `0 FAIL` |
| **(c) Memory-file change** | Writing `.l00prite/ledger.md`, `todos.md`, `memory.md`, `failures.md`, `state.json`, `heartbeat.json`, or anything under `events/`/`reviews/`/`sessions/` | Lock protocol (`.l00prite/LOCKING.md`) | Read `lock.json` → acquire if `unlocked`/`released`/`expired` → write → release before stopping | `cat .l00prite/lock.json` before and after |
| **(d) Review-gated file change** | Editing `.claude/commands/build-loop.md` or `scripts/validate-l00prite.js` | **STOP** — human review required (§2) | Do not edit unless the maintainer has explicitly authorized touching this file **on this branch, in this session**; even then, merge to `main` still requires separate sign-off | none substitutes for the maintainer's review |
| **(e) Denylist-covered path** | `.env`, anything matching `**/*_key*`/`**/*_secret*`, `.github/workflows/**`, or any protocol file in the denylist (§3) | Autonomous-Edit Denylist → `destructive_operation_required` boundary (in the prompt protocol) / gate-then-approve (in the cli-os engine) | Treat as needing explicit per-action human permission before writing, exactly like a live Execution Mode run would | n/a outside a run — human judgment; inside an engine run, the write is gated automatically |
| **(f) cli-os code** | Anything under `cli-os/internal/`, `cli-os/cmd/` | Normal Go discipline + branch policy | Edit → `go build ./... && go vet ./... && go test ./...` (from `cli-os/`, no root `go.mod`) → `gofmt -l .` clean → commit | `cd cli-os && go build ./... && go vet ./... && go test ./...` |
| **(g) New validator check** | Adding an assertion to `scripts/validate-l00prite.js` | Doubly gated: it IS the review-gated file (d), and it must not be done piecemeal — batch it (§2, v1.2 precedent) | Do not add ad hoc; queue it as part of one coherent, maintainer-reviewed batch alongside any other gated-file work | n/a until the batch is reviewed |

Verified 2026-07-06: rows (b)/(d)/(g) checked directly against `scripts/validate-l00prite.js`
source; row (c) against `.l00prite/LOCKING.md`; row (e) against `.l00prite/constraints.md` and
`cli-os/internal/engine/tools.go`; row (f) by running the commands from a clean tree (`go build
./... && go vet ./... && go test ./...` all exited 0).

---

## 2. The two review-gated files — what they are and why

**`.claude/commands/build-loop.md`** (the core Planning-Mode scaffold command) and
**`scripts/validate-l00prite.js`** (the validator) are the two files this repo will not let an
autonomous loop change without a human stopping to look first. `CLAUDE.md` §6 states this
plainly: *"mandatory human review before: (1) any change to `.claude/commands/build-loop.md`
(core scaffold command), (2) any change to `scripts/validate-l00prite.js` (validator logic), (3)
declaring a release's Definition of Done met."* `.l00prite/constraints.md` states the same rule
under Hard Rules: *"No change to `.claude/commands/build-loop.md` or `scripts/validate-l00prite.js`
without stopping for human review first (see `heartbeat.json` `human_review_gates`)."*

**Why these two, specifically:** the scaffold command decides what a new project starts with,
and the validator decides what "passing" means for the whole protocol. Between them they *are*
the rules. If a loop could edit its own validator, it could make any change look green by
weakening the check that would have caught it — the self-modification failure the entire
Execution Mode design exists to prevent (see `memory.md`: *"A running loop may never raise its
own limits"*). The engine's own code states the identical logic for why `.l00prite/constraints.md`
is hard-denied rather than merely denylist-gated (`cli-os/internal/engine/tools.go`,
`protocolProtected`): *"if it were only Denylist-gated ... a run could edit constraints.md to
remove/loosen entries and then, next iteration, freely edit whatever it just unprotected —
defeating the self-modification guard entirely."* The two review-gated files are the
prompt-protocol's version of that exact same hazard.

**History you should know before touching either file:**

- **2026-07-02, branch `claude/powerful-helper-agent-pfsyj1`:** the only run on record where both
  gated files were legitimately edited — because the maintainer's own in-session direction
  message explicitly authorized it (v1.1: universal vendor layer + Execution Mode). Even so,
  `memory.md` records: *"The 2026-07-02 changes to both were made at the maintainer's explicit
  direction on the review branch and still require review before merge."* As of 2026-07-06 that
  branch's work has been merged into `main` in substance (validator now runs 519 checks, up from
  209), but treat "maintainer said go ahead this session" and "maintainer signed off on the
  merged diff" as two separate approvals — the first authorizes touching the file, the second
  authorizes shipping it.
- **Five ledger passes since have advertised zero edits to either gated file**, as of
  2026-07-06 (dated — re-verify, see Provenance): the 2026-07-04T09:00:00Z loop-maturity gap
  pass (*"Zero-line diff to `.claude/commands/build-loop.md` and `scripts/validate-l00prite.js`"*),
  the 2026-07-04T11:30:00Z PR #16 review-response round (*"Zero-line diff ... held"*), the
  2026-07-05T19:10:34Z OS-APK build pass (*"Zero-line diff ... held"*), the
  2026-07-06T11:12:19Z prompt-caching pass, and the 2026-07-06T11:35:49Z planner cache-miss fix
  (both: *"Zero edits to the two review-gated files"*). The pattern is deliberate, not
  incidental — each of these entries records it as an explicit constraint satisfied, not an
  afterthought.
- **The v1.2 batch is quarantined *because* it needs gated edits.** `.l00prite/todos.md` heads
  this off explicitly: *"## v1.2 gated batch (maintainer review required — review together, do
  not start piecemeal)"* followed by *"it is quarantined here as one coherent batch for the
  maintainer to review as a unit — so nobody is tempted to 'just quickly' touch a gated file."*
  The batch includes promoting `no_progress_detected`/`budget_exceeded` to real boundaries
  (nine → eleven), which necessarily touches both hardcoded arrays in the validator
  (`RUN_BOUNDARIES` and `RUN_BOUNDARY_IDS`) and the gated `build-loop.md`'s "nine run
  boundaries" line. **Do not implement one item from this batch alone** — it was deliberately
  scoped as an all-or-nothing review unit.

---

## 3. The Autonomous-Edit Denylist

Machine-readable glob list, quoted verbatim from `.l00prite/constraints.md` (verified
2026-07-06):

```gitignore
# Review-gated files — human review required before any change
.claude/commands/build-loop.md
scripts/validate-l00prite.js
# Protocol files — never agent-edited during a loop
.l00prite/prompts/**
.l00prite/LOCKING.md
templates/l00prite/prompts/**
templates/l00prite/LOCKING.md
AGENTS.md
templates/AGENTS.md.template
templates/adapters/**
# Secrets & credentials
.env
.env.*
**/*_key*
**/*_secret*
# CI / release — human review before changing how this ships
.github/workflows/**
```

Note: `.github/workflows/**` is listed pre-emptively — as of 2026-07-06 this repo has no
`.github/workflows/` directory at all (no CI configured yet), so this entry currently protects
a path that doesn't exist rather than one that does. Don't read its presence as evidence CI
exists.

**Enforcement is two-layered, and the layers are different mechanisms:**

1. **Prompt-protocol layer (any agent following `execute-loop.md`):** a file about to be edited
   that matches a denylist glob trips the existing `destructive_operation_required` run
   boundary — the loop stops and asks for explicit per-action human permission. This is
   documented behavior in the prompt text, not code — a non-compliant model can ignore it.
2. **Engine layer (`cli-os/internal/engine/tools.go`):** two distinct code paths, verified by
   reading the source directly:
   - `protocolProtected(rel)` — an **unconditional hard-deny**, never gate-then-approvable, for
     `.l00prite/heartbeat.json`, `.l00prite/state.json`, `.l00prite/lock.json`,
     `.l00prite/constraints.md`, and everything under `.l00prite/prompts/`. Even
     `approved: true` cannot get past this.
   - `MatchDenylist(tb.Denylist, rel)` — the parsed globs from the target repo's own
     `constraints.md`; a hit returns a `GateDestructive` class gate request instead of an
     outright deny, so a human can approve it per-action.

**Why `constraints.md` itself is hard-denied, not just denylist-gated — the loop-immutability
story:** during PR #24's second review round (Codex bot), a reviewer found that
`.l00prite/constraints.md` — the file that *carries* the denylist — was neither hard-denied nor
covered by its own default denylist. A run could therefore edit `constraints.md` to remove or
loosen an entry, and on the very next iteration freely edit whatever it had just unprotected.
The fix (commit `ff24aac`, per `.l00prite/ledger.md`'s 2026-07-05T19:16:00Z–20:15:00Z entry) made
`constraints.md` unconditionally hard-denied, matching `heartbeat.json`/`state.json`/`lock.json`/
`prompts/**` — "since the whole point of a loop-immutable denylist is that nothing inside the
run, approved or not, can loosen it; only a human editing it outside the run is legitimate."
This is covered by a named regression test, verified passing 2026-07-06:

```
cd cli-os && go test ./internal/engine/... -run TestConstraintsMdIsProtocolProtected -v
```
Observed: `--- PASS: TestConstraintsMdIsProtocolProtected`.

For the other two PR #24 round-2 gate bypasses (shell-chaining suffix on the command allowlist,
and `search_files` following a symlink out of the repo jail) — see `l00prite-failure-archaeology`
for the full story; they are not denylist mechanics, so out of scope here.

---

## 4. Byte-parity edit procedure (canonical prompt / README / LOCKING changes)

**The six loop prompts** (`resume-loop`, `heartbeat`, `event-loop`, `respond-to-review`,
`handoff-summary`, `execute-loop`) have exactly **one** canonical source:
`templates/l00prite/prompts/<name>.md`. Every other copy must be byte-identical, mechanically
enforced. Confirmed by reading `scripts/validate-l00prite.js`: the six mirror directories are

```
.claude/prompts
.codex/prompts
templates/claude/prompts
templates/codex/prompts
.l00prite/prompts
examples/vendor-neutral-output/.l00prite/prompts
```

(canonical + these six = **7 locations** total per prompt, matching the repo's own "byte-identical
across seven locations" framing in `memory.md`).

**Procedure:**

1. Edit **only** `templates/l00prite/prompts/<name>.md`. Never edit a mirror directly — the
   validator will treat any mirror that doesn't match byte-for-byte as drift, whichever side
   changed.
2. Copy the canonical file over all six mirrors, e.g. for `execute-loop.md`:
   ```
   for d in .claude/prompts .codex/prompts templates/claude/prompts templates/codex/prompts \
            .l00prite/prompts examples/vendor-neutral-output/.l00prite/prompts; do
     cp templates/l00prite/prompts/execute-loop.md "$d/execute-loop.md"
   done
   ```
3. Run the validator and expect zero `FAIL` lines (the number of `PASS` lines may legitimately
   grow across releases — it is **not** a fixed contract; `0 FAIL` is):
   ```
   node scripts/validate-l00prite.js 2>&1 | tail -5
   ```
   Verified 2026-07-06: current output is `519 PASS, 0 FAIL`, exit code `0`.
4. Confirm byte-parity directly (belt-and-suspenders beyond the validator), e.g.:
   ```
   for f in .claude/prompts/execute-loop.md .codex/prompts/execute-loop.md \
            templates/claude/prompts/execute-loop.md templates/codex/prompts/execute-loop.md \
            .l00prite/prompts/execute-loop.md \
            examples/vendor-neutral-output/.l00prite/prompts/execute-loop.md; do
     cmp templates/l00prite/prompts/execute-loop.md "$f" && echo "OK: $f"
   done
   ```
   Verified 2026-07-06: all six `cmp` calls exit clean (`OK: <path>` for every mirror).

**Two more things are byte-checked the same way — don't forget them when a prompt-adjacent
file changes:**

- `templates/l00prite/prompts/README.md` is mirrored (2 copies, not 6 — verified: `.claude/prompts/`
  and `.codex/prompts/` carry no `README.md` of their own) to `.l00prite/prompts/README.md` and
  `examples/vendor-neutral-output/.l00prite/prompts/README.md`.
- `templates/l00prite/LOCKING.md` is mirrored (2 copies) to `.l00prite/LOCKING.md` and
  `examples/vendor-neutral-output/.l00prite/LOCKING.md`.

**Vendor adapters are checked differently — three-way, not seven-way**, driven by
`templates/vendors.json` (verified by reading `scripts/validate-l00prite.js`): for a vendor
entry with an `adapter_template`, the validator checks the template exists, the dogfood copy at
`vendor.target_path` (this repo's own root) is byte-identical to it, and the
`examples/vendor-neutral-output/<target_path>` copy is byte-identical to it too. Adding a new
adapter without adding it to `vendors.json`'s manifest (and to the mirror list if it's a loop
prompt) is the exact mistake `failures.md` records from the "prompt-copy drift era" — four
hand-synced copies, keyword-only validation, one bug fixed in 13 places before byte-parity
replaced it. Don't repeat that.

---

## 5. Branch policy and the merged-branch restart protocol

**Policy, quoted from `CLAUDE.md` §6:** *"feature work on a feature branch; no direct commits to
`main`; each file change is its own commit describing what was written and what was verified;
open a PR for maintainer review before merging."* `.l00prite/constraints.md` restates the
maintainer preference: *"Feature branches only; no direct commits to `main`."* and *"No push,
merge, or deploy to `main` without explicit maintainer sign-off."*

**Merged-branch restart protocol — worked example (`.l00prite/ledger.md`, run
2026-07-05T20:17:23Z):** after PR #24 merged (squash-merge to `main` as `e6c9e2e`), the session
discovered GitHub had auto-deleted the `OS-APK` head branch on merge (`git ls-remote` returned
nothing for it). Before restarting the branch, the session confirmed no work would be lost:

```
git diff origin/main origin/OS-APK --stat
```
— an empty diff, meaning nothing on the old branch was orphaned by the squash. Only then did it
recreate the branch fresh from `main`, rather than force-pushing over a branch that no longer
existed:

```
git fetch origin main
git checkout -B OS-APK origin/main
git push -u origin OS-APK
```

**The hiccup to expect:** the ledger records that the *first* attempt used
`git push --force-with-lease` and was rejected as "stale info," because the session's local
remote-tracking ref for `OS-APK` still predated GitHub's auto-delete. A re-fetch surfaced the
real state (branch gone); a plain `push -u` — no force needed, since there was nothing to
overwrite — then succeeded. **Lesson: after any PR merges and its branch vanishes, `git fetch`
before you push anything to its name again; do not reach for `--force`/`--force-with-lease` as
the first move just because a prior push was rejected.**

If you are told to work on a specific already-named branch by the session/task instructions,
that instruction takes precedence over restarting a stale branch of the same name — confirm
which branch you were actually told to use before running the restart sequence.

---

## 6. Session-end ritual

Every session that changes anything in this repo ends by writing memory in this order (observed
consistently across every ledger entry, e.g. the 2026-07-04, 2026-07-05, and 2026-07-06 runs):

1. **`.l00prite/ledger.md`** — append (never overwrite) a full entry: Goal, Triggering event,
   Reviewer/comment reference, Decision, Completed work, Fix implemented, Changed files, Tests
   run/Verification (each with `command`/`exit_code`/`summary`/optional `evidence_path`/
   `timestamp` — a vague "tests passed" does not satisfy this), Response drafted/sent, Event
   status, Failures, Decisions, Confidence, Next action, Do-not-retry notes, Lock.
2. **`CLAUDE.md` §7 Run Ledger** — a compact one-row summary (Session / Date / Built / Tested /
   Status) — this table and the full `ledger.md` entries are complementary, not duplicates: the
   table is the scannable index, `ledger.md` is the evidence.
3. **`.l00prite/todos.md`** — update the active/next state so the next session (possibly a
   different vendor/model) knows what's queued.

**This is required even for a session cut off mid-task — do not skip it because the work felt
incomplete.** The model case on record is the 2026-07-05T19:10:34Z OS-APK build-pass ledger
entry, which explicitly documents its own interruption rather than staying silent about it:
*"the 16-agent adversarial review workflow and the dashboard-Runs-view writer were cut off by a
session usage limit — the multi-agent adversarial pass did NOT complete (its empty findings list
is an artifact of the failure, not a clean bill)."* **The trap this guards against: an empty
findings list from a dead multi-agent pass looks identical to a genuinely clean pass unless the
session records which one it was.** If your session is running low on budget/time, write the
ledger entry stating what did and did not finish *before* you run out, not after — you cannot
write it retroactively once the session is gone.

---

## 7. The model-tier convention

Observed and applied repeatedly across this repo's own ledger (e.g. the 2026-07-04T09:00:00Z
gap-analysis pass: *"Fable 5 advising, Opus as the execution model... Fable's key reframes were
followed exactly"*; the 2026-07-05T19:10:34Z OS-APK pass: *"Fable 5 authored the design, the
engine loop/pre-flight/exec core, and all reviews; Opus subagents wrote the peripheral units to
file-level specs"*): **unless the maintainer states otherwise, Fable-class models act as
advisor — design, specs, adjudication of ambiguous findings, final judgment on scope — and
lesser models (Opus/Sonnet-class) do the bulk execution against those specs.** The goal is
Fable-standard output from cheaper execution sessions. When you're unsure whether a change needs
sign-off from "the advisor," check whether it's scope-defining (touches a gated file, adds a run
boundary, changes an invariant) versus mechanical execution against an already-agreed spec — the
former routes through the advisor pattern, the latter doesn't need to.

---

## 8. Non-negotiables

Each of these has cost the project something before — that's why it's a rule, not a preference.

| Rule | Why | Incident |
|---|---|---|
| Never pre-arm Execution Mode at scaffold time | A confirmation predating the code it covers would leave the repo sitting armed on disk for any later agent to discover | Rejected in the 2026-07-02 adversarial design review, recorded in `failures.md` as a do-not-retry shape |
| Persisted flags (`preflight_confirmed`, `execution.enabled`, `execution_active`) never authorize a run | They live in agent-writable JSON — forgeable and transferable across sessions; only a fresh, in-session, human confirmation counts | Same 2026-07-02 review; restated in `memory.md`: *"any agent can write them, so honoring them would be a forgeable blanket grant"* |
| Never ship loaded vendor config (e.g. `.aider.conf.yml`, `.gemini/settings.json`) into a target repo | Repo-root config silently overrides a user's own per-key settings; conventional gitignore patterns can swallow the file anyway | Rejected design shape from the 2026-07-02 review, recorded in `failures.md` |
| Never hardcode provider pricing from training-data memory | Manifests must leave unconfirmed prices `null`/flagged pending a first-party pass — memorized prices go stale silently | Do-not-retry note, `.l00prite/ledger.md` (CLI-OS runtime entry); GLM/Zhipu prices were deliberately deleted after being carried unconfirmed — see `cli-os/docs/pricing-confirmation.md` |
| Never claim live-provider readiness without an egress-enabled smoke test | Adapter code being unit-tested is not the same as it working against a real, reachable provider endpoint | Do-not-retry note, same ledger entry: *"do not claim live-provider readiness without an egress-enabled smoke test"* |
| Never write to a `.l00prite/` memory file another agent's lock currently holds | `lock_lease_conflict` means writing nothing to foreign-held memory, not writing anyway and hoping | `.l00prite/LOCKING.md` rule 3; the cooperative-lock convention exists specifically to reduce (not eliminate) this race |
| No push, merge, or deploy to `main` without explicit maintainer sign-off, and no push/merge/deploy action without per-action permission during an Execution Mode run | Distinct from ordinary file edits — these are the actions the protocol treats as requiring a human in the loop every time, not just once at pre-flight | `.l00prite/constraints.md` Hard Rules; `execute-loop.md`'s per-action permission list |

---

## Provenance and maintenance

Every fact above is dated **2026-07-06** and should be re-verified before you rely on it,
especially counts, branch states, and PASS totals — this repo's own `failures.md` records that
banners and counts rot while ledger/git stay truthful.

| Volatile fact stated above | Re-verification command |
|---|---|
| Validator: 519 PASS, 0 FAIL, exit 0 (FAIL routes to stderr) | `node scripts/validate-l00prite.js 2>&1 \| tail -5` (or `... 2>/dev/null \| grep -c PASS` / `... 1>/dev/null \| wc -l` for the FAIL count) |
| Doctor: 25 ok / 0 warn / 0 fail, HEALTHY | `node scripts/l00prite-doctor.js .` |
| `execute-loop.md` byte-identical across canonical + 6 mirrors | `for f in .claude/prompts/execute-loop.md .codex/prompts/execute-loop.md templates/claude/prompts/execute-loop.md templates/codex/prompts/execute-loop.md .l00prite/prompts/execute-loop.md examples/vendor-neutral-output/.l00prite/prompts/execute-loop.md; do cmp templates/l00prite/prompts/execute-loop.md "$f"; done` (no output = all match) |
| The two review-gated files exist and are the only files so gated | `sed -n '/Human review gates/,/Branch policy/p' CLAUDE.md` and `sed -n '/Autonomous-Edit Denylist/,/Auto-merge/p' .l00prite/constraints.md` |
| Autonomous-Edit Denylist glob list (quoted in §3) | `grep -A 20 "## Autonomous-Edit Denylist" .l00prite/constraints.md` |
| `constraints.md` is engine-hard-denied (`protocolProtected`) | `grep -n "protocolProtected" cli-os/internal/engine/tools.go` and run the regression test below |
| Regression test `TestConstraintsMdIsProtocolProtected` passes | `cd cli-os && go test ./internal/engine/... -run TestConstraintsMdIsProtocolProtected -v` |
| `go test ./...` all green in `cli-os/` | `cd cli-os && go test ./...` |
| v1.2 gated batch is quarantined, not started piecemeal | `grep -n "v1.2 gated batch" .l00prite/todos.md` |
| Five ledger entries advertise "zero edits"/"zero-line diff" to the gated files | `grep -n "Zero-line diff\|Zero edits" .l00prite/ledger.md` |
| Current lock.json status (should be `released` when nobody is mid-write) | `cat .l00prite/lock.json` |
| Branch/HEAD state relative to `origin/main` | `git rev-parse HEAD origin/main` (identical output = your branch is level with main) |
| No `.github/workflows/` exists yet (denylist entry is pre-emptive) | `ls .github/workflows 2>&1` (expect "No such file or directory" if still true) |
