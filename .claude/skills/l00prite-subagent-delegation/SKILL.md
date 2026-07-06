---
name: l00prite-subagent-delegation
description: >
  Scope: any l00prite-managed project. Load this BEFORE spawning subagents, fanning out
  parallel agents, or delegating bulk work in a multi-step pass — including when deciding
  which model tier should do a task, structuring a multi-agent review, or resuming after a
  cut-off multi-agent pass. States the tier-relative delegation rule (the highest-capability
  model available to the session takes the advisor seat — Fable when available, otherwise
  Opus or whatever the ceiling is — while lower tiers execute), the 6-step delegation
  algorithm, advisor/executor/reviewer/fixer role definitions, four ledger-grounded
  orchestration patterns, the hard delegation rules (one writer per file, checkpoint
  discipline, empty results are artifacts not clean bills, reviewer never the writer), when
  NOT to delegate, and cli-os's role-routing mirror. Triggers: "should I fan this out to
  subagents", "which model should do this", "set up a multi-agent review", "the last
  multi-agent pass got cut off, what do I trust now".
---

# l00prite subagent delegation

**Scope: any l00prite-managed project.** This skill is copy-ready: it does not assume your
project is the l00prite protocol's own repository. The orchestration patterns below are cited
from the l00prite protocol repo's own `.l00prite/ledger.md` — they are **historical examples
from that repo**, presented as illustration of a real pass that actually happened, not as
something that runs in your project. Apply the rules and the algorithm to your own
multi-agent work regardless of which repo you're in. Where a fact is specific to the `cli-os`
runtime (the role-routing config in §4), it's labeled as such with a conditional
re-verification command, since your project may or may not have that source tree available.

## What this skill is for

Any time a session is about to split work across multiple agents — subagents inside one
Claude Code session, parallel Task/Agent calls, a fleet of reviewers, or a staged
advisor-then-executors pass — load this skill first to decide who does what, at what tier,
with what hand-off artifact, and what to do when a long pass gets cut off partway through.
This turns an informal "let the smart model design it and have cheaper models build it" habit
into an explicit, checkable procedure, and it names the specific failure modes (empty results
read as clean, unverified findings applied blind, gated files delegated away) that have
actually cost real passes their work.

## When NOT to use this

