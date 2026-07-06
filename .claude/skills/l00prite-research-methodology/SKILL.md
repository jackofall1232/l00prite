---
name: l00prite-research-methodology
description: >
  Scope: l00prite repo development. Load this before starting any speculative or investigative
  work in the l00prite repo — deciding whether an idea is worth building, forming a hypothesis
  that should predict a number before you run anything, running or assigning an adversarial
  review of a design or a finding, or deciding whether a result belongs in memory.md (adopted)
  or failures.md (retired, do-not-retry). Triggers: "is this worth building", "worth-it
  analysis", "should we implement X", "how do I know this actually helped", "hypothesis before
  running", "adversarial review of this design/PR", "empty findings from a cut-off session",
  "when do I retire an idea vs keep it in todos.md", "what counts as an accepted result here".
  Delivers the hunch-to-accepted-result pipeline with worked examples from this repo's own
  history, the evidence bar, the idea-lifecycle-in-files convention, where good ideas here have
  actually come from, and the model-tier method applied to research work specifically.
---

# l00prite research methodology

**Scope: l00prite repo development.** This skill is for a session working inside the l00prite
repo itself, deciding how to turn a hunch into something this repo will actually adopt. If you
are instead in some *other* project that has adopted l00prite, this skill does not apply as
written — its examples are this repo's own engineering history, not portable across projects.

## What this skill is for

Any time you (or a maintainer brief) have an idea that isn't yet obviously worth doing — a
possible optimization, a new capability, a redesign — this skill is the discipline for turning
that hunch into either an **adopted** result (landed in code/prompts, locked in by tests and the
validator, recorded in `memory.md`) or a **retired** one (recorded in `failures.md` as
do-not-retry, with the conditions under which it would be worth revisiting). It is not a
tutorial on any one analysis technique — it is the process that decides when a technique has
produced enough evidence to stop iterating and write down a verdict.

## When NOT to use this

| If you need... | Use instead |
|---|---|
| The actual runnable recipes (worth-it steps, adversarial-review steps, negative-testing steps, byte-identity proof, fail-closed analysis, security-gate analysis) | `l00prite-proof-and-analysis-toolkit` |
| The four SOTA research axes and l00prite's concrete next steps toward each | `l00prite-research-frontier` |
| What counts as acceptable ledger evidence, the golden/certified test inventory, or "Verifier Theater" | `l00prite-validation-and-qa` |
| The full chronicle of a specific past incident, PR review round, or rejected design shape | `l00prite-failure-archaeology` |
| The WHY behind an already-adopted design decision, or the system's known-weak-points list | `l00prite-architecture-contract` |
| The procedure/gates for actually editing a file (byte-parity, review-gated files, branch policy) | `l00prite-change-control` |
| Role definitions, orchestration patterns, and hard rules for running a multi-agent pass | `l00prite-subagent-delegation` |
| The update ritual for docs of record, house style, or claim-discipline wording | `l00prite-docs-and-claims` |

---

## 1. The pipeline: hunch → accepted result (or retired)

Every stage below is illustrated with the same real, verified pass: the 2026-07-06 prompt-caching
work recorded in `.l00prite/ledger.md` (two entries, `2026-07-06T11:12:19Z` and
`2026-07-06T11:35:49Z`) and `.l00prite/todos.md`.

