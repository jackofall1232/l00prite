---
name: l00prite-research-frontier
description: >
  Scope: l00prite repo development. Load this when deciding where l00prite could genuinely pass
  the state of the art rather than just add a feature — the four maintainer-confirmed frontier
  axes: cross-vendor mid-run continuity, mechanically-safe autonomy, measured memory value, and
  l00prite as an adopted ecosystem standard. Trigger phrases: "what's the research frontier here",
  "is this a research question or just engineering", "what would make l00prite beyond state of
  the art", "what should the next benchmark/experiment be", or before framing any task as "prove
  X is better than Y". Also load it to avoid two traps: re-litigating something already settled
  (byte-parity, token self-measurement) and starting the v1.2 gated batch piecemeal because it
  "sounds like research." Delivers, per axis: why current practice falls short, l00prite's
  specific asset today, the first three concrete steps runnable in this repo right now (files,
  commands), and a falsifiable "you have a result when..." milestone.
---

# l00prite research frontier

**Scope: l00prite repo development.** This skill is for a session working inside the l00prite
repo itself, deciding what to investigate or build next when the goal is explicitly to move the
project toward genuinely novel, externally-defensible capability — not for an adopter session
running l00prite in their own project (see `l00prite-adopting` / `l00prite-execution-mode-ops`
for that audience) and not for ordinary feature/bugfix engineering (see `l00prite-change-control`
for that path).

## What this skill is for

Everything below states, per axis: **(a)** why the current common practice this axis competes
with falls short, **(b)** the specific asset l00prite already has today that a from-scratch
project would not, **(c)** the first three concrete steps to take *in this repo* — real files and
commands, not vague direction — and **(d)** a falsifiable milestone: a sentence of the form "you
have a result when X is true," not "when it feels done." Every axis (a)-claim is a **framing**
the maintainer confirmed, not a measured fact about the external agent-tooling landscape — this
skill does not have benchmark data on competing frameworks, and says so. Every axis (b)/(c) claim
below was verified against this repo's actual files, branches, and test output on 2026-07-06;
re-verify before relying on it (see Provenance and maintenance).

This skill deliberately does **not** repeat the general research discipline (worth-it analysis
before building, hypothesis-predicts-numbers, evidence bar, idea lifecycle) — that lives in
`l00prite-research-methodology`. Read that skill for *how* to carry any step below from hunch to
accepted result; read this skill for *which* steps are worth carrying.

## When NOT to use this

