---
name: l00prite-docs-and-claims
description: >
  Scope: l00prite repo development. Load this before writing or updating any doc of record in
  this repo — CLAUDE.md (incl. the §7 Run Ledger), HANDOFF.md, README.md/GETTING_STARTED.md,
  RELEASE.md (root or cli-os), docs/*, or any .l00prite/ memory file (ledger.md, memory.md,
  todos.md, failures.md) — or whenever you are about to write down a claim ("X works", "Y is
  fixed", "Z is measured/novel") and need to know whether it's safe to state. Also load it when
  you need: the update ritual for what to touch at end of session and in what order; the
  known-stale-docs inventory (so you don't cite a rotted claim as current); the S1/S2/S3 house
  style; or a ready-to-fill ledger-entry / Run Ledger row / HANDOFF section / do-not-retry
  template. Not for the two review-gated files' change procedure (see l00prite-change-control)
  or for the deep incident chronicle (see l00prite-failure-archaeology) — this skill is about
  keeping docs honest and current, not about classifying changes or replaying history.
---

# l00prite-docs-and-claims

**Scope: l00prite repo development.** This skill is about the l00prite repo's own documentation
— CLAUDE.md, HANDOFF.md, README.md, RELEASE.md, `docs/`, and `.l00prite/` memory files. If you
are working in a project that merely *uses* l00prite (has its own `.l00prite/`), this skill does
not apply to you; see the portable `l00prite-loop-operations` skill for how to keep *your own
project's* memory current instead.

## What this skill is for

Maintaining the l00prite repo's docs of record so they never outrun what is actually built:
knowing which doc is live and which is frozen-on-purpose, running the same update ritual every
session so nothing falls out of sync, writing in the house style this repo already uses
(severity tags, do-not-retry notes, dated claims), refusing to let a claim get stronger than its
evidence, and being honest in public-facing language about what is genuinely new here versus
what is known engineering. Use it whenever you are about to write a sentence that describes what
l00prite *does*, *has*, or *proved* — the check is "would this still be true if someone read only
the code and the ledger, not this sentence?"

## When NOT to use this

| If you need... | Use instead |
|---|---|
| The two review-gated files' procedure, the Autonomous-Edit Denylist, branch policy, or the model-tier rule | `l00prite-change-control` |
| Deep, story-level detail on a specific past incident (PR round, rejected design, ghost PR) | `l00prite-failure-archaeology` |
| The *why* behind a design decision and what would break if it changed | `l00prite-architecture-contract` |
| A specific symptom (validator FAIL, doctor WARN, go test failure) and the next diagnostic command | `l00prite-debugging-playbook` |
| The golden/certified inventory (test counts, negative-testing discipline, evidence standard mechanics) | `l00prite-validation-and-qa` |
| A repeatable proof recipe (worth-it analysis, adversarial review, fail-closed analysis) with worked examples | `l00prite-proof-and-analysis-toolkit` |
| The four SOTA axes fleshed out with concrete next steps | `l00prite-research-frontier` |
| The hunch-to-accepted-result research pipeline itself | `l00prite-research-methodology` |
| To actually run the parity/verify-all scripts, not just decide what to write | `l00prite-diagnostics-and-tooling` |

## 1. Docs-of-record map

Three buckets. Get a doc's bucket wrong and you'll either treat frozen prose as current or edit
something that is supposed to stay as-shipped.

### Living — update these; they describe current reality

- `CLAUDE.md` — the fixed protocol description (§1-2), requirements/DoD (§3-4), the loop
  contract (§5-6), the **§7 Run Ledger** (one compact row per session/pass), completion
  criteria (§8).
- `.l00prite/ledger.md` — full per-run entries (goal, decision, evidence, next action); the
  entry template lives at the top of the file itself — quote it, don't reinvent it (see
  §6 below).
- `.l00prite/memory.md` — durable decisions and facts only (not speculative notes).
- `.l00prite/todos.md` — Active / Next / Later / Done lifecycle, plus the quarantined
  **v1.2 gated batch** section (see §3).
- `.l00prite/failures.md` — the inherited generic catalog (clearly marked as *not* project
  history) plus this repo's own "Failed Approaches"/do-not-retry entries.
- `HANDOFF.md` — narrative summaries, but **only for passes a session judges "major"** — see
  the gap this creates below.
- `README.md`, `GETTING_STARTED.md` — external-facing description and quickstart.
- `docs/README.md`, `docs/concepts.md`, `docs/failure-modes.md`, `docs/anti-patterns.md` —
  loop-wisdom catalogs, explicitly attributed (see their own "Attribution" section) to the
  external Loop Engineering project, remapped onto l00prite's mechanisms.

### Historical-by-design — do not edit to match current reality; they say so themselves

- `RELEASE.md` (root) — titled "l00prite v1.1 (in review)"; its own text says: *"The v1 notes
  below are kept as shipped; where they say execution mode 'does not exist yet,' v1.1 is the
  release that adds it."* Read the preamble, not just the body, before citing anything below it.
- `cli-os/RELEASE.md` — same pattern one level down: a "v1.1.0 — Go rewrite" section on top,
  then `"Everything below describes the shipped v1 feature set (unchanged by the port)"`,
  then the original "v1.0.0" notes preserved verbatim.
- **Trap inside a historical-by-design doc**: a *live-looking* number sitting in the *newest*
  section is not automatically safe just because the section is recent. `cli-os/RELEASE.md`'s
  v1.1.0 section says `go test ./... = 51 checks` — true the day it was written (the Node→Go
  port), but stale now: verified today (2026-07-06) at 144 top-level `Test` functions / 170
  including subtests (`grep -rn "^func Test" --include="*_test.go" cli-os | wc -l`, and
  `go test ./... -v | grep -c "^=== RUN"`). "Historical-by-design" protects the *preserved*
  sections from being edited to match reality; it does not make a banner in the current section
  immune to rotting.

### Known-stale — verified rotted as of 2026-07-06; do not cite as current

| Doc / claim | What's wrong | Verified how |
|---|---|---|
| `cli-os/docs/v1-scope.md` | Describes the abandoned Node v1.0.0 scope; superseded by the Go port (`docs/node-to-go-port-notes.md`) | read the file; cross-check `cli-os/RELEASE.md` |
| `cli-os/docs/open-questions.md` | Its "Open" section still poses Q3 (runtime language) as unresolved, leaning Go — it's long since shipped as Go | `grep -n -B2 -A8 "Q3" cli-os/docs/open-questions.md` shows both a "Resolved for v1.0.0 → Node" line and a later "Open Questions → Q3 still open, leaning Go" line in the same file |
| `cli-os/docs/architecture.md` | Header says `Status: v1.0.0 implemented... Not merged to main` and describes the Node runtime | `sed -n '1,10p' cli-os/docs/architecture.md`; the Go engine has been merged since (PR #24, commit `e6c9e2e`) |
| `cli-os/RELEASE.md` "51 checks" | Real count is 144 top-level / 170 incl. subtests (Go, not the old Node figure) | see trap above |
| Root `RELEASE.md` | Frozen at "v1.1 (in review)"; several substantial passes (OS-APK core, prompt-caching) have shipped since and are not reflected | compare its title/date to `.l00prite/ledger.md`'s tail |
| `cli-os/internal/gateway/dashboard.go:30` `var Version = "1.0.0"` | Never bumped past the original Node release | `grep -n "var Version" cli-os/internal/gateway/dashboard.go` |
| `cli-os/docker-compose.yml` image tag `l00prite-cli-os:1.0.0` | Same stale version tag | `grep -n image cli-os/docker-compose.yml` |
| `.l00prite/todos.md` "Active" section header | Still names branch `OS-APK`, which GitHub auto-deleted on PR #24's merge and which was never recreated for the caching work that followed | `git ls-remote --heads origin` — `OS-APK` is absent (present: `main`, `sandbox`, `add-codex`, `claude/beautiful-gauss-bxlzbs`, `claude/token-caching-analysis-y2zp35`) |
| `HANDOFF.md`'s newest section | Still the 2026-07-04 "loop-maturity gap pass" — no section exists for the CLI-OS onboarding pass, the OS-APK engine build, the prompt-caching pass, or the planner cache-miss fix (all later, all substantial) | `grep -n "^## Latest update" HANDOFF.md` — 7 sections, newest dated 2026-07-04; none of the later passes appear |

The Playwright harness (`uitest.js`) cited "18/18" twice in `.l00prite/ledger.md` was **never
committed** to any branch — confirmed by `find / -iname uitest.js` (no result) and
`git log --all --oneline -- '**/uitest.js'` (no result). That evidence is not reproducible from
the repo; treat the 18/18 claim as asserted, not independently checkable, until a harness lands
(the campaign in `l00prite-runs-view-campaign` is expected to commit one).