| Stage | What it means | Worked example (this repo) |
|---|---|---|
| **1. Hunch** | An idea that isn't obviously worth doing yet. | "Does provider prompt caching actually save tokens for `cli-os`'s tool-calling loop?" |
| **2. Worth-it analysis** | State the mechanism in one causal sentence; find the real cost model in the units that matter; verify against your own usage pattern, not a guess. Full recipe: `l00prite-proof-and-analysis-toolkit`. | Ledger, 2026-07-06T11:12:19Z: "the engine's coder loop re-sends a growing conversation on every tool turn (up to `MaxToolCalls` = 40 per unit, up to 25 units per run). Anthropic cache reads bill at ~0.1x input and 5m writes at 1.25x (break-even at 2 requests); the loop's calls are seconds apart, well inside the 5-minute TTL." Verdict recorded explicitly: *"Worth it = TRUE for Anthropic (implemented); OpenAI caching is automatic server-side and already metered, so the only work there was an accounting fix."* |
| **3. Hypothesis that predicts a number BEFORE running** | Write down what you expect to measure, in a concrete unit, before you build — so the build is a test of the hypothesis, not a post-hoc rationalization. | Two numeric predictions on record: (a) break-even at exactly **2 requests** inside the 5-minute TTL, from the 0.1x-read / 1.25x-write pricing ratio; (b) the min-token gate: a request's estimated size — `util.EstimateTokensFromChars` = `ceil(chars/3.5)` (`cli-os/internal/util/util.go:56-58`, verified) — must reach the model's `prompt_cache_min_tokens` manifest capability (4096 for Opus-tier/Haiku 4.5, 2048 for Fable 5; Sonnet 5's 2048 is explicitly flagged **unconfirmed** in the manifest note, `cli-os/internal/gateway/adapters/manifests/anthropic.json:25`) or the marker is skipped as a predicted dead no-op. Both predictions are falsifiable against a real trace; neither has been measured live yet (see Evidence bar, below). |
| **4. Smallest verifiable build** | Implement the smallest unit that lets the hypothesis be checked, gated so a wrong guess fails closed, not silently. | The Anthropic adapter change alone (`cli-os/internal/gateway/adapters/anthropic.go`) — capability-gated on the manifest's `prompt_cache` field, fail-closed for unknown models (`TestAnthropicUnknownModelGetsNoCacheMarkers`), explicit client markers win over auto-injection (`TestAnthropicExplicitCacheControlWins`). OpenAI's response-caching angle was deliberately **not** built in the same pass (see stage 7). |
| **5. Evidence collection** | The ledger entry format is the lab notebook: `command`, `exit_code`, `summary`, optional `evidence_path`, `timestamp`, per check — never a bare "tests passed." | `go test ./...` (all pass, 5 new tests named in the entry); `node scripts/validate-l00prite.js` (519 PASS, 0 FAIL); `node scripts/l00prite-doctor.js .` (HEALTHY) — each with its own `command`/`exit_code`/`summary` in the ledger. |
| **6. Adversarial refutation** | Assign the review to someone/something other than the author (bot round, separate critic session); verify every finding against the *actual current code* before acting on it — a finding can be stale or already-fixed by the time it's read. | The general pattern here is bot-review rounds on PRs (#7, #16, #22, #24) and assigned N-critic design reviews (2026-07-02, three critics, before any Execution Mode code was written) — see stage 8 for citations. For this specific caching pass: the planner cache-miss (stage 7) was *caught by the same author re-reading their own construction*, not an assigned reviewer — an honest gap, not a clean adversarial pass; log it as such rather than implying a refutation happened when it didn't. |
| **7a. Adopted** | Locked in by tests + the validator + a `memory.md`/`todos.md` decision entry. | Todos.md's "Later" section: *"Planner-turn cache hits (`cli-os`) — DONE 2026-07-06: system now splits into [stable block with breakpoint, volatile digest last without one]... NOT measured against the live API (no benchmark harness) — hit-rate improvement is asserted from byte-identical stable prefixes, verified in unit tests only."* Note the adoption is honest about its own evidentiary limit — see §2. |
| **7b. Retired / deferred** | Recorded with a stated condition for revival, not a flat "no." | Same todos.md: *"Repo-state-hash gateway response caching (`cli-os`): deliberately deferred from the 2026-07-06 prompt-caching pass — build only after a loop/memory/resume benchmark arm exists, so whether serving a cached response changes agent behavior is measurable rather than assumed."* This is the resurrection-condition pattern in its clearest form — see §3 for how it differs from a `failures.md` do-not-retry entry. |

---

## 2. The evidence bar, stated hard

- **One mechanism must explain ALL observations, including the negative ones.** If your
  explanation for why something works doesn't also explain the cases where it didn't, you don't
  have a mechanism yet — you have a story that fits the good cases. The caching pass models this:
  the mechanism ("byte-identical prefix + within-TTL cadence → cache hit") also predicts *when it
  won't* hit (planner calls, because `InjectMemory` prepended a per-request-volatile digest ahead
  of the stable content — the mechanism explaining the miss led directly to the fix, not a patch
  bolted on after the fact).
