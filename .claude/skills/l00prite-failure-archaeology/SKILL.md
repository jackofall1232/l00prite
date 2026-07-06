---
name: l00prite-failure-archaeology
description: >
  Scope: l00prite repo development. Load this before re-investigating something that already
  happened in l00prite's own history — a suspicious gap in PR numbering (#3/#4/#12/#13 missing
  from main), a "why does CLAUDE.md say X but the code doesn't do X" moment, a doc claiming
  "18/18" tests that don't exist on disk, a Node.js file inside cli-os/ that looks abandoned, a
  GLM/third-party price that looks half-confirmed, or before citing any commit hash, PR number,
  or "N findings fixed" claim from this repo's past. Chronicles every settled incident as
  Symptom → Root cause → Evidence (commit/PR/file:line) → Status, so no one re-fights a battle
  this repo already won (or re-discovers a trap it already fell into). Not for live triage of a
  symptom happening right now (use l00prite-debugging-playbook) or for the reasoning behind a
  design decision (use l00prite-architecture-contract).
---

## What this skill is for

This is the chronicle. l00prite's git history, ledger, and `HANDOFF.md` contain a dozen-plus
settled incidents — bugs found and fixed, designs proposed and rejected, branches that looked
like lost work but weren't, evidence that was cited but never committed. Each one cost someone
real time to discover once. This skill mines `git log`, `.l00prite/ledger.md`, `HANDOFF.md`,
`.l00prite/failures.md`, and `.l00prite/memory.md` so the next session doesn't have to
re-discover them — and doesn't accidentally build on a premise ("18/18 tests prove it")
that isn't actually reproducible.

Every entry below follows one strict format: **Symptom → Root cause → Evidence → Status**.
"Evidence" always names a real commit hash, PR number, file path, or command you can re-run
yourself — this skill does not ask you to trust a summary, including its own.

All facts, counts, and commit hashes below are dated **(as of 2026-07-06)** — re-verify before
relying on them for anything consequential; see "Provenance and maintenance" at the end.

## When NOT to use this

| If you need... | Use instead |
|---|---|
| Why a decision was made, or whether a proposed change would violate an invariant | `l00prite-architecture-contract` |
| To triage a symptom happening to you right now (validator FAIL, doctor FAIL, `go test` failure) | `l00prite-debugging-playbook` |
| The change-classification table / procedure for a change you're about to make | `l00prite-change-control` |
| The current stale-docs inventory / which docs are docs-of-record vs historical | `l00prite-docs-and-claims` |
| The golden validator/doctor/test-count inventory and the evidence standard for ledger entries | `l00prite-validation-and-qa` |
| A reusable proof method (worth-it analysis, fail-closed analysis, byte-identity proof, security-gate analysis) with worked examples | `l00prite-proof-and-analysis-toolkit` |
| How an idea moves from hunch to accepted result here (the research pipeline itself) | `l00prite-research-methodology` |
| To actually build the Dashboard Runs view | `l00prite-runs-view-campaign` |
| Deep Go runtime internals (routing, engine internals, package map) | `l00prite-cli-os-internals` |

## How to read this chronicle

- **Trust order**: `.l00prite/ledger.md` run entries (dated, evidence-bearing) and `git log` >
  `HANDOFF.md` (narrative, may lag) > `CLAUDE.md` Run Ledger (compact, may lag further) > any
  banner/count in a topic doc. If a claim below and the live repo disagree, the live repo wins —
  re-run the command in "Evidence."
- **PR numbers here are GitHub pull-request numbers**, not commit positions. Several PR numbers
  in this repo's history do not correspond to a distinct merge commit on `main` — see entry 9
  before you go looking for a "missing" PR.
- **Ghost-PR / commit archaeology needs one read-only fetch first** (safe — it only creates local
  refs, no push, no branch mutation):
  ```
  git fetch origin 'refs/pull/*/head:refs/pr/*'
  ```
  After that, `refs/pr/<N>` exists locally for any PR GitHub still has a head ref for, and you can
  `git log -1 --format="%H %s" refs/pr/<N>` or `git show --stat refs/pr/<N>` to inspect it.

## The chronicle

### 1. The doc-only execution-mode commit (`87384b4`)