| Situation | Use instead |
|---|---|
| You need the general hunch-to-accepted-result discipline (worth-it analysis, hypothesis-predicts-numbers, evidence bar, idea lifecycle in files) | `l00prite-research-methodology` |
| You want the reusable "prove it" methods themselves (worth-it analysis, adversarial design review, negative testing, byte-identity proof, fail-closed analysis, security gate analysis) with worked examples, not what to point them at | `l00prite-proof-and-analysis-toolkit` |
| You want the WHY behind an already-shipped design decision, or the honest list of known-weak points in what exists today | `l00prite-architecture-contract` |
| You want the full chronicle of a settled incident, rejected design, or past review round (so you don't re-open it as "research") | `l00prite-failure-archaeology` |
| You're deciding what counts as evidence for a claim already made, or the current golden test/validator inventory | `l00prite-validation-and-qa` |
| You need the external-positioning rules (novel vs known, what must be proven before a public claim) or the stale-docs inventory | `l00prite-docs-and-claims` |
| You're actually building the Dashboard Runs view — that's a scoped engineering campaign with a spec, not an open research question | `l00prite-runs-view-campaign` |
| You need function-level detail on the Go runtime to implement a step named below | `l00prite-cli-os-internals` |
| You're deciding what kind of change and what gate applies before touching any file | `l00prite-change-control` |
| You're multi-agent-orchestrating any of the steps below (advisor/executor/reviewer split) | `l00prite-subagent-delegation` |

---

## The four axes

Ordering follows the maintainer's answer verbatim: "beyond state of the art" means **all four**
together, not any one in isolation. None of the four has a result yet (as of 2026-07-06) — this
section is a map of where to start, not a report of what's been achieved.

### Axis 1 — Cross-vendor mid-run continuity

**(a) Why current practice falls short (framing, not measured).** The common pattern across
agent tooling is vendor-locked session state: an agent's understanding of "where a task is" lives
in that vendor's proprietary conversation/session object. Stop the CLI, lose the model, or switch
products, and continuation depends on re-deriving context from scratch or a lossy hand-off
summary — nothing standardizes resuming an *interrupted autonomous run* across a change of agent
vendor mid-task.

**(b) l00prite's specific asset (verified 2026-07-06).**
- Six canonical loop prompts (`execute-loop`, `resume-loop`, `heartbeat`, `event-loop`,
  `respond-to-review`, `handoff-summary`) mirrored byte-identically across seven locations
  (`templates/l00prite/prompts/`, `.claude/prompts/`, `.codex/prompts/`,
  `templates/claude/prompts/`, `templates/codex/prompts/`, `.l00prite/prompts/`,
  `examples/vendor-neutral-output/.l00prite/prompts/`), enforced by
  `node scripts/validate-l00prite.js` (519 PASS / 0 FAIL, exit 0, confirmed by rerun today).
- Schema'd memory (`heartbeat.json`/`state.json` schema v2) with `execution.run_boundaries`
  listing all nine boundaries, and dual persistence in the cli-os engine (SQLite +
  target-repo `.l00prite/`), confirmed at `cli-os/docs/os-architecture.md` §2.1-2.2: "A
  different vendor's agent (or a human) can pick up a stopped run from files alone, exactly as
  the protocol promises."
- **A directly relevant, already-built prototype exists off `main`.** The `sandbox` branch
  (commit `60aadbd`, present on `origin` as of 2026-07-06, never merged to `main`) contains an
  A/B experiment whose Task 3 *is* a cross-agent compatibility test: `docs/cross-agent-compat-test.md`
  (377 lines) plus an automated two-process harness `scripts/cross-agent-compat-test.js` (646
  lines) and a fixture project under `tests/cross-agent-compat/fixture/`. Verified by reading
  `git show origin/sandbox:sandbox-results/runs/3-C.md`: two independent Node child processes
  stand in for two vendors sharing nothing but files on disk; "Agent A" hits
  `iteration_limit_reached` mid-run and persists state; "Agent B," reading only `.l00prite/`
  files with a fresh confirmed pre-flight, does not redo Agent A's completed unit and stops at a
  *different* boundary (`human_review_gate`) rather than bypassing it — 33/33 assertions passing
  in the control-arm run, 91/91 in the treatment-arm run (`sandbox-results/comparison.md` §1, §3).
  **The explicit, stated limitation (not glossed over in that record): both simulated agents were
  the same model family (Sonnet 5) run as separate processes — real different-*vendor*-CLI
  fidelity is "documented-but-not-executed," never actually run with two real different-vendor
  agents.** That gap is exactly why `.l00prite/todos.md`'s "Later" section still lists "Cross-agent
  compatibility tests, including a mid-execution boundary stop resumed by a different vendor's
  agent" as open on `main` — the sandbox prototype is real evidence a harness like this is
  buildable, not a finished result.

**(c) First three concrete steps, in this repo:**
1. Read `git show origin/sandbox:sandbox-results/runs/3-C.md` and
   `git show origin/sandbox:sandbox-results/comparison.md` in full, then decide: port
   `docs/cross-agent-compat-test.md` + `scripts/cross-agent-compat-test.js` from `sandbox` onto a
   feature branch off current `main` (a read-only `git show`/`git cat-file` extraction, not a
   merge — the `sandbox` branch itself is a deliberately separate, never-`main` artifact per
   `.l00prite/todos.md`'s history; do not merge it wholesale).
2. Replace the "two same-family processes" simulation with a genuine cross-vendor pair: e.g. one
   process driving Claude Code (`.claude/prompts/execute-loop.md`) and a second driving a Codex
   session (`.codex/prompts/execute-loop.md`) against the same fixture `.l00prite/` project,
   asserting the same invariants the sandbox harness already checks (no redo of completed units;
   the correct boundary recorded; lock/lease correctly released; fresh `preflight_confirmed_at`).
3. Extend the boundary matrix beyond the one pairing already covered
   (`iteration_limit_reached` → `human_review_gate`) to at least one crash-recovery case (kill
   Agent A mid-iteration, verify Agent B's pre-flight performs stale-run recovery per
   `cli-os/docs/os-architecture.md` §2.3) — the sandbox Arm B run already covers 4 boundary
   scenarios including this one; use it as the target coverage bar, not the ceiling.

**(d) Falsifiable milestone.** You have a result when a scripted, reproducible test — committed
on `main`, not a side branch — drives an actual stop-and-resume across two *different* vendor
agents (not two processes of the same model) over a shared `.l00prite/` fixture, and an
independent run of that test passes on a clean checkout with no manual intervention.

---

### Axis 2 — Mechanically-safe autonomy

**(a) Why current practice falls short (framing, not measured).** Most agent-autonomy guardrails
today are prompt text: instructions asking a model to check permissions, respect limits, or stop
at boundaries. Nothing stops a model from ignoring or rationalizing past that text — the
enforcement is only as strong as the model's compliance in that turn, which is exactly the "the
loop can never raise its own limits" self-modification failure l00prite's protocol layer was
designed to prevent (`CLAUDE.md` §2).

**(b) l00prite's specific asset (verified 2026-07-06).** The `cli-os` run engine
(`cli-os/internal/engine/`) turns most of that prompt text into Go code. The concrete artifact to
build on is `cli-os/docs/os-architecture.md` §2.2, **"Protocol conformance map"** — a real,
already-written table mapping every numbered `execute-loop.md` requirement (pre-flight steps 1-7,
iteration steps 1-6, all nine run boundaries, mode exit, per-action permission, self-modification
guard) to its concrete Go mechanism, introduced in the doc with: *"this table is the contract
tests are written against."* Backing that contract are named regression tests confirmed present
in `cli-os/internal/engine/`: `TestCommandAllowlistRejectsShellChaining`,
`TestConstraintsMdIsProtocolProtected`, `TestSearchFilesSkipsSymlinkedFiles`,
`TestRunDenylistWriteBlocksOnDeny`, `TestToolDenylistGating`, `TestMatchDenylist` (and two more
denylist-parsing tests) — each closing one of the PR #24 gate-bypass findings. `go test
./internal/engine/...` passes today (58 top-level test functions in that package, confirmed by
grep). `go test -race ./internal/engine/...` also passes clean today (6.1s, no race detected) —
but that only proves the *existing* tests are race-free, not that the engine is race-free under
adversarial concurrent load, because **no test file currently exercises concurrency at all**:
grepping `internal/engine/*_test.go` for `race|concurren|parallel` returns zero matches. And
`.l00prite/todos.md`'s "Active" section states the gap in its own words: the 2026-07-05
adversarial multi-agent review of the engine "was cut off by the usage limit before it produced
findings; bot review substituted this pass — still worth a dedicated internal pass for coverage
bot review doesn't reach, e.g. concurrency/race conditions under real parallel runs."

**(c) First three concrete steps, in this repo:**
1. Build a table that cross-checks `cli-os/docs/os-architecture.md` §2.2's conformance map
   against the actual test suite: for each of the ~20 rows, name the test(s) that exercise it (many
   already exist and are named above and in `l00prite-cli-os-internals`'s function map) or mark it
   untested. This is a read-only audit — no code changes — and it is the prerequisite for step 2.
2. Write the first parallel-run race test: two goroutines each driving `StartRun`/`iterate()`
   against the **same repo** (must serialize via the one-active-run-per-repo lease — assert the
   second is refused, not silently interleaved) and against **different repos concurrently**
   (must not interfere). Run new tests under `go test -race ./internal/engine/...` (verified
   runnable today) as the standing bar, not just `go test` without `-race`.
3. Re-attempt the deferred adversarial review from `.l00prite/todos.md`, this time with explicit
   checkpoint discipline (see `l00prite-subagent-delegation`'s hard rule on checkpointing long
   passes) so a usage-limit cutoff costs one finding-set, not the whole pass — the exact failure
   mode that killed the 2026-07-05 attempt.

**(d) Falsifiable milestone.** You have a result when (i) the conformance-map-vs-test audit shows
zero unmapped rows or an explicit, ledger-recorded justification for each gap, (ii) a committed
race-test suite passes under `go test -race` covering same-repo serialization and cross-repo
independence, and (iii) a completed (not cut-off) adversarial pass is recorded in the ledger with
its actual finding count — including zero, if that's genuinely what a *completed* pass finds
(cross-ref the empty-findings-is-not-automatically-clean rule in `l00prite-research-methodology`).

---

### Axis 3 — Measured memory value

**(a) Why current practice falls short (framing, not measured).** Claims that durable
file/memory-based agent context improves task outcomes are common industry-wide and almost never
benchmarked against a plain-model control — including, honestly, l00prite's own claims to date:
the prompt-caching pass's Run Ledger entry (2026-07-06) states outright that its real hit-rate
improvement is "NOT measured against the live API... asserted from byte-identical constructed
requests in unit tests," and `.l00prite/todos.md` records repo-state-hash response caching as
"deliberately deferred... until a loop/memory/resume benchmark arm exists, so whether serving a
cached response changes agent behavior is measurable rather than assumed."

**(b) l00prite's specific asset (verified 2026-07-06).**
- **The sandbox A/B precedent.** The `sandbox` branch (`origin/sandbox`, commit `60aadbd`, never
  merged to `main`) already ran a real, three-task, two-arm (`Sonnet-5-solo` vs
  `Sonnet-planner→Opus-advisor→Sonnet-executor`) comparison with a fixed methodology
  (`sandbox-results/task-specs.md`: specs locked before any arm starts) and a documented,
  self-critiqued results table (`sandbox-results/comparison.md`), including an explicit
  **Limitations** section naming n=1 per cell, no blind third-party quality review, and an
  Arm-B cost-accounting floor (every token priced as Sonnet, when some were pricier Opus). This is
  the only benchmark harness and methodology precedent in the project — but note precisely what
  it measured: the value of an advisor-consult *pattern* (cost/time/quality deltas), not memory or
  resume value specifically. It is reusable methodology, not a memory-value result.
- **The gateway ledger as a measurement substrate.** `cli-os/internal/state/db.go`'s `ledger`
  table (confirmed by reading the schema) carries `cache_read_tokens` and `cache_write_tokens`
  columns alongside `prompt_tokens`/`completion_tokens`/`cost_usd` per request — real infrastructure
  already recording exactly the raw numbers a cache-hit-rate measurement needs, under real traffic,
  with no new instrumentation required.
- **A deferred-pending-benchmark discipline already in place** (2026-07-06 caching-pass ledger
  entry, `.l00prite/todos.md`) — the project already refuses to claim measured wins prematurely,
  which is the right posture for building an honest benchmark on top of.

**(c) First three concrete steps, in this repo:**
1. Design the benchmark arm: pick 2-3 tasks from `.l00prite/todos.md`'s own backlog (mirroring
   the sandbox methodology's choice to draw from real backlog items, not synthetic tasks) that
   specifically exercise memory/resume — e.g. a task interrupted at a run boundary and resumed in
   a fresh session with only `.l00prite/` files available, vs. the same task given full continuous
   context — not the advisor-pattern axis the sandbox experiment already covered.
2. Query `cache_read_tokens`/`cache_write_tokens`/`prompt_tokens` from the `ledger` table (SQLite,
   location per `l00prite-run-and-operate`) across a run's real traffic and compute a cache-hit
   share; this requires no code change, only running real turns through the gateway and reading
   the existing columns.
3. Revive the sandbox methodology's specific discipline for this new experiment: fixed task specs
   written *before* either arm starts, isolated worktrees per run, and a documented Limitations
   section — the last of these is what makes the sandbox report trustworthy evidence rather than a
   marketing table; don't skip it.

**(d) Falsifiable milestone.** You have a result when there is a committed benchmark harness
(task specs fixed in advance, methodology documented, Limitations section written honestly) that
produces at least one number — e.g. a measured cache-read-token share from the ledger, or a
task-completion-quality delta between resume-from-files vs. continuous-context arms — with the
raw data reproducible from a rerun, not just narrated.

---

### Axis 4 — Ecosystem standard

**(a) Why current practice falls short (framing, not measured).** The AGENTS.md open standard
(and its per-vendor equivalents this repo already adapts to — `vendors.json`,
`templates/vendors.json` schema_version 1, confirmed by reading it) tells an agent *about* a
repo — conventions, build commands, style. Nothing in that ecosystem standardizes *durable loop
memory itself*: a resumable execution protocol, a lock/lease convention, a run-ledger evidence
format, or a conformance check any third-party project could pass. README.md's own "Why it
exists" section (read in full) names the failure modes this targets — context resets, lost
knowledge of failed approaches, scattered state — but the README does **not** currently name
specific competing frameworks to compare against (verified: no README section names alternative
memory/loop tools by product name); any comparison table built from this axis has to be
constructed from first principles against the failure modes README already names, not lifted from
an existing table.

**(b) l00prite's specific asset (verified 2026-07-06).**
- `templates/vendors.json` (schema_version 1) — a machine-readable manifest of 10 vendor entries
  (verified: `vendors.length === 10`), several bundling more than one actual tool under one entry
  (e.g. the `agents-md-standard` entry alone lists Codex, Cursor, Copilot, Windsurf, Zed, Jules,
  Factory, Amp, opencode, Devin, Warp, Roo Code, and JetBrains Junie), consumed by
  `scripts/validate-l00prite.js` — already a conformance check, just scoped to vendor-discovery,
  not to protocol behavior.
- `scripts/l00prite-doctor.js` is, by design, **already** usable against any target project, not
  just this repo: its own header states "Where `scripts/validate-l00prite.js` validates THIS repo
  (the protocol source), the doctor validates a TARGET project" and it takes a path argument
  (`node scripts/l00prite-doctor.js [path-to-project]`, default `.`) with self-parity checks
  (comparing a project's own prompt mirrors to its own canonical copy, never to a hash of this
  repo's canonical text) "so it stays correct across legitimate protocol upgrades." Confirmed
  today: `node scripts/l00prite-doctor.js .` → `25 ok · 0 warn · 0 fail`, exit 0, against this
  repo's own `.l00prite/`.
- **The honest gap**: the doctor is *designed* to work standalone against any adopter project, but
  as of 2026-07-06 it has never actually been run against a real third-party repository outside
  this one and its bundled `examples/vendor-neutral-output/` — the "external adoption" half of this
  axis is genuinely untested, not merely undocumented.
- No versioned, standalone protocol spec document exists yet (verified: `docs/` contains only
  `README.md`, `concepts.md`, `failure-modes.md`, `anti-patterns.md` — no `SPEC.md`/`PROTOCOL.md`,
  and a repo-wide grep for `schema_version`/"protocol version" outside the JSON schema fields
  themselves finds nothing) — that extraction is real, un-started work, not something to
  double-check for existing coverage.

**(c) First three concrete steps, in this repo:**
1. Extract a versioned, standalone protocol spec from `templates/l00prite/prompts/README.md` +
   `docs/concepts.md` + the six canonical prompts' shared invariants (byte-parity requirement,
   lock/lease rules, event lifecycle, nine boundaries) into one document with its own version
   number — separate from any one template, so it can be checked against independent of
   `CLAUDE.md`/`AGENTS.md` template churn.
2. Define a conformance checklist an external, non-l00prite-authored project could run against
   itself: generalize `scripts/l00prite-doctor.js`'s existing checks (it already has 25 today, per
   the run above) into a documented pass/fail rubric, separate from this repo's own validator
   (which stays repo-only per the portable-skill rule — never prescribe
   `scripts/validate-l00prite.js` to adopters).
3. Draft the comparison table from first principles against the failure modes README's "Why it
   exists" section already names (context resets, repeated failed approaches, lost PR-review
   context, untrustworthy stop-state, scattered tribal knowledge) — not against named competing
   products, since none are named in the repo today; if a real comparison is wanted, that requires
   researching actual external tools first, labeled as external and dated.

**(d) Falsifiable milestone.** You have a result when a project that is **not** this repo, run by
someone who did not get help from this repo's maintainers, scaffolds or adopts l00prite's protocol
and its `.l00prite/` folder passes the conformance suite (doctor or its generalized successor)
without this repo's authors touching it.

---

## Not frontier: things that look like research but are settled or merely gated

Load-bearing distinction: don't spend research effort re-opening a decided question, and don't
mistake engineering work that is *waiting on a human gate* for open research.

| Looks like research | Actually is | Why |
|---|---|---|
| "Should the canonical prompts be byte-identical, or is keyword/substring matching enough?" | **Settled.** | The prompt-copy-drift era (four hand-synced copies, one bug fixed in 13 places) is exactly why byte-parity + `cmp` replaced keyword checks — see `l00prite-failure-archaeology`. Re-litigating this from scratch ignores real incident evidence. |
| "Could an agent estimate its own token spend well enough to gate a stop condition on it?" | **Settled: no.** | `docs/failure-modes.md` (line ~108) and `AGENTS.md` (line ~64) both state, as project doctrine: an agent cannot observe its own true token usage, so any self-reported figure is fiction; never build a stop condition on it. See `agent-loop-domain-reference` for the full theory. |
| "Should Execution Mode get phased autonomy levels / a formal `budget_exceeded` boundary / a machine-parseable run-log / an independent verifier prompt?" | **Not research — gated engineering, quarantined.** | `.l00prite/todos.md`'s "v1.2 gated batch" already specs all four items in detail; they require editing the two review-gated files (`.claude/commands/build-loop.md`, `scripts/validate-l00prite.js`) and are explicitly quarantined as "review together, do not start piecemeal." The design work is done; what's missing is maintainer sign-off, not investigation. See `l00prite-change-control`. |
| "Is the cooperative lock/lease convention strong enough?" | **Settled (known-weak, not open).** | It's a documented, intentional limitation — cooperative, not filesystem-enforced — stated plainly in `l00prite-architecture-contract`'s known-weak-points list, not an open question needing a research pass. |

---

## Provenance and maintenance

All facts below are dated 2026-07-06 and were verified by the commands shown; branch heads, test
counts, and PASS/FAIL totals are volatile and can drift as the repo evolves — re-run before citing.

| Volatile fact stated above | Re-verification command |
|---|---|
| Validator: 519 PASS / 0 FAIL, exit 0 | `node scripts/validate-l00prite.js >/tmp/out 2>/tmp/err; echo exit:$?; grep -c PASS /tmp/out; grep -c FAIL /tmp/err` |
| Doctor: 25 ok / 0 warn / 0 fail, exit 0, on this repo | `node scripts/l00prite-doctor.js .` |
| `sandbox` branch exists on `origin`, tip `60aadbd`, never merged to `main` | `git ls-remote --heads origin \| grep sandbox` then `git log --oneline origin/main..origin/sandbox` |
| Sandbox cross-agent-compat harness content/results (Task 3) | `git show origin/sandbox:sandbox-results/runs/3-C.md` and `git show origin/sandbox:sandbox-results/comparison.md` |
| `cli-os/docs/os-architecture.md` §2.2 "Protocol conformance map" exists | `grep -n "Protocol conformance map" cli-os/docs/os-architecture.md` |
| Named engine regression tests for PR #24 gate-bypass findings exist | `cd cli-os && grep -rn "func Test.*Symlink\|func Test.*Shell\|func Test.*Denylist\|func Test.*Constraint" internal/engine/*_test.go` |
| `go test ./internal/engine/...` passes (58 top-level test functions) | `cd cli-os && go test ./internal/engine/... && grep -c "^func Test" internal/engine/*_test.go` |
| No concurrency/race test file exists yet in the engine package | `cd cli-os && grep -rl "race\|concurren\|parallel" internal/engine/*_test.go` (expect no output) |
| `go test -race ./internal/engine/...` passes clean today | `cd cli-os && go test -race ./internal/engine/...` |
| `ledger` table has `cache_read_tokens`/`cache_write_tokens` columns | `grep -n "cache_read_tokens\|cache_write_tokens" cli-os/internal/state/db.go` |
| Prompt-caching pass explicitly labeled NOT measured against live API | `grep -n "NOT measured" CLAUDE.md` (Run Ledger row, Prompt-caching pass) |
| `templates/vendors.json` schema_version and vendor count | `node -e "const v=require('./templates/vendors.json'); console.log(v.schema_version, v.vendors.length)"` |
| No standalone versioned protocol spec doc exists yet | `ls docs/` (expect only README.md, concepts.md, failure-modes.md, anti-patterns.md) |
| README names no specific competing products | `grep -n -i "langchain\|autogpt\|crewai\|memory bank" README.md` (expect no output) |
| Token-self-measurement doctrine is stated project-wide | `grep -n "self-reported" AGENTS.md docs/failure-modes.md` |
| v1.2 gated batch is quarantined pending maintainer review | `grep -n "v1.2 gated batch" .l00prite/todos.md` |