- **Claims are labeled by strength, weakest last:** `measured` (a number was actually observed
  against live traffic or a benchmark harness) > `asserted-from-construction` (the code is
  provably shaped a certain way — e.g. a unit test proves byte-identical output — but no live
  number was collected) > `project-recorded` (a ledger/doc states a fact about this project's own
  history, verifiable by reading the file, but not re-derived) > `unverified` (should not appear
  in anything written to memory.md or a public claim without the label attached). The caching
  pass is explicit about sitting at `asserted-from-construction`: *"there is still NO benchmark
  harness, so the real planner hit-rate improvement is asserted from construction (byte-identical
  stable prefix across turns), not measured against the live API"* (ledger,
  2026-07-06T11:35:49Z). Do not silently round `asserted-from-construction` up to `measured` in a
  later summary — that rot is exactly what `l00prite-docs-and-claims` exists to catch.
- **A claim survives *assigned* refutation, not just the absence of objection.** Nobody
  volunteering a counterargument is not evidence nobody could find one — see the PR #24 round-2
  finding (`.l00prite/ledger.md`, 2026-07-05T19:16:00Z–20:15:00Z): a real security-critical gate
  bypass (`constraints.md` neither hard-denied nor covered by its own denylist) existed through
  the first review round and the author's own line-by-line pass, and surfaced only once a
  *second*, differently-focused reviewer looked. The decision entry for that run states the
  discipline plainly: *"every finding was verified against the actual current code before fixing;
  none were speculative or already-stale by the time they were read"* — refutation only counts if
  someone actually tried to break the claim against current reality, and a "finding" only counts
  once you've re-checked it isn't already moot.

---

## 3. The idea lifecycle in files

An idea's home file tells you its current status — read `.l00prite/todos.md`,
`.l00prite/ledger.md`, `.l00prite/failures.md`, and `.l00prite/memory.md` in that order to find
where any given idea currently sits:

| File / section | Role | What lives there |
|---|---|---|
| `todos.md` → **Later** | Backlog, weakest commitment | Ideas worth doing eventually but not now — often *with* a stated go/no-go condition, e.g. the deferred response-caching item above ("build only after a benchmark arm exists"). |
| `todos.md` → **Next** | Queued, waiting on a dependency (often a maintainer decision) | e.g. as of 2026-07-06: "Maintainer decisions on l00prite CLI-OS design... answer `cli-os/docs/open-questions.md`." |
| `todos.md` → **Active** | Committed, in progress this pass | The current branch's declared unit of work — e.g. the Dashboard Runs view is the sole Active item as of 2026-07-06 (see `l00prite-runs-view-campaign`). |
| `todos.md` → **v1.2 gated batch** | A special quarantine, not a priority tier | Ideas that are individually good but *require* editing a review-gated file; batched together on purpose so nobody starts one piecemeal. `todos.md` states this explicitly: *"it is quarantined here as one coherent batch for the maintainer to review as a unit — so nobody is tempted to 'just quickly' touch a gated file."* This is scope discipline, not a verdict on the ideas' merit — see `l00prite-change-control` for the gated-file procedure itself. |
| `ledger.md` | The lab notebook — one entry per run, append-only | Every stage-5/6 evidence trail lives here, dated and attributed. Never overwritten; a retracted or superseded claim gets a *new* entry, not an edit to the old one. |
| `failures.md` → **Failed Approaches** | The graveyard | A rejected shape, with the reason. The ledger's own entry-template line defines the convention for revival: *"Do-not-retry notes: Failed approaches that should not be repeated **unless conditions change**"* (`.l00prite/ledger.md`, Entry Template). In practice, most `failures.md` entries here (e.g. the five 2026-07-02 rejected Execution Mode design shapes) state the flaw but not an explicit re-open condition — treat those as *effectively permanent* unless a new design genuinely removes the structural objection (forgeability, Zed's first-match priority, etc.), not as "revisit next quarter." Contrast with the `todos.md`-deferred item above, which *does* name its condition — that's the sharper pattern to imitate when you defer something yourself: state the condition, don't just leave it unstated and hope a future reader infers one. |
| `memory.md` → **Decisions** | Accepted canon | A durable, project-wide decision, written once it's settled — e.g. *"The pre-flight confirmation is per-run and session-local... any agent can write [persisted flags], so honoring them would be a forgeable blanket grant."* Adoption is only complete once the decision is both here (durable statement) **and** locked in by a check (validator assertion, a named Go test, a doctor rule) — a decision recorded in prose alone, with nothing enforcing it, is one incident away from silently regressing. |