- **Symptom**: `CLAUDE.md` described an `--execute` flag, a pre-flight confirmation display,
  `execute-loop` prompts, and 8 stop conditions as though they were built and were "this
  session's mission."
- **Root cause**: commit `87384b4` ("Add execution mode to l00prite with safety features",
  2026-07-01) touched exactly **one file** — `CLAUDE.md` — rewriting its prose (75
  insertions / 41 deletions). No `execute-loop.md`, no `--execute` flag handling, no execution
  schema field existed anywhere else in the repo.
- **Evidence**: `git show --stat 87384b4` → `CLAUDE.md | 116 +++++++++--- 1 file changed, 75
  insertions(+), 41 deletions(-)`. Corrected in `b2903b3` ("Pre-release polish: correct
  CLAUDE.md, dogfood `.l00prite/`, add RELEASE.md (#9)", 2026-07-01), whose own commit message
  states it plainly: *"CLAUDE.md previously described execution mode as this session's mission,
  but no execute-loop files, --execute flag, or execution schema fields exist anywhere in the
  repo (commit 87384b4 only edited CLAUDE.md's own text)."* Superseded by the real, code-backed
  build in `5daf92b` ("Add Execution Mode with universal vendor layer and canonical loop
  prompts", 2026-07-02).
- **Status**: Fixed / superseded. This is the canonical "doc/reality drift" example — see
  `l00prite-debugging-playbook`'s TRAP #2 and `l00prite-docs-and-claims`'s claim discipline.

### 2. Prompt-copy drift era

- **Symptom**: the six loop prompts were maintained as four hand-synchronized copies
  (`.codex/prompts/`, `.claude/prompts/`, `templates/codex/prompts/`, and later a Claude
  template set), validated only by keyword presence. One PR had to fix the same bug in
  **13 places**. A hardcoded `.codex/prompts/` next-step path shipped inside even the
  Claude-only mirrors.
- **Root cause**: the pre-v1.1 validator checked that a prompt file existed and contained
  certain substrings — never that separately-edited copies stayed identical to each other.
- **Evidence**: `.l00prite/failures.md` → *"Maintaining the loop prompts as four
  hand-synchronized copies with keyword-only validation — copies drifted in spirit (a
  hardcoded `.codex/prompts/` path shipped inside even the Claude mirrors) and one PR had to
  fix the same bug in 13 places."* `HANDOFF.md`'s v1.1 entry: *"The old model (4 hand-maintained
  copies, keyword-only validation, a hardcoded `.codex/` path baked into even the Claude
  copies) is gone; the validator now fails on any byte drift."*
- **Status**: Fixed by the byte-parity system introduced in `5daf92b` (v1.1) — one canonical
  source (`templates/l00prite/prompts/`), byte-identical mirrors in 6 more locations,
  mechanically enforced (`node scripts/validate-l00prite.js` → 519 PASS / 0 FAIL as of
  2026-07-06). The byte-parity **edit procedure** itself is `l00prite-change-control`'s home
  content, not this skill's.

### 3. PR #7 review round (lock/lease + events)

- **Symptom**: an independent review of the just-added lock/lease and event-lifecycle design
  found: `lock.json` documented `status: "expired"` as a valid state but no rule permitted
  acquiring or reclaiming a lock in that state; `resume-loop.md` told an agent to stop on *any*
  active unexpired lock — including one it already owned — so an agent making several
  protected-path writes in one run could block on its own first write; `event-loop.md` /
  `respond-to-review.md` documented a `pending → processing → completed` lifecycle but never
  actually moved the event file into `processing/` before executing; `LOCKING.md` was
  referenced as a bare filename (ambiguous from nested directories) in 13 places; the ledger
  template had no `Lock` field.
- **Root cause**: the initial lock/lease + event-lifecycle design didn't anticipate these
  edge cases (self-lock, unreclaimable `expired`, crash-visible in-progress state, relative
  path ambiguity).
- **Evidence**: `.l00prite/memory.md` / `HANDOFF.md` "PR review fixes — lock state machine,
  event lifecycle, Claude parity" section attributes findings to gemini-code-assist, Copilot,
  and Codex by name, each with the specific fix. All folded into the squash-merged commit
  `6c7160a` ("Protocol hardening: lock/lease, untrusted-content warnings, parity (#7)").
- **Status**: All fixed on `main` in `6c7160a`.

### 4. PR #16 round (doctor robustness + the template-text-as-evidence false positive)

- **Symptom**: `scripts/l00prite-doctor.js` (new in this same pass) mis-handled non-object
  control JSON, `events/pending/` being a file instead of a directory, and unparseable
  `lock.json` dates. Separately, a **false positive**: the doctor's ledger-evidence check read
  the ledger's entry-template preamble — which always contains the words "command", "exit_code",
  "evidence_path" as field labels — and could report "evidence present" even when the real
  `## Runs` section had none.
- **Root cause**: the first pass of the doctor read whole-file text for these checks without
  validating JSON shape, without excluding the template preamble from the evidence scan, and
  without disarming *both* `heartbeat.json` and `state.json` together on stale-run recovery.
- **Evidence**: `.l00prite/ledger.md` Run `2026-07-04T11:30:00Z` entry ("PR #16 round").
  `scripts/l00prite-doctor.js` line 38 (`data === null || typeof data !== 'object' ||
  Array.isArray(data)`), line 44 (`isParsableDate`), and lines 239-248, which explicitly
  comment: *"Only inspect the actual run history, not the entry-template preamble... Require a
  concrete verification signal (an exit code or an evidence path), not the mere presence of a
  'Tests run / Verification' field label."* This check **depends on finding a literal
  `## Runs` heading** — a fact `l00prite-diagnostics-and-tooling` and
  `l00prite-debugging-playbook` also cite; don't remove that heading from a ledger without
  knowing this.
- **Status**: Fixed, each with a negative test (a 5-way broken-copy test produced 3 FAIL + 2
  WARN, exit 1, as intended — per the same ledger entry).

### 5. PR #22 round (register-repo re-homing, duplicate-insert race, the fabricated dashboard)

- **Symptom (security)**: the authenticated repo-registration endpoint (`POST /v1/repos`)
  accepted an explicit, different `project` id in the request body, letting a token re-home a
  host directory into a project it didn't belong to.
- **Symptom (race)**: a concurrent duplicate registration could pass a "does this id already
  exist" check and then both requests `INSERT`, with the loser hitting a raw DB-constraint 500
  instead of a clean 409.
- **Symptom (history, from the earlier PR #18 pass)**: `public/dashboard.html` was **100%
  static** — every number (repo count, agent panel, uptime %, spend figures, latency, "142/142
  tests passed") was hardcoded, not sourced from anything real.
- **Root cause**: the register endpoint trusted a client-supplied project field instead of
  forcing the acting token's own project; the duplicate check and the `INSERT` were two
  separate statements, not one transaction; the dashboard predated any real backend endpoint
  to source it from.
- **Evidence**: `.l00prite/ledger.md` Run `2026-07-04T23:30:00Z` ("register now lands in the
  acting token's project and an explicit different project is 403 ... duplicate-check+INSERT
  made one transaction"). `cli-os/docs/dashboard-and-setup.md` §1 has the **full
  fabricated-value → real-source table** (e.g. "4 agents running" panel removed outright —
  *"there is no agent runtime in this gateway"*; "99.98% uptime" replaced by real process
  uptime or "not tracked"). The real-data pass landed as `f61b015` ("CLI-OS: real dashboard
  data + zero-config first-run wizard (#18)").
- **Status**: Fixed. Everything above, including the review-round commits, is squashed into
  `main` as `4b7f3b2` ("CLI-OS onboarding & friction pass: setup wizard, dashboard, Playground
  (#22)").

### 6. PR #24 — two review rounds, 21 findings, three real gate bypasses

- **Symptom, round 1 (Gemini + Copilot)**: several call sites (`ActiveRunForRepo`,
  `ReadSnapshot` inside `StartRun`/`iterate`, `ReadLock`) treated an *error* the same as
  "nothing found," which could silently compromise the engine's mutual-exclusion guarantee;
  `awaitApproval` nil-pointer-panicked when a run's handle was no longer registered;
  `parseArgs` assumed a tool call's `arguments` was always a JSON string (it can arrive
  pre-decoded); `search_files` could choke on a binary file.
- **Symptom, round 2 (Codex) — three real security-critical gate bypasses**:
  (a) the command allowlist matched by **prefix**, so an allowlisted `"go test ./..."` could be
  appended with `"; rm -rf /"` and the whole compound string ran, unapproved;
  (b) `.l00prite/constraints.md` — the file that itself *carries* the Autonomous-Edit Denylist —
  was neither hard-denied nor covered by the default denylist, so a run could loosen its own
  denylist and exploit the loosened rule the very next iteration;
  (c) `search_files` read through a symlink pointing outside the repo root via a raw
  `os.ReadFile`, unlike `read_file`'s `resolvePath` containment.
- **Root cause**: round 1 is incomplete error handling at a few call sites. Round 2's three
  bypasses are each an instance of a general pattern — see `l00prite-proof-and-analysis-toolkit`'s
  security-gate-analysis recipe, which generalizes exactly these three: prefix-match without
  suffix validation, a gate whose own config lives outside the gate, and inconsistent path
  containment across two similar-looking read paths.
- **Evidence**: `.l00prite/ledger.md` Run `2026-07-05T19:16:00Z to 2026-07-05T20:15:00Z`.
  Commits `ce0b11c` ("fix: address PR #24 review findings (Gemini + Copilot)") and `ff24aac`
  ("fix: address PR #24 review findings (Codex) — close three real gate bypasses") — both live
  on the PR branch, reachable as `refs/pr/24` after the fetch command above, and squashed into
  `main`'s single-parent merge commit `e6c9e2e` (parent `bc7448a` — confirm with
  `git log -1 --format=%P e6c9e2e`). Regression tests, grepped and present in
  `cli-os/internal/engine/`: `TestCommandAllowlistRejectsShellChaining`,
  `TestSearchFilesSkipsSymlinkedFiles` (`tools_test.go`), the constraints.md hard-deny test at
  `tools_test.go` (commented `// ---- constraints.md self-modification guard (PR #24 review) ----`),
  `TestGitBranchDestructiveFlagsGate`, `TestDecideRejectsCrossRunApproval`
  (`run_integration_test.go`), `TestBuildPreflightRecoversOwnUnexpiredLease`
  (`preflight_test.go`), `TestParseArgsAcceptsStringOrObject` (`helpers_test.go`).
- **Status**: Fixed, merged to `main` as `e6c9e2e`. Every finding has a dedicated regression
  test (7 new tests total, per the ledger). The judgment call flagged for the maintainer but
  not reversed: the shell-chaining fix denylists metacharacters (`;&|` + backtick + `` $<> ``
  + newline) only on the *appended* suffix of a prefix match — an **exact** match against the
  allowlist string itself is never blocked, even if that literal string contains
  metacharacters (a human pre-approved that exact compound command at pre-flight).

### 7. Rejected design shapes (do-not-retry)

From the 2026-07-02 adversarial three-critic design review before v1.1 shipped. All five are
recorded in both `.l00prite/failures.md` ("Failed Approaches") and `.l00prite/memory.md`
("Design decisions recorded (and rejected alternatives)"):

| Rejected shape | Why it was killed |
|---|---|
| `--execute` writing `execution.enabled: true` at scaffold time ("pre-arming") | The confirmation would predate the code it covers; the repo would sit armed on disk for any later agent to discover. |
| Treating a persisted `preflight_confirmed: true` as authorization for a new run | The field lives in agent-writable `heartbeat.json` — forgeable and transferable across sessions; audit record only. |
| Bare-pointer vendor adapters ("just read `AGENTS.md`") | Delivers nothing on Copilot surfaces that can't open other files; Zed's first-match priority list lets `.github/copilot-instructions.md` shadow `AGENTS.md` entirely. |
| Shipping `.aider.conf.yml` (or any auto-loaded vendor config) into target repos | Aider merges config per-key with repo-root winning — silently overrides a user's own settings; the conventional `.aider*` gitignore pattern would swallow the file anyway. |
| Naming the execution boundary list `stop_conditions` | `heartbeat.json` already has a top-level `stop_conditions` with different semantics; the collision made governance ambiguous. It is `run_boundaries`. |

- **Status**: do-not-retry, standing as of 2026-07-06.

### 8. Node → Go double build

- **Symptom**: the entire `cli-os/` runtime was designed, built, and tested once in Node.js
  (PR #15, squash-merged as `b5998d1`), then rewritten from scratch in Go about the same week
  (PR #17, `6d23287`) — discarding the Node implementation, which remains on disk only as an
  orphaned test suite.
- **Root cause**: the original 2026-07-04T02:00 build pass chose Node because, per its own
  ledger entry, *"the build environment blocks module fetch + live-provider egress (Go not
  buildable/testable here) while Node runs natively"* — an environment constraint at that
  moment, not a lasting technical preference. Once a build environment with working Go module
  fetch was available, the runtime was ported.
- **Evidence**: `cli-os/docs/node-to-go-port-notes.md` — *"The `cli-os/` runtime was rewritten
  from Node.js to a single statically-compiled Go binary. This is a language port of an
  already-decided design... Q1–Q6 in `open-questions.md` were **not** revisited."* Commit
  `6d23287` ("Port CLI-OS runtime from Node.js to Go (#17)"). `cli-os/test/*.test.js` (4 files:
  `bridge.test.js`, `e2e.test.js`, `routing-auto.test.js`, `unit.test.js`) still exist on disk,
  confirmed present, orphaned — there is no `package.json` anywhere in the repo to run them
  (`npm test` is dead here).
- **Status**: resolved — Go is the shipped runtime (`cd cli-os && go test ./...`). The orphaned
  Node suite is a known, harmless leftover: do not try to "fix" or run
  `cli-os/test/*.test.js`, and do not resurrect it as evidence of anything current.

### 9. Ghost PRs #3/#4 (content landed as #5), #12/#13 (identical commit), #15 consolidation

- **Symptom**: reading `main`'s log by PR number looks like it skips several — there is no
  distinct merge commit for PR #3, #4, #10, #11 (that one is on `sandbox`, never merged to
  `main`), #12, #13, or #14.
- **Root cause**: GitHub PR numbers are allocated per pull-request *object*, not per landed
  commit. Several were closed/superseded and their content re-submitted under a **later** PR's
  number, or two PR numbers point at exactly the same branch head.
- **Evidence** (via `git fetch origin 'refs/pull/*/head:refs/pr/*'`, read-only):
  `refs/pr/3` ("Address vendor-neutral protocol review gaps") and `refs/pr/4` ("Add event
  response protocol (#4)") are not separately reachable from `main`; `main`'s squash commit
  `e0f4736` ("Add codex (#5)") has both sub-messages quoted verbatim in its own commit body
  (`* Add vendor-neutral loop memory protocol, Codex prompts, and .l00prite templates (#3)` ...
  `* Add event response protocol (#4)`) — #3 and #4's work landed inside what GitHub numbered
  PR #5. Likewise `refs/pr/12` and `refs/pr/13` are the **identical commit**
  (`91b2c59d10d1f735159495942cc22fe997067fb8` for both — verify with
  `git for-each-ref refs/pr/12 refs/pr/13`), and PR #14's work ("Auto-routing and provider
  bridging: multi-provider selection and delegation (#14)") is quoted verbatim inside `main`'s
  `b5998d1` ("Cli os (#15)") alongside `* Claude/looprite cli os jntwqi (#13)` — all of PR
  #12/#13/#14's Node-era CLI-OS work landed squashed under PR #15's number.
- **Status**: not a bug, not lost work — a numbering/consolidation artifact of squash-merging
  iterated PRs. Read this repo's PR history by commit **content** (`git log`, commit bodies,
  the PR-ref fetch above), never by assuming PR N appears as its own merge commit on `main`.

### 10. Sandbox branch: the only benchmark evidence in the project

- **Context** (not a failure — included because it's easy to miss or over-trust on a skim): an
  A/B benchmark comparing the l00prite protocol stack against a plain solo Sonnet 5 session.
- **Evidence**: `origin/sandbox`, tip `60aadbd` ("Sandbox A/B test: l00prite stack vs. Sonnet 5
  solo (#11)"), branched from `5daf92b` (right after v1.1, before any CLI-OS work — confirm
  with `git merge-base origin/main origin/sandbox`). Contains `sandbox-results/{comparison.md,
  metrics.csv, task-specs.md, runs/*.diff, runs/*.md}` (verified via
  `git diff --stat origin/main origin/sandbox`). Merged deliberately to `sandbox`, **never to
  `main`**.
- **Status**: standing, isolated on its own branch. If you cite it, read `comparison.md` and
  `metrics.csv` yourself first — don't repeat a remembered number. `l00prite-research-frontier`
  names this as the "measured memory value" axis's one piece of existing evidence, and as the
  precedent for what a future benchmark arm should look like.

### 11. OS-APK stall: the Dashboard Runs view is still undone

- **Symptom**: the run engine's `/v1/runs*` API has been complete and curl-able since
  2026-07-05, but the dashboard has zero Runs UI, and the branch that was building it keeps
  disappearing.
- **Root cause**: the 2026-07-05 OS-APK build session (engine core + the PR #24 21-finding
  review round) was cut off by a **session usage limit** before the dashboard Runs-view writer
  or the planned 16-agent adversarial review could run. After PR #24 merged, GitHub
  auto-deleted the `OS-APK` head branch; it was recreated from `main` per the merged-branch
  restart protocol, then the next session's work pivoted to the prompt-caching pass instead.
  As of 2026-07-06 the `OS-APK` branch is **gone again** from `origin` (confirm with
  `git ls-remote --heads origin | grep -i os-apk` — empty).
- **Evidence**: `.l00prite/todos.md` "Active" section ("Dashboard Runs view... FIRST unit of
  the next pass"). `.l00prite/ledger.md` Run `2026-07-05T19:10:34Z`: *"the 16-agent adversarial
  review workflow and the dashboard-Runs-view writer were cut off by a session usage limit —
  the multi-agent adversarial pass did NOT complete (its empty findings list is an artifact of
  the failure, not a clean bill)."*
- **Status**: open. This is the opening state for whoever picks up the Dashboard Runs view —
  see `l00prite-runs-view-campaign` for the executable plan, which cites this exact stall as
  its starting position.

### 12. `uitest.js`: cited "18/18" twice, never committed

- **Symptom**: two separate ledger entries — Run `2026-07-04T21:40:00Z` ("CLI-OS onboarding")
  and Run `2026-07-04T23:30:00Z` ("PR #22 review round") — both cite
  `node uitest.js (Playwright end-to-end against the real binary)` → exit_code 0, "18/18." No
  `uitest.js` file exists anywhere in the repo, at any point in its history.
- **Root cause**: the harness was run in-session but never `git add`/committed; the ledger
  entries recorded the observed result honestly at the time, but nothing preserved the file
  that would let anyone re-run it.
- **Evidence**: `git log --all --diff-filter=A -- '**/uitest.js'` returns nothing (verify
  yourself — empty output means the file was never added in any commit, on any branch).
- **Status**: the reproducibility lesson, standing. Do not cite "18/18" as current,
  reproducible evidence for anything — it is a claim no one can re-run today.
  `l00prite-runs-view-campaign` fences exactly this mistake for the next Playwright harness:
  commit it, or the evidence is dead the moment the session ends.

### 13. GLM third-party pricing carried, then deliberately deleted

- **Symptom**: an earlier CLI-OS design pass (Run `2026-07-04T00:00:00Z`) shipped a GLM 5.2
  manifest with concrete third-party prices ($1.40 input / $4.40 output / $0.26 cache-read); a
  later pass in the same day removed them and set the fields back to `null`.
- **Root cause**: the first pass's prices came from a research fan-out that could not reach
  GLM's first-party pricing domains (egress-blocked, confirmed HTTP 403) and fell back to
  third-party figures. A dedicated follow-up pass ("Provider pricing confirmation," same day)
  re-verified against first-party domains **only**, found `docs.z.ai`, `open.bigmodel.cn`, and
  `z.ai` all still 403, and removed the third-party numbers rather than carry them forward.
- **Evidence**: `cli-os/docs/pricing-confirmation.md` — *"The previously-carried third-party
  figures for `glm-5.2` ($1.40 input / $4.40 output / $0.26 cache-read) were **removed** — the
  brief is explicit that unconfirmed numbers must not be carried over from memory."* Model
  *ids* (`glm-5.2`, `glm-5.1`, `glm-5v-turbo`) remain SDK-verified and are kept; only the
  prices/context went to `null`. The ledger's do-not-retry note: *"do not hardcode provider
  pricing from training-data memory."*
- **Status**: standing policy, cited as the canonical example of "unconfirmed stays null" — see
  `l00prite-docs-and-claims`'s claim discipline and `l00prite-cli-os-internals`'s manifest
  `price_confidence` field.

### 14. Event-ID collision fix; the "move or copy" ambiguity ban

- **Symptom**: the original event-ID scheme was sequential (`event-0001`) — collision-prone
  the moment two agents create events close together. Separately, the event-lifecycle prompts
  described events moving `pending → processing → completed` using the phrase "move or copy,"
  which permits an implementation that *copies* (leaving the original sitting in `pending/`)
  instead of moving it.
- **Root cause**: the initial (pre-v1.1) event-protocol design didn't anticipate multi-agent
  ID collisions, and didn't notice "move or copy" was actually two different, distinguishable
  behaviors with different crash-visibility properties.
- **Evidence**: `HANDOFF.md`'s "protocol hardening" section: *"Event ID format fixed. IDs now
  follow `event-YYYYMMDD-HHMMSS-source-shortslug-random`... instead of the collision-prone
  `event-0001` sequential style, which is now documented only as an explicit anti-example."* /
  *"Events move `pending → processing → completed` using **move**, not the previous ambiguous
  'move or copy' wording."* Both are now validator-enforced negative checks:
  `scripts/validate-l00prite.js` lines 351, 363, and 383 each assert
  `!prompt.includes('move or copy')`; line 525 asserts the event-ID format
  (`/^event-\d{8}-\d{6}-/`) against `example-event.json`.
- **Status**: fixed, and now part of the standing 519-PASS validator baseline — regressing
  either would show up as an immediate FAIL.

## Provenance and maintenance

Every fact below is dated **(as of 2026-07-06)**. Re-run the command before relying on any of
them for a decision, a PR description, or another skill's cross-reference.

| Volatile fact stated above | Re-verification command |
|---|---|
| Validator: 519 PASS, 0 FAIL | `node scripts/validate-l00prite.js 2>&1 \| grep -c PASS` and `... \| grep -c FAIL` |
| Doctor: 25 ok / 0 warn / 0 fail, HEALTHY | `node scripts/l00prite-doctor.js .` |
| `HEAD` == `origin/main`, tip `c6dee9a` | `git rev-parse HEAD origin/main` |
| PR ghost refs (#3/#4/#12/#13) still resolvable | `git fetch origin 'refs/pull/*/head:refs/pr/*' && git for-each-ref refs/pr/` |
| `refs/pr/12` and `refs/pr/13` are the same commit | `git for-each-ref refs/pr/12 refs/pr/13` (compare the hash column) |
| `sandbox` branch exists, forked at `5daf92b`, never merged to `main` | `git merge-base origin/main origin/sandbox` (expect `5daf92b7ae0c1e8fd579e281a24abe2947b4728f`) |
| `OS-APK` branch is currently absent from `origin` | `git ls-remote --heads origin \| grep -i os-apk` (expect empty) |
| `uitest.js` was never committed, anywhere | `git log --all --diff-filter=A -- '**/uitest.js'` (expect empty) |
| `cli-os/test/*.test.js` orphaned, `npm test` dead (no `package.json` anywhere) | `find . -name package.json -not -path '*/node_modules/*'` (expect empty) |
| PR #24 regression tests present by name | `grep -rn "^func Test" cli-os/internal/engine/tools_test.go \| grep -iE "shellchain\|symlink\|branchdestructive"` |
| `constraints.md` hard-deny test present | `grep -n "constraints.md self-modification guard" cli-os/internal/engine/tools_test.go` |
| "move or copy" ban is a live validator check | `grep -n "move or copy" scripts/validate-l00prite.js` |
| v1.2 gated batch still queued, not yet started | `grep -n "v1.2 gated batch" .l00prite/todos.md` |
| PR #24 squash-merge is single-parent (confirms no orphaned commits) | `git log -1 --format=%P e6c9e2e` (expect one hash: `bc7448a...`) |