## 2. The update ritual per session

Do these in this order at the end of any session that changed something real. Skipping a step
or doing them out of order is how the gaps in §1 happen.

1. **`.l00prite/ledger.md`** — append a full entry using the file's own Entry Template (§6
   below). This is the *complete* record: goal, decision, every changed file, one
   `command`/`exit_code`/`summary`/`timestamp` block per check actually run, failures,
   do-not-retry notes, lock status. Never skip evidence fields — see `l00prite-validation-and-qa`
   for what counts as evidence.
2. **`CLAUDE.md` §7 Run Ledger row** — one compact row summarizing the same pass, using the
   table's existing header shape (§6 below). **Append it as the new last row, after the
   current last row — not before it.** Real incident (2026-07-06): commit `aaa4a46` appended a
   "Prompt-caching pass" row as the table's last line; a later commit `50c1c6d`, recording a
   *following* pass ("Planner cache-miss fix"), inserted its new row **above** that existing
   last row instead of below it — so today the table lists "Planner cache-miss fix" before
   "Prompt-caching pass" even though `.l00prite/ledger.md`'s timestamps prove the cache-miss fix
   happened *after* (11:35:49Z vs. 11:12:19Z the same day). The fix costs nothing — always
   append below the row that was last before your edit, never above it — but the fact that it
   already happened once is why rule 3 below exists.