---

## 4. Where good ideas historically came from

Verified against `.l00prite/ledger.md` and `HANDOFF.md` — instrument these sources on purpose,
they are not accidents:

1. **Bot review findings on real PRs.** PR **#7** (lock/lease + events, `6c7160a`), PR **#16**
   (doctor robustness + execute-loop hardening, `4fd9da8`), PR **#22** (CLI-OS onboarding fixes
   incl. a real security finding, `4b7f3b2`), PR **#24** (engine hardening, 21 findings across two
   rounds, `e6c9e2e`) — every one of these review rounds produced fixes that became permanent
   rules or regression tests, not one-off patches. Full incident detail:
   `l00prite-failure-archaeology`.
2. **Gap analysis against a reference repo.** The 2026-07-04T09:00:00Z pass's own goal statement:
   *"Analyze the loop-engineering repo, identify meaningful gaps in l00prite, and implement a
   coherent subset."* This produced the doctor, the failure/anti-pattern/concepts catalogs, and
   the Autonomous-Edit Denylist — a deliberate "read someone else's prior art, map it onto our own
   invariants" move, not an internally-generated idea.
3. **Direct maintainer briefs.** Most of this repo's largest passes (CLI-OS v1.0, the OS-APK
   engine build, the onboarding/friction pass, the prompt-caching pass) are recorded with
   `Triggering event: none — direct maintainer instruction in-session`. A maintainer brief is a
   legitimate and common idea source here, not an exception.
4. **Dogfooding.** The protocol runs its own repo: this repo's `.l00prite/`, its lock/lease
   convention, and its own denylist are the same files a scaffolded target project gets — running
   the real thing on itself is how several gaps (the `expired` lock state, the hardcoded
   `.codex/` path baked into Claude mirrors) were actually found, not theorized.
5. **Incident generalization.** A one-off bug fix becoming a standing rule/check is the repeated
   pattern, not the exception: the "prompt-copy drift era" (one bug fixed in 13 places) became the
   byte-parity validator; the `constraints.md` self-loosening bypass (PR #24 round 2) became the
   unconditional `protocolProtected` hard-deny plus a named regression test
   (`TestConstraintsMdIsProtocolProtected`, verified passing 2026-07-06); each PR #24 finding got
   its *own* named regression test rather than a shared "we fixed the reported bugs" commit.

**Implication:** when you're short on ideas, these five sources are where to look first, in
roughly this priority order for a repo-dev session — read open bot-review threads, read the
reference repo's own recent history for capability gaps, ask the maintainer directly, run the
protocol on itself and see what breaks, and re-read `failures.md`/`ledger.md` for a one-off fix
that never got generalized into a rule.

---

## 5. The model-tier method, applied to research work

The maintainer's standing rule (fully specified in `l00prite-subagent-delegation`; the gated-edit
angle is in `l00prite-change-control` §7) applies directly to research: **unless the maintainer
says otherwise, a Fable-class session decomposes the hunch into a testable hypothesis, adjudicates
which findings are real, and renders the final adopted/retired verdict; Opus/Sonnet-class sessions
execute the build and run the checks against that spec.** For a research pass specifically, add
one more role split: **assign adversarial verification to a session that did not write the code
under review** — the PR #24 story above is exactly the case where the author's own review missed
a gap that a second, differently-motivated reviewer caught. And treat an **empty result from a
session that was cut off (usage limit, timeout) as unknown, never as a clean bill** — the
2026-07-05T19:10:34Z OS-APK ledger entry states this as policy, not apology: *"the 16-agent
adversarial review workflow... was cut off by a session usage limit — the multi-agent adversarial
pass did NOT complete (its empty findings list is an artifact of the failure, not a clean bill)."*
This library (the 19 skills, authored the same way) is itself a standing instance of the pattern:
a top-tier session specs the inventory and scope boundaries, execution sessions write each skill
to spec, and a review pass checks the set adversarially before anyone treats it as done.