| If you need... | Use instead |
|---|---|
| The procedure and gates for editing a review-gated or denylisted file yourself (not via a subagent) | `l00prite-change-control` (repo-dev) |
| The method behind an adversarial N-critic *design* review as a proof technique, with its own worked examples | `l00prite-proof-and-analysis-toolkit` (this skill tells you WHO does the reviewing and how to stage it; that skill tells you HOW to run the review method itself) |
| The full hunch-to-accepted-result research pipeline (worth-it verdict, evidence bar, idea lifecycle in files) | `l00prite-research-methodology` (repo-dev) |
| What counts as acceptable ledger evidence, or how to label an unmeasured claim | `l00prite-validation-and-qa` |
| Day-to-day single-agent protocol life — which canonical prompt to run, lock etiquette, event handling | `l00prite-loop-operations` |
| Arming semantics, the pre-flight walkthrough, and the nine run boundaries for Execution Mode itself | `l00prite-execution-mode-ops` (a subagent cannot satisfy Execution Mode's confirmation gate for you — see §6 below) |
| Deep Go internals of the engine's role-routing code (`roles.go`, `routerauto.go`) beyond the summary in §4 | `l00prite-cli-os-internals` (repo-dev) |
| The full chronicle of a specific incident cited here (PR #22, PR #24, the OS-APK cutoff) | `l00prite-failure-archaeology` (repo-dev) |
| House style for ledger entries and the update ritual after a session ends | `l00prite-docs-and-claims` (repo-dev) |

---

## 1. The tier rule (the prime directive)

Stated tier-relative, not tied to one model name, because not every session has every tier
available:

> **The highest-capability model available to the session takes the ADVISOR seat. Every tier
> below it is execution capacity.**

Fable advises when Fable is available. When it is not, the next ceiling down — Opus, or
whatever the highest tier actually reachable in that session is — advises with exactly the
same responsibilities, and delegates bulk work to Sonnet/Haiku (or whatever sits below it).
The advisor decomposes the task, writes file-level specs, adjudicates review findings, and
renders final judgment — and does **not** do bulk work that a lower tier can pass the
acceptance check on. The goal is **top-tier-standard output at the lowest tier that can
produce it**, not "use the best model for everything" and not "use the cheapest model for
everything."

**Corollary #1 (misstructured delegation):** if bulk work is landing on the advisor tier, the
delegation is mis-structured — either the units aren't decomposed finely enough for a lower
tier to take them, or the advisor is doing work it should have specced out instead.

**Corollary #2 (tier collapse):** if only one tier is actually available to the session, the
roles do **not** merge into one pass done by one agent. Keep advisor and executor as separate
agents or sessions of the same model — a fresh context is a meaningfully independent
perspective even at the same tier. The discipline here is role separation and verification,
not merely cost reduction; collapsing roles because "it's all the same model anyway" throws
away the independent-review property the whole structure exists for.

This is a project convention (maintainer-stated, recorded in this repo's `CLAUDE.md` and
ledger as "the model-tier rule"), not something enforced by any tool — nothing stops a session
from ignoring it. Treat it as a standing default unless the person directing the session says
otherwise.

## 1b. The delegation algorithm

A numbered decision procedure for actually staffing a multi-agent pass:

1. **Inventory available tiers.** In an interactive session: which models can subagents
   actually run as (check what your harness exposes — e.g. a `model` override on an Agent/Task
   call). In a `cli-os`-driven project: registered providers/models and the routing profiles'
   `rankMap`s (§4) — the equivalent inventory question there is "which models are configured,
   and at what rank, for each role."
2. **Seat the highest tier as advisor.** One advisor per pass. It does not rotate mid-pass.
3. **Decompose into units; assign each unit the LOWEST tier whose output can pass that unit's
   acceptance check.** Size the unit and tighten the spec as the assigned tier drops — a
   Haiku-tier executor needs a smaller unit and a more explicit, more literal spec than a
   Sonnet-tier one; spec quality must rise as tier falls, not stay constant. "Make it good" is
   never an acceptable spec at any tier (see §5).
4. **Assign review adversarially.** Reviewer is never the same agent/session as the writer.
   Use a different tier where one is available, or at minimum a different session at the same
   tier (Corollary #2). Adjudication of review findings stays with the advisor — a reviewer
   flags, the advisor decides.
5. **Escalate on repeated failure.** A unit that fails its acceptance check twice at its
   assigned tier escalates one tier up, and the failure is recorded rather than silently
   retried a third time at the same tier — this mirrors the two-distinct-fix-attempts-then-stop
   pattern `execute-loop.md` already uses for its `unfixable_failing_tests` boundary (verified:
   `templates/l00prite/prompts/execute-loop.md`, iteration-protocol rule 4, "The same unit
   still failing after two distinct fix attempts ... is the `unfixable_failing_tests`
   boundary"). Judgment-heavy or safety-adjacent units — design decisions, anything touching a
   gated or denylisted area, final review — never delegate below the advisor tier regardless
   of how the escalation plays out; they are the advisor's job from the start, not a fallback.
6. **Record attribution per unit in the ledger** (see §5, last bullet, for the house
   convention).

## 2. Role definitions and hand-off artifacts

| Role | Responsibilities | Hands off |
|---|---|---|
| **Advisor** | Task decomposition; per-unit specs (file-level, verifiable, self-contained); scope boundaries (one home per fact, one unit per agent); adjudicates review findings; renders the final report/judgment | A spec per unit + a final adjudicated report |
| **Executor** | Does exactly one unit; verifies every fact/command against the actual repo before writing anything (never trusts the spec's claims blind); returns a structured manifest | A structured manifest: what was verified, what's uncertain, what deviated from spec and why |
| **Reviewer** | Adversarial **by assignment** — briefed to try to refute the work, not to admire it; reviews the complete set of changes; is never the agent that wrote them | A list of findings (or an explicit "found nothing" — see §5) for the advisor to adjudicate |
| **Fixer** | Applies only the findings the advisor has already adjudicated as valid; never re-opens or re-litigates a finding the advisor already ruled on | The applied fix + confirmation it was verified against the actual finding, not the finding's restated description |

A pass does not need all four roles every time — a single-critic design review only needs
advisor + reviewer; a bulk documentation pass only needs advisor + executors. But whichever
roles are in play, the same agent never occupies two of them for the same unit of work (see
§5, "reviewer never the writer").

## 3. Orchestration patterns (grounded in real l00prite-repo passes)

Each pattern below is a real, ledger-recorded pass from the l00prite protocol repo's own
history — read as worked illustrations of the shape, not as instructions to replicate that
specific pass in your project.

**(a) Parallel one-unit-per-agent build to specs.** The OS-APK engine build
(`.l00prite/ledger.md`, run `2026-07-05T19:10:34Z`): *"Fable 5 authored the design, the engine
loop/pre-flight/exec core, and all reviews; Opus subagents wrote the peripheral units to
file-level specs (routing, store, protocol-file IO, tools, roles, packaging)."* The advisor
(Fable 5) designed and reviewed everything; each Opus subagent got one disjoint peripheral
unit and a file-level spec, not the whole engine.

**(b) Map -> synthesize -> rank discovery.** The loop-maturity gap-analysis pass
(`.l00prite/ledger.md`, run `2026-07-04T09:00:00Z`): *"A multi-agent gap-analysis workflow
(Opus mapping + synthesis, Fable 5 advisory + prioritization, Opus design) ranked the
candidate gaps. Adopted Fable's recommended scope: the four highest-value, philosophy-native
gaps that touch zero review-gated files."* Discovery work (mapping a reference repo, finding
candidate gaps) ran at the executor tier; the advisor's job was ranking and scoping, not
mapping.

**(c) N-critic adversarial design review before implementation.** The 2026-07-02 design
review (`.l00prite/ledger.md`, run `2026-07-02T00:00:00Z`, and `.l00prite/failures.md`): the
ledger records *"An adversarial three-critic design review ran before implementation; its
blockers reshaped the design."* `failures.md` records exactly what those blockers killed as
do-not-retry: scaffold-time `execution.enabled: true` pre-arming, treating a persisted
`preflight_confirmed: true` as authorization, bare-pointer vendor adapters ("just read
AGENTS.md"), shipping auto-loaded vendor config like `.aider.conf.yml`, and naming the
boundary list `stop_conditions` (collided with an existing field). Three independent reviewers
found three genuinely different classes of design flaw before a line of implementation code
existed.

**(d) Find -> adversarially-verify review pipeline.** The PR #22 review-response pass
(`.l00prite/ledger.md`, run `2026-07-04T23:30:00Z`): the goal line records addressing *"the
confirmed findings of this session's own adversarial review workflow (16 agents, 10
confirmed)"* alongside the external bot reviewers. Sixteen agents found candidate issues; only
ten survived adversarial verification against the actual code before anything was fixed — the
other six were not acted on. Contrast this with the OS-APK pass's own 16-agent review, which
was **cut off** by a session usage limit before it produced any confirmed findings (§5, "empty
results are artifacts") — same review-workflow shape, opposite outcome, and the ledger
explicitly distinguishes a completed 16-of-16 pass with 10 confirmed findings from an
incomplete 16-agent pass with zero.

## 4. The mechanized mirror: cli-os role routing

If your project runs the `cli-os` gateway/engine that ships with the upstream l00prite
project, its role-aware auto-routing is this same discipline expressed as configuration
rather than as session staffing — verified against `cli-os/internal/engine/roles.go` and
`cli-os/internal/config/config.go` (re-check against your installed version; see Provenance).

- The engine never names a provider or model directly. `PlanForObjective` in `roles.go` maps
  an **objective** (`balanced` / `quality` / `cost` / `speed` / `privacy`) to a `TeamPlan` — a
  `map[role]profileName` for the four roles the engine actually runs: `plan`, `code`,
  `review`, `summarize` (the constants `RolePlan`/`RoleCode`/`RoleReview`/`RoleSummarize` in
  `types.go`). `ModelForRole` renders a role's request model field as `"auto:<profile>"`.
  Under the default `balanced` objective this resolves to exactly `auto:plan`, `auto:code`,
  `auto:review`, `auto:summarize` — the built-in profile of the same name for each role.
- Built-in profiles (`config.defaults()` in `internal/config/config.go`): `plan` is
  quality-preferring with `RankMap:"plan"`; `code` is balanced with `Require:["tools"]` and
  `RankMap:"code"`; `review` is quality-preferring with `RankMap:"review"`; `summarize` is
  cost-preferring with no rank map override. This already leans toward the same shape as §1:
  planning and review lean toward the stronger tier, routine coding and summarizing lean
  toward cheaper capable models.
- `routing.RoleRanks` (a named map `"role-map-name" -> "provider/model" -> 0-100`) ships
  **empty** by default — an operator fills it in. A profile's `RankMap` selects one of these
  maps and merges it **over** the global `QualityRanks` table (per-model entries in the role
  map win; every model absent from the role map falls back to its global quality rank). This
  is the config-file equivalent of "pin cheaper models to bulk roles and stronger models to
  plan/review" — you edit `routing.roleRanks.code` to push a cheaper model up for the `code`
  role without touching how `plan`/`review` rank the same models.
- Note the built-in `QualityRanks` table itself (`anthropic/claude-opus-4-8: 96`,
  `anthropic/claude-fable-5: 93`, `anthropic/claude-sonnet-5: 88`,
  `anthropic/claude-haiku-4-5: 74`, plus three `zhipu/` entries) is a numeric cost/quality
  routing score for the auto-router, not a restatement of §1's advisor-seat rule — the two
  axes can disagree (this table ranks `opus-4-8` above `fable-5` numerically) because one is
  about automated model selection for a routing profile and the other is about which agent
  holds decomposition/adjudication authority in a human-directed multi-agent pass. Don't
  conflate them.
- The alignment to state plainly: **configure your `roleRanks` the same way you'd staff a
  session** — quality-leaning models for the roles that decompose and judge (`plan`,
  `review`), cost-leaning capable models for the roles that execute narrow, already-specified
  work (`code`, `summarize`). Deep mechanics (the router's `Pick`/`selectAuto` flow, fail-closed
  capability filtering, `PriceTier`) live in `l00prite-cli-os-internals`, not here.

## 5. Hard delegation rules

- **Never delegate a review-gated or denylisted-path edit.** `.claude/commands/build-loop.md`
  and `scripts/validate-l00prite.js` (in the l00prite repo) — or whatever your own project's
  review-gated files and Autonomous-Edit Denylist name — are human-review territory, full
  stop, no matter which tier or how many independent agents you'd assign it to. See
  `l00prite-change-control` for the procedure that actually applies to those files.
- **One writer per file.** Executors working in parallel get disjoint file sets. Writes to a
  project's own `.l00prite/` memory files are a **single-writer, lock-protected** step done by
  the orchestrating session itself, never fanned out across parallel executors — this is the
  same cooperative lock/lease convention `.l00prite/LOCKING.md` documents for any agent writing
  shared memory, and it applies with extra force when several agents are active in the same
  window of time.
- **Specs must be verifiable.** An executor's spec names the files to read, the specific facts
  to verify against the repo before writing, and the acceptance check that decides pass/fail.
  "Make it good" is not a spec at any tier, and is actively dangerous at a low one.
- **Checkpoint discipline.** Long multi-agent passes commit or persist completed units as they
  finish, rather than holding everything until the end. A session usage-limit cutoff must cost
  the pass one unit of work, not the whole pass. This is exactly what did **not** happen to the
  16-agent adversarial review and the dashboard-Runs-view writer in the OS-APK pass (both were
  cut off by a usage limit with the review producing nothing — `.l00prite/ledger.md`, run
  `2026-07-05T19:10:34Z`).
- **Empty results are artifacts, not clean bills.** A dead or cut-off agent's missing findings
  mean **UNKNOWN**, not "nothing was wrong." Record the incomplete state in the ledger
  explicitly rather than silently treating an empty findings list as a passed review — the
  same ledger entry states this in its own words: *"its empty findings list is an artifact of
  the failure, not a clean bill."*
- **Verification is never by the author.** Reviewer is never the writer, and review findings
  get checked against the actual current code before anything is fixed on their say-so — the
  PR #24 review-response round records exactly this discipline: *"every finding was verified
  against the actual current code before fixing; none were speculative or already-stale by the
  time they were read"* (`.l00prite/ledger.md`, run `2026-07-05T19:16:00Z` to
  `2026-07-05T20:15:00Z`).
- **Attribution in the ledger.** Record which model/tier did what per run or per unit. The
  house convention already in use names it plainly in the ledger's own run headers — e.g.
  *"Claude (Fable 5)"*, *"Claude (Opus 4.8, Fable 5 advising)"*, *"Claude (Opus 4.8)"*
  (`.l00prite/ledger.md`, multiple run headers). Follow the same pattern: name the model/tier
  for the advisor and, where it matters, for each executor.

## 6. When NOT to delegate

- **Single-file tasks below the coordination overhead.** If writing the spec would take as
  long as doing the work, don't delegate — spinning up an advisor/executor split for a
  one-file, one-fact change is pure overhead.
- **Anything requiring session-local authority.** Execution Mode's human-confirmation gate is
  per-run and session-local by design (`templates/l00prite/prompts/execute-loop.md`, step 6:
  *"Wait for explicit human confirmation in this session ... A `preflight_confirmed: true` or
  `execution.enabled: true` already present in `heartbeat.json` does not satisfy this gate ...
  Re-confirm every run."*). A subagent cannot confirm a pre-flight on your behalf, and a
  **headless session cannot enter Execution Mode at all** — the same file states it directly:
  *"If you are running headless — no interactive human in this session ... you cannot satisfy
  this gate. Do not enter Execution Mode; record why in the session output and stop."* Don't
  try to route around this by having a subagent "confirm" for the human; it is not
  authorization no matter which agent types the word.
- **Memory/lock operations.** Don't fan out writes to `.l00prite/ledger.md`, `state.json`,
  `heartbeat.json`, or any other lock-protected path across parallel agents — see §5, "one
  writer per file."
- **Anything where the spec would be longer than the deliverable**, or where the judgment call
  (a design decision, a gated-area analysis, a final adjudication) IS the work — those stay
  with the advisor per §1b step 5, they don't get delegated down just because a lower tier is
  technically available.

## 7. Delegation checklist (pre-flight for a multi-agent pass)

Before spawning anything, confirm:

- [ ] Decomposition is done — the pass is broken into disjoint, file-level units.
- [ ] Every unit has a spec naming: files to read, facts to verify, and the acceptance check.
- [ ] File sets across parallel executors are disjoint (no two units touch the same file).
- [ ] A checkpoint plan exists — completed units get committed/persisted as they finish, not
      batched to the end.
- [ ] A completion-state recording plan exists — you know how you'll record "this fully
      finished" vs. "this was cut off" in the ledger, before you need it.
- [ ] Reviewer assignment is adversarial — a different agent/session from every writer it
      reviews, briefed to refute rather than admire.
- [ ] An adjudicator is identified (the advisor) for when reviewer and executor disagree.
- [ ] Ledger attribution is planned — you know which model/tier will be recorded against which
      unit before the pass starts, not reconstructed after the fact.

---

## Provenance and maintenance

All facts below are dated **as of 2026-07-06** and were verified against the repo while
writing this skill. Ledger quotes, commit/PR references, and source-code claims are all
volatile — re-run the commands below before relying on them, especially in a different
checkout or a later state of the l00prite repo's history.

| Fact stated above | Re-verification command |
|---|---|
| The 2026-07-05T19:10:34Z OS-APK ledger entry's exact wording ("Fable 5 authored the design... Opus subagents wrote the peripheral units...") | `grep -n -A 8 "2026-07-05T19:10:34Z" .l00prite/ledger.md` |
| The 2026-07-04T09:00:00Z gap-analysis ledger entry's exact wording ("Opus mapping + synthesis, Fable 5 advisory + prioritization...") | `grep -n -A 6 "2026-07-04T09:00:00Z" .l00prite/ledger.md` |
| The 2026-07-02 three-critic design review + its do-not-retry blockers | `grep -n -A 6 "2026-07-02T00:00:00Z" .l00prite/ledger.md; grep -n -A 20 "2026-07-02 adversarial design review" .l00prite/failures.md` |
| The PR #22 review-response entry's "16 agents, 10 confirmed" wording | `grep -n -A 3 "2026-07-04T23:30:00Z" .l00prite/ledger.md` |
| The OS-APK pass's cut-off 16-agent review + "artifact of the failure, not a clean bill" wording | `grep -n "artifact of the failure" .l00prite/ledger.md` |
| The PR #24 review-response "verified against the actual current code before fixing" wording, and its commits | `grep -n "verified against the actual current code" .l00prite/ledger.md; git show -s --format='%H %s' ce0b11c ff24aac` |
| Ledger attribution convention ("Claude (Fable 5)", "Claude (Opus 4.8, Fable 5 advising)") appears in run headers | `grep -n "^### Run.*Claude (" .l00prite/ledger.md` |
| `execute-loop.md`'s session-local confirmation + headless-session rule | `grep -n -A 3 "explicit human confirmation in this session" templates/l00prite/prompts/execute-loop.md; grep -n -A 2 "running headless" templates/l00prite/prompts/execute-loop.md` |
| `execute-loop.md`'s two-distinct-fix-attempts wording for `unfixable_failing_tests` | `grep -n "two distinct fix attempts" templates/l00prite/prompts/execute-loop.md` |
| `roles.go` role constants and `PlanForObjective`/`ModelForRole` behavior (cli-os-specific — only if your project ships this runtime) | `grep -n "RolePlan\|RoleCode\|RoleReview\|RoleSummarize\|^func PlanForObjective\|^func ModelForRole" cli-os/internal/engine/roles.go` |
| Built-in routing profiles and `QualityRanks` table (cli-os-specific) | `grep -n -A 20 "^func defaults" cli-os/internal/config/config.go` |
| `RoleRanks`-over-`QualityRanks` merge semantics (cli-os-specific) | `grep -n -B 3 -A 15 "ranks := routing.QualityRanks" cli-os/internal/gateway/routerauto.go` |
| The cooperative lock/lease convention this skill's "one writer per file" rule leans on | `sed -n '1,40p' .l00prite/LOCKING.md` |

Distribution note: this skill is currently distributed by manually copying this directory into
a target project's `.claude/skills/` — wiring it into what `build-loop` scaffolds would mean
editing a review-gated file, which is out of scope until the maintainer authorizes that
change.