3. **`.l00prite/todos.md`** — move items between Active/Next/Later/Done; if the pass produced
   work that can only land by editing a review-gated file, add it to the **v1.2 gated batch**
   section (or a future equivalently-named quarantine section) rather than doing it piecemeal —
   the batch's own heading says why: *"review together, do not start piecemeal."*
4. **`HANDOFF.md`** — only for passes you judge *major* (new capability, architecture change,
   a full review round). Add a new `## Latest update: <title>` section **at the top of the
   file** (newest-first — verify against the file: its sections run 2026-07-04 → 2026-07-01,
   descending), with `### What changed`, `### Files added / modified`, `### Remaining gaps`
   subsections (§6 below). If you skip this step for a real pass (which is allowed — most
   passes above skip it), that pass simply will not appear in HANDOFF.md at all; that is by
   design, not a bug, but it means **HANDOFF.md's top section is not reliably "the latest
   thing that happened"** — see the known-stale table above for the current gap.
5. **`memory.md` / `failures.md`** — only for genuinely durable decisions or a newly
   rejected/failed approach; do not use these as a scratch pad (that's what `sessions/` is for).

**Lock protocol**: steps 1, 3, and 5 write `.l00prite/` protected paths. Check `lock.json` per
`LOCKING.md` before writing (acquire if unlocked/released/expired; respect a foreign active
lock; release when done) — the full rule set is `l00prite-change-control`'s and
`l00prite-loop-operations`'s territory; this skill only flags that the *content* rules above
don't suspend the *locking* rules.

**The complementary-ledgers relationship, stated plainly**: `CLAUDE.md` §7 is a *curated
summary* — roughly one row per session/pass a maintainer would want to skim. `.l00prite/ledger.md`
is the *complete* record — every run, including small bookkeeping and review-response rounds
that never get their own `CLAUDE.md` row. Verified example: the 2026-07-05 OS-APK pass has
**three** separate ledger.md entries (the build itself at 19:10, the PR #24 bot-review-response
round at 19:16-20:15, and the merge close-out at 20:17) but **exactly one** `CLAUDE.md` row
("L00prite OS core (OS-APK)") — `grep -n "PR #24\|review round\|merge close-out" CLAUDE.md`
returns nothing. If you need finer-grained history than a `CLAUDE.md` row gives you, the ledger
tail is where it lives, never the table.

## 3. House style

- **S1/S2/S3 severity** (from `docs/failure-modes.md`, verify with
  `grep -n -A5 "^## Severity" docs/failure-modes.md`):

  | Severity | Meaning |
  |---|---|
  | S1 — Annoying | Wasted time/tokens, no lasting harm |
  | S2 — Harmful | Wrong code committed, corrupted memory, misleading ledger |
  | S3 — Critical | Security, data loss, credentials, production incident |

  Some failure modes carry a range (e.g. `docs/failure-modes.md`'s "State Rot" is `S1 → S2`,
  "Over-Reach" is `S2 → S3`) — that means severity depends on what actually got touched; state
  the range, don't collapse it to one number.
- **Do-not-retry notes**: a rejected approach gets a bullet stating what was tried, why it fails,
  and (if relevant) what would have to change to retry it. See `.l00prite/failures.md`'s
  "Failed Approaches" section for five real examples in this exact voice, and the do-not-retry
  skeleton in §6.
- **Decision-with-why records**: `.l00prite/memory.md`'s "Decisions" list is the model — every
  line states the decision *and* the reason in the same sentence (e.g. *"run_boundaries, not
  stop_conditions, to avoid colliding with heartbeat.json's existing top-level
  stop_conditions"*). A decision without its reason will look arbitrary to the next reader and
  invite being silently re-litigated.
- **Date-stamping volatile facts**: any count, branch state, or "current" claim gets
  `(as of YYYY-MM-DD)` — this repo's own history is the reason (see the known-stale table
  above; every one of those entries was once an accurate, undated claim).
- **"In review" status discipline**: `CLAUDE.md` §7's Status column uses exactly three values
  today — `Merged`, `In review`, and one `Superseded; design preserved in ...` (the
  execution-mode design note row) — verify with `grep -n "^| " CLAUDE.md`. A pass whose branch
  touched either review-gated file, or which simply hasn't been merged yet, stays `In review`
  until a maintainer merges it; don't write `Merged` optimistically. Five consecutive passes as
  of 2026-07-06 (Universal agent layer, Loop-maturity gap, CLI-OS onboarding, L00prite OS core,
  Planner cache-miss fix, Prompt-caching pass — six, actually, by current count) are `In review`
  simultaneously; that's expected under this repo's "feature branch, maintainer merges" policy
  (`l00prite-change-control` owns that policy's full rationale).
- **ASCII-safe Markdown conventions actually observed here**: decorative banners go inside a
  fenced code block so Markdown renders them literally instead of reinterpreting them — the
  README's ASCII-art banner was deliberately kept fenced through the 2026-07-01 branding pass
  (`grep -n -B2 -A2 "ASCII" HANDOFF.md`). The repo does not use emoji in docs of record. Plain
  em dashes and straight quotes are used throughout (not curly/smart-quote typography) — match
  what surrounds your edit rather than introducing a new convention.

## 4. Claim discipline

Standing rules, each with the incident that produced it:

- **No capability claim the repo doesn't have.** Commit `87384b4` ("Add execution mode to
  l00prite with safety features") touched **only** `CLAUDE.md` — 75 insertions, 41 deletions,
  one file (`git show --stat 87384b4`) — describing a `--execute` flag, pre-flight
  confirmation, and stop conditions with **zero** corresponding code anywhere in the repo. The
  next session (commit `b2903b3`) caught it and rewrote `CLAUDE.md` to describe only what
  existed, moving the design to an explicitly-labeled "not yet built" note. The rule this
  produced: a doc claim and the code that backs it land in the **same** commit/PR, or the doc
  says "designed, not yet built" in so many words.
- **"NOT measured" stays attached to the claim, not buried in a caveats section.** Both 2026-07-06
  caching passes state cache-hit-rate improvement is *asserted from construction* (byte-identical
  constructed requests in unit tests), explicitly **not** measured against the live API — no
  benchmark harness exists (`.l00prite/ledger.md`, "Known limits" fields on both entries). Any
  performance/efficacy claim without a harness carries this label inline, next to the claim
  itself, not three paragraphs later.
- **Unconfirmed pricing stays `null`, never backfilled from training-data memory.** GLM/Zhipu
  pricing was carried as a third-party figure early on, then deliberately deleted once official
  pages proved unreachable — `cli-os/docs/pricing-confirmation.md` records this explicitly
  (*"prior third-party figures removed"*); the do-not-retry note in `.l00prite/ledger.md`
  (2026-07-04T00:00:00Z entry) is exactly this rule. A manifest field with unconfirmed pricing
  is `null` and flagged, never a guessed number.
- **Commit the harness or the evidence is dead.** The Playwright "18/18" claims (cited twice in
  the ledger, 2026-07-04 and 2026-07-04-review-round entries) point at `uitest.js`, which was
  never committed (verified in §1). The lesson isn't "don't trust the number" — it's "a claim
  that depends on a script is only as durable as that script's presence in the repo." Any future
  claim of this shape must land the harness in the same PR as the claim.
- **Trust order when a doc claim and reality might disagree**: `.l00prite/ledger.md`'s tail +
  `git log` > `CLAUDE.md` (curated, but still living) > topic docs under `docs/`/`cli-os/docs/`
  > banners, counts, and version strings anywhere. Banners are the least trustworthy thing in
  the repo because nothing forces them to update when the number they quote changes — see every
  row of the known-stale table in §1.

## 5. External positioning: novel vs known

When describing l00prite to an audience outside this repo (a README pitch, a comparison table,
a "what's new here" claim), separate what's genuinely novel from what's known engineering
wearing this repo's names — and tie every novelty claim to what would have to be proven before
saying it without qualification. The four axes below are the maintainer's own frame for "beyond
state of the art" (fully developed, with concrete next steps, in `l00prite-research-frontier` —
this section only states the claim-discipline framing, not the research plan).

| Claim | Status today | What must be proven before saying it unqualified |
|---|---|---|
| Byte-parity mirrored, vendor-neutral loop prompts (6 prompts × 7 locations, validator-enforced) | Real and mechanically enforced (`node scripts/validate-l00prite.js`, `cmp` across locations) | Nothing extra — this one is enforced, not asserted |
| A mechanical execute-loop **engine** (not just prompt text) with a protocol-conformance table (9 boundaries as code, fail-closed gates, regression-tested) | Real, `go test` covers it, but its own adversarial concurrency review was cut off by a usage limit and never re-run (`.l00prite/ledger.md`, 2026-07-05 entry, "Failures") | The deferred adversarial pass + a documented race-condition test suite — cross-ref `l00prite-research-frontier` axis 2 |
| Disarmed-by-default execution schema (persisted flags never authorize; every run re-confirms in-session) | Real, validator- and doctor-enforced, with negative tests proving the drift-detection actually fires | Nothing extra structurally — the open question is adoption, not mechanism |
| Demonstrated cross-vendor mid-run continuity (stop with agent A, resume with agent B) | **Not built.** A cross-agent compatibility test is a roadmap `todos.md` item, not a shipped result | A scripted, reproducible A→B handoff test passing in-repo — this is axis 1's milestone |
| Measured memory/caching value (a number, not an assertion) | **Not measured.** The only benchmark artifact in the whole project is the `sandbox` branch A/B run, deliberately never merged to `main` (`l00prite-failure-archaeology` owns its story) | A committed benchmark harness producing a real number (e.g. cache-read share from ledger columns under real traffic) |
| l00prite as an adopted ecosystem standard | **Not attempted.** No external project has run the doctor/validator against itself | An external project passing a generalized conformance check without this repo's help |

Known/derivative, and fine to say so plainly rather than dress up as novel: the AGENTS.md
ecosystem itself (l00prite is a participant, not the inventor); the LLM-gateway pattern in
`cli-os` (routing, adapters, metering — a well-known shape); a Policy Enforcement Point outside
the deciding process (a known security pattern, applied here to `$` caps).

## 6. Templates

Ready-to-fill skeletons. Copy the shape; do not invent a different field set — a differently
shaped entry is exactly the "vague tests passed" failure `docs/failure-modes.md`'s Verifier
Theater entry and `scripts/l00prite-doctor.js`'s evidence check both watch for.

### Ledger-entry skeleton (quoted from `.l00prite/ledger.md`'s own Entry Template — do not drift from it)

```markdown
### Run YYYY-MM-DDTHH:MM:SSZ — <agent name>
- **Goal:** What this run attempted.
- **Triggering event:** Event id/type/source, or `none` for normal roadmap work.
- **Reviewer/comment reference:** PR, issue, CI run, reviewer, URL, file/line, or `none`.
- **Decision:** Valid, already fixed, unclear, unsafe, blocked, deferred, stale-lock-recovery, or normal work; include why.
- **Completed work:** What changed or was learned.
- **Fix implemented:** The smallest fix made for the event, or `none` with reason.
- **Changed files:** Files created, modified, deleted, or intentionally left untouched.
- **Tests run / Verification:** One entry per check run, each with `command`, `exit_code`,
  `summary`, `evidence_path` (optional), and `timestamp`. Do not write vague statements like
  "tests passed" without at least `command`, `exit_code`, and `summary`.
- **Response drafted/sent:** Reviewer, issue, or human response status and summary.
- **Event status:** Pending, processing, completed, blocked, deferred, or not applicable.
- **Failures:** Errors, blockers, failed approaches, or skipped checks.
- **Decisions:** Durable decisions made during the run.
- **Confidence:** Low/medium/high plus a short reason.
- **Next action:** The next smallest useful step.
- **Do-not-retry notes:** Failed approaches that should not be repeated unless conditions change.
- **Lock:** `lock_id` acquired/released this run, or `none` if no protected-path write occurred.
  Note stale-lock reclamation here if applicable.
```

### Run Ledger row skeleton (matches `CLAUDE.md` §7's real header)

```markdown
| Session | Date | Built | Tested | Status |
|---------|------|-------|--------|--------|
| <short session name> | YYYY-MM-DD | <what was built, one sentence, enough to skim> | <exact command(s) run, e.g. `node scripts/validate-l00prite.js` (N PASS, 0 FAIL)> | Merged / In review / Superseded |
```
Append this row **after** the current last row (see §2's incident) — check
`grep -n "^| " CLAUDE.md \| tail -1` first to confirm what the last row currently is.

### HANDOFF section skeleton (matches the repeated shape of `HANDOFF.md`'s existing sections)

```markdown
## Latest update: <short title> (<status if still in review>)

<1-2 paragraphs: what prompted this pass, who/what drove it, which branch>

### What changed

- **<area>** — <what, verified how>
- ...

### Files added / modified

Added: <list>.
Modified: <list>.
**Zero-line diff** to `.claude/commands/build-loop.md` and `scripts/validate-l00prite.js`
(state this explicitly if true — it's a load-bearing fact for change-control review).

### Remaining gaps

- <what's left undone, and where it's tracked (todos.md item, follow-up PR, etc.)>
```
Insert this as a **new section at the very top of the file** — `HANDOFF.md` is newest-first
(verify: its existing sections run 2026-07-04 down to 2026-07-01).

### Do-not-retry entry skeleton (matches `.l00prite/failures.md`'s "Failed Approaches" voice)

```markdown
- <What was tried, in one clause> — <why it fails or what it breaks>. <What the fix/rule is
  instead, and where it's codified (a file, a validator check, a boundary name)>.
```
Real example to match the register against (`.l00prite/failures.md`):
*"Telling an agent to stop on any active, unexpired lock, including one it already owns — this
made an agent updating several protected files in one run block on its own first write. Fixed
by scoping the 'respect an active lock' rule to locks owned by a different agent/session
(`LOCKING.md` rule 3)."*

## Provenance and maintenance

Every volatile fact above, with a one-line command to re-check it. Run these before relying on
a number in this skill — this repo's own history (the known-stale table in §1) is the proof
that none of them stay true forever.

| Fact stated above | Re-verification command |
|---|---|
| Validator: 519 PASS, 0 FAIL, exit 0 | `node scripts/validate-l00prite.js \| tail -3; echo "exit=$?"` (run from repo root; FAILs go to stderr — pipe `2>&1` if you want them merged) |
| Doctor: 25 ok / 0 warn / 0 fail, HEALTHY | `node scripts/l00prite-doctor.js .` |
| go test: 144 top-level / 170 incl. subtests, all pass | `cd cli-os && go test ./... && grep -rn "^func Test" --include="*_test.go" . \| wc -l` |
| `gateway.Version` stale at "1.0.0" | `grep -n "var Version" cli-os/internal/gateway/dashboard.go` |
| docker-compose image tag stale at 1.0.0 | `grep -n image cli-os/docker-compose.yml` |
| `OS-APK` branch absent from origin | `git ls-remote --heads origin` |
| `uitest.js` never committed | `find / -iname uitest.js 2>/dev/null; git log --all --oneline -- '**/uitest.js'` (both empty) |
| `87384b4` touched only `CLAUDE.md` (75+/41-) | `git show --stat 87384b4` |
| CLAUDE.md §7 row-order incident (`aaa4a46` then `50c1c6d`) | `git show aaa4a46 -- CLAUDE.md; git show 50c1c6d -- CLAUDE.md` |
| CLAUDE.md §7 has no row for the PR #24 review round / merge close-out | `grep -n "PR #24\|review round\|merge close-out" CLAUDE.md` (expect no output) |
| HANDOFF.md's newest section is still the 2026-07-04 loop-maturity pass | `grep -n "^## Latest update" HANDOFF.md` |
| S1/S2/S3 taxonomy text | `grep -n -A6 "^## Severity" docs/failure-modes.md` |
| GLM pricing deliberately nulled | `grep -n "removed" cli-os/docs/pricing-confirmation.md` |
| Current branch / tip (moves during active sessions — treat as live, not fixed) | `git branch --show-current; git log --oneline -1` |