---

## 6. Session hygiene for research

- **Checkpoint long passes.** If a pass involves multiple agents or a long investigation, persist
  completed sub-results as they land (a ledger entry, a committed test) rather than holding
  everything until the end — a session that runs out of budget mid-pass should cost you the
  remaining unit of work, not the whole pass's findings.
- **Record negative results — they are data, not a null result to discard.** `execute-loop.md`
  states the rule for verification failures directly (`templates/l00prite/prompts/execute-loop.md`,
  step 4, verified): *"Never claim success when a check failed or could not run. If verification
  fails: record the attempt in `failures.md` (failure signature, attempt count, `do_not_retry`
  when warranted) and retry the unit with a different approach. Check `failures.md` before every
  retry."* The repo's own condensed framing of the same idea, `README.md:224` (verified): *"failure
  is data, not an ending — until it genuinely can't be fixed."* A hypothesis that turns out false
  is exactly as valuable to record as one that turns out true, because the next session needs both
  to avoid re-testing something already settled.
- **State what did and did not finish, before you run out of room to say so.** You cannot write
  the "this was cut off" ledger entry retroactively once the session ends — if you're a long pass
  running low on budget, write the honest status line *now*, not after you've already lost the
  chance.

---

## Provenance and maintenance

Every fact above is dated **2026-07-06**; the pipeline example, evidence-bar quotes, and go-test
names were re-verified while writing this skill. Re-check before relying on any of it later.

| Volatile fact stated above | Re-verification command |
|---|---|
| The 2026-07-06 caching-pass ledger entries exist as quoted | `grep -n "Run 2026-07-06T1" .l00prite/ledger.md` |
| `EstimateTokensFromChars` = `ceil(chars/3.5)` | `grep -n -A2 "func EstimateTokensFromChars" cli-os/internal/util/util.go` |
| `prompt_cache_min_tokens` values (4096 Opus/Haiku-tier, 2048 Fable 5, Sonnet 5 unconfirmed) | `grep -n "prompt_cache_min_tokens" cli-os/internal/gateway/adapters/manifests/anthropic.json` |
| The named caching regression tests exist and pass | `cd cli-os && go test ./internal/gateway/adapters/... -run 'TestAnthropicPromptCacheInjection\|TestAnthropicSystemSplitsStableAndVolatile\|TestAnthropicStableBelowMinimumEmitsNoSystemMarker\|TestAnthropicUnknownModelGetsNoCacheMarkers\|TestAnthropicExplicitCacheControlWins' -v` |
| The "conditions change" do-not-retry convention line | `grep -n "unless conditions change" .l00prite/ledger.md` |
| The deferred response-caching item and its stated resurrection condition | `grep -n -A2 "Repo-state-hash gateway response caching" .l00prite/todos.md` |
| `constraints.md` hard-deny regression test passes | `cd cli-os && go test ./internal/engine/... -run TestConstraintsMdIsProtocolProtected -v` |
| PR numbers #7/#16/#22/#24 map to the commits cited | `git log --oneline --grep '(#7)\|(#16)\|(#22)\|(#24)'` |
| "failure is data, not an ending" line | `grep -n "failure is data" README.md` |
| Validator still 519 PASS / 0 FAIL / exit 0 | `node scripts/validate-l00prite.js 2>&1 \| tail -5` |
| `docs/pricing-confirmation.md` exists (GLM/pricing do-not-retry context) | `ls cli-os/docs/pricing-confirmation.md` |
| `sandbox` branch exists (the one benchmark artifact referenced by `l00prite-research-frontier`) | `git ls-remote --heads origin \| grep sandbox` |
