---
name: l00prite-proof-and-analysis-toolkit
description: >
  Scope: any l00prite-managed project. Load this when you need a rigorous METHOD for proving a
  claim rather than asserting it — before building something whose payoff is unobvious ("is
  this worth building"), before implementing a design with security/protocol stakes ("what
  would break this"), right after writing any checker/gate/validator ("does it actually catch
  bad input"), when correctness depends on two things being byte-for-byte equal (cache
  prefixes, parity mirrors), when adding any lookup whose caller branches on
  found/not-found/error ("what does 'unknown' default to"), when building or reviewing any
  allowlist/denylist/path-containment gate, or when tempted to gate a stop/budget decision on
  self-reported token counts. Delivers seven runnable recipes (worth-it analysis, adversarial
  design review, negative testing, byte-identity proof, fail-closed analysis, security gate
  analysis, wall-clock-first budget reasoning), each with generic steps you can run in YOUR
  project plus a verified worked example from the l00prite protocol repo's own engineering
  history, cited as illustration.
---

# l00prite proof-and-analysis toolkit

**Scope: any l00prite-managed project.** These are first-principles analysis methods —
they don't require your project to be the l00prite protocol repo, and they don't require
`cli-os` or any particular language. Apply the **Steps** in each recipe to your own code,
tests, and design docs. The **Worked example** in each recipe is a real, previously-verified
case study drawn from the l00prite protocol repo's history (dated, and re-verified while
writing this skill, 2026-07-06) — read it as a demonstration of the method, not as something
that runs against your project. If you happen to have a clone of the l00prite protocol repo
open, the exact commands are given and are reproducible there; if you don't, skip straight to
applying the Steps to your own work.

This is a **toolkit of techniques**, not a checklist of things l00prite already guarantees.
Nothing here overrides your project's own `.l00prite/prompts/` — those files are authoritative
for how YOUR loop actually runs; this skill is about how to prove something before or after you
build it, in any codebase.

## When NOT to use this

| If you need... | Use instead |
|---|---|
| What counts as evidence in a ledger entry, "Verifier Theater," or the current golden test/validator counts | `l00prite-validation-and-qa` |
| The full hunch-to-accepted-result pipeline (worth-it verdict → hypothesis → evidence bar → adopted/retired) and the claim-strength ladder | `l00prite-research-methodology` |
| The complete incident timeline behind a specific PR/commit/bug (symptom → root cause → status) | `l00prite-failure-archaeology` |
| The WHY behind an existing l00prite design decision, or its known-weak-points list | `l00prite-architecture-contract` |
| Interpreting validator/doctor output you're staring at right now, or a git-archaeology command | `l00prite-diagnostics-and-tooling` |
| A function-level map of `cli-os` internals to find where to add a new gate/adapter/check | `l00prite-cli-os-internals` |
| The procedure and gates for editing a review-gated file in the l00prite repo itself | `l00prite-change-control` |
| The four SOTA research axes and l00prite's concrete next steps toward them | `l00prite-research-frontier` |

---

## Recipe 1 — Worth-it analysis (before building)

**When to use:** before investing effort in anything whose payoff isn't obviously positive —
an optimization, a cache, a new abstraction — where "it sounds efficient" is not the same as
"it is efficient for how you actually use it."

**Steps:**
1. State the mechanism in one causal sentence: why would this help, mechanically?
2. Find the real cost model in the actual provider/library docs, in the units that matter
   ($/token, ms, requests) — not a remembered approximation.
3. Compute the break-even point in those units **before** writing any code.
4. Check your actual usage pattern against that break-even (call cadence vs. a cache TTL,
   request count vs. a threshold) — the math is worthless if you never check it against reality.
5. State a verdict explicitly: **true** / **false** / **deferred-pending-X**.
6. If deferred, name exactly what evidence would flip the verdict, and where it's tracked —
   don't build the deferred part anyway just because you're already in the file.

**Worked example** (l00prite repo, ledger `2026-07-06T11:12:19Z`, "prompt-caching worth-it
analysis + gateway implementation"): Anthropic's ephemeral prompt cache reads bill at ~0.1x
input price and 5-minute writes at 1.25x — a break-even at **2 requests** inside the TTL. The
`cli-os` engine's coder loop resends a growing conversation on every tool turn (up to
`MaxToolCalls`=40 per unit, up to 25 units per run), seconds apart — well inside the 5-minute
TTL — so the verdict was **TRUE** for Anthropic, and it was implemented
(`cli-os/internal/gateway/adapters/anthropic.go`: `system` rendered as a cache-markable block
array). For OpenAI, caching is automatic server-side and already metered, so the only real work
was an accounting fix (making `cached_tokens` disjoint from `prompt_tokens` so `CostOf` can't
double-price a cached token) — no cache-injection code was needed there. A third candidate,
repo-state-hash gateway response caching, was **deliberately deferred** — the ledger entry
states it explicitly: "no benchmark arm exists to measure behavior impact — queued in
`todos.md`" — rather than guessed at or built speculatively.

**Failure modes:** computing a break-even and never checking it against real call cadence (an
optimization that pays off at 2 requests is worthless if your traffic never repeats a prefix);
treating "sounds efficient" as the verdict instead of a computed number; building the deferred
part anyway because the file is already open (scope creep past the worth-it boundary you just
drew).

---

## Recipe 2 — Adversarial design review (before implementing)

**When to use:** before implementing a nontrivial design with more than one viable shape,
especially one touching a security or protocol invariant.

**Steps:**
1. Draft the design compactly enough to attack — bullet points, not prose.
2. Brief independent critics (separate sessions/models, or separate passes if only one model is
   available) with an explicit **adversarial mandate**: find reasons to reject this design, not
   reasons to like it.
3. Give every critic the actual invariants/non-negotiables the design must satisfy — a critic
   who doesn't know the rules can't check the design against them.
4. Collect **blockers**, not preferences. A "this could be misused" finding is a redesign
   trigger, not a nice-to-have.
5. For every blocker, either reshape the design, or record why the rejected shape should not be
   retried in a durable memory file (this project's `failures.md`-equivalent) — so nobody
   re-proposes it cold.
6. Only then implement.

**Worked example** (l00prite repo, ledger `2026-07-02T00:00:00Z`, v1.1 Execution Mode design):
"An adversarial three-critic design review ran before implementation; its blockers reshaped the
design." Five shapes were rejected and recorded do-not-retry in `.l00prite/failures.md`; the
three most load-bearing:
- **Pre-arming** — `--execute` writing `execution.enabled: true` at scaffold time — rejected
  because "the confirmation would predate the code it covers, and the repo would sit armed on
  disk for any later agent to discover."
- **Persisted confirmation as authorization** — treating a saved `preflight_confirmed: true` as
  authorizing a new run — rejected because "the field lives in agent-writable `heartbeat.json`,
  so it is forgeable and transferable across sessions."
- **Bare-pointer vendor adapters** ("just read `AGENTS.md`") — rejected because "they deliver
  nothing on Copilot surfaces that can't open files, and Zed's first-match priority list would
  let `.github/copilot-instructions.md` shadow `AGENTS.md` entirely."

(Two more rejected the same pass: shipping `.aider.conf.yml` into target repos, and naming the
boundary list `stop_conditions` — a collision with `heartbeat.json`'s existing field.)

**Failure modes:** briefing critics without telling them the actual non-negotiables (they
approve a design that quietly violates one); running the review **after** writing the code
(sunk cost softens the verdict); treating "no objections raised" as a passing review instead of
confirming the critics actually tried to break it — this is the maintainer-named near-miss:
an empty findings list can mean a session died mid-review, not that the design is clean.
Record the review's own evidence (who reviewed, what was checked) the same way you'd record a
test run — see `l00prite-validation-and-qa`.

---

## Recipe 3 — Negative testing (after building a checker)

**When to use:** immediately after writing any checker/gate/validator whose entire job is to
catch a bad state. A checker that has never seen a bad input hasn't been tested — it's been
demoed.

**Steps:**
1. Enumerate the distinct ways the checked invariant could break — not just one.
2. For each way, mutate a **disposable or reversible** copy of the target so the checker sees
   exactly that broken state.
3. Run the checker; assert it reports the **specific expected failure**, not just a nonzero
   exit code.
4. Restore the original state exactly; re-run the checker; assert it's clean again.
5. Never leave a real project mutated between steps 2 and 4 — diff/`cmp` back to clean before
   moving to the next break or ending the session.

**Worked example A — byte-parity validator** (reproduced fresh for this skill, l00prite repo,
2026-07-06): appended one line to a byte-parity mirror, ran the validator, then restored it.

```
# from the l00prite repo root
cp .claude/prompts/execute-loop.md /tmp/execute-loop.md.bak
echo "drift-injected-line" >> .claude/prompts/execute-loop.md
node scripts/validate-l00prite.js   # exit 1; 1 FAIL line on stderr, 518 PASS on stdout
cp /tmp/execute-loop.md.bak .claude/prompts/execute-loop.md
node scripts/validate-l00prite.js   # exit 0; 519 PASS, 0 FAIL again
```
Observed: `exit=1`, one stderr line — `FAIL .claude/prompts/execute-loop.md is byte-identical
to canonical templates/l00prite/prompts/execute-loop.md` — then, after restore, `exit=0` with
519 PASS / 0 FAIL and an empty `git status` diff. This mirrors the same class of test recorded
historically in `.l00prite/ledger.md`'s `2026-07-02T00:00:00Z` entry (drift injected into a
prompt mirror, an adapter dogfood copy, and `heartbeat.json`'s `enabled: true` — each produced
the expected FAIL, then recovered after restore).

**Worked example B — doctor, 5 independent breaks** (reproduced fresh for this skill, run
against a **disposable copy** of `.l00prite/` + `.claude/`/`.codex/` in scratch space, never the
live repo). Baseline: `node scripts/l00prite-doctor.js .` → `25 ok · 0 warn · 0 fail`, exit 0.
Five isolated breaks, each applied to a fresh baseline copy and reverted before the next:

| # | Break | Result |
|---|---|---|
| 1 | Corrupt `heartbeat.json` to invalid JSON | 1 FAIL — "heartbeat.json is not a valid JSON object..." |
| 2 | Flip `execution.enabled=true`, leave `state.execution_active=false`, no lock | 1 FAIL — "arming mismatch: heartbeat execution.enabled=true but state.execution_active=false" |
| 3 | Rename the "Inherited loop failure modes" heading in `failures.md` | 1 WARN — "failures.md is missing the inherited failure-mode catalog" |
| 4 | Strip `.env`/`credentials` tokens from `constraints.md`'s denylist block | 1 WARN — "...missing critical protections: .env" |
| 5 | Append a line to `.l00prite/prompts/execute-loop.md` (breaks parity with both mirrors) | 2 FAIL — one per mirror (`.claude/`, `.codex/`) |

Final restored copy re-verified `25 ok · 0 warn · 0 fail`, exit 0. This is a fresh,
independently-run 5-way test — it does **not** need to (and doesn't) match the "3 FAIL + 2
WARN" combined-run figure `HANDOFF.md` cites for the original 2026-07-04 doctor negative test,
which broke several things **at once** in one run rather than five isolated single-break
trials. Treat that HANDOFF figure as a historical claim, not something this skill re-derives.

**Failure modes:** testing only the happy path and calling it done; mutating the real project
file in place and forgetting to restore it; asserting on exit code alone when the same nonzero
code could come from an unrelated error (assert on the specific message, as above).

---

## Recipe 4 — Byte-identity proof

**When to use:** whenever correctness depends on two things being **exactly** equal, not
merely equivalent — prompt-cache prefix matching, byte-parity mirrors, any content-addressed or
prefix-addressed system.

**Steps:**
1. Identify exactly which bytes must match — not "the request," the specific block/prefix.
2. Construct the artifact twice under two different (but otherwise realistic) inputs that
   should **not** affect the matching prefix.
3. Serialize both exactly the way the consuming system would (same encoder, same field order)
   and compare **bytes**, not structural/semantic equality.
4. Assert equality on the part that must match, **and** inequality on the part that's expected
   to legitimately differ — an equality-only test can't tell you the split is real.
5. Label the result for what it is: a proof that your construction is byte-stable, not a
   measurement of what the remote system does with those bytes.

**Worked example** (l00prite repo, `cli-os/internal/gateway/adapters/adapters_test.go:206-229`,
`TestAnthropicStablePrefixIdenticalAcrossDigests`, from ledger `2026-07-06T11:35:49Z` "planner
cache-miss fix"): builds two Anthropic requests with different per-turn memory digests
("digest turn 1: ledger tail A" vs. "...B") and asserts the serialized **stable** system block
(`jsonStringify(s1[0]) == jsonStringify(s2[0])`) is byte-identical across both calls, while
asserting the **volatile** digest block differs (`s1[1] != s2[1]`) — proving the stable/volatile
split actually isolates what changes from what doesn't, which is exactly the byte equality
Anthropic's prefix cache hashes on.

```
cd cli-os
go test ./internal/gateway/adapters/... -run TestAnthropicStablePrefixIdenticalAcrossDigests -v
# --- PASS: TestAnthropicStablePrefixIdenticalAcrossDigests (0.00s)
```

**Limits (the labeled gap):** this is **asserted from construction**, not measured — it proves
the bytes the adapter would send are stable, not that Anthropic's real cache hit rate improves
in production. The same ledger entry says so directly: "the real planner hit-rate improvement
is asserted from construction (byte-identical stable prefix across turns), not measured against
the live API" — no benchmark harness exists yet (tracked in `todos.md`).

**Failure modes:** treating a passing byte-identity unit test as proof of a production
performance claim; comparing structural/deep equality instead of serialized bytes (some
encoders reorder keys or normalize whitespace, silently passing a check a real prefix-matcher
would reject); omitting the "must differ" assertion (a split that does nothing would still pass
an equality-only test if the fixture never varies).

---

## Recipe 5 — Fail-closed analysis

**When to use:** any time you add a lookup, cache, or gate whose caller branches on the answer
— before deciding what "not found" / "error" / "unknown" should mean to that caller.

**Steps:**
1. Enumerate every return path of the lookup: found, legitimately-absent, and
   error/couldn't-tell. These are three different things — don't let two collapse into one.
2. For each caller, ask: does treating error/unknown the same as not-found/false/empty put you
   on the **safe** side of this specific decision, or the risky side?
3. Force the unknown/error path to the safe (deny / zero-value / most-restrictive) branch
   **explicitly** — never let it fall through a shared "if absent" branch that also handles the
   legitimately-empty case, unless the safe answer really is identical for both.
4. Write a test that specifically injects the error/unknown path (not just a normal not-found)
   and asserts the safe outcome.
5. Comment *why* at the call site — the reasoning gets silently "simplified away" by a future
   refactor otherwise.

**Worked example (cautionary tale)** — l00prite repo, PR #24 round-1 review fixes, commit
`ce0b11c`, ledger `2026-07-05T19:16:00Z`–`20:15:00Z`: before the fix, a DB/file lookup failure
in `Store.ActiveRunForRepo`, `Files.ReadSnapshot` (called from `Start`/`iterate`), and
`Files.ReadLock` was **not distinguished** from "no active run" / "clean memory" / "no lock" —
an error was silently treated as absence, which could have let two runs race the same repo or
armed over memory the engine couldn't actually read. The fix
(`cli-os/internal/engine/engine.go:70-79, 84-91, 102-109`) makes each return a hard error
instead of falling through, with the reasoning left in-line:

> "A lookup failure must not be treated as 'no active run' — that would let two runs race the
> same repo — so it fails closed as a plain error rather than falling through to arm."
>
> "A snapshot read failure (e.g. a corrupt heartbeat.json/state.json) must stop here — treating
> it as 'absent' would silently clobber whatever the human needs to see, instead of failing
> closed as designed."

Companion fail-closed defaults, verified directly in the same repo:
- `CapabilitiesFor` returns `{}` for an unknown model (`registry.go:170-176`), so
  `promptCacheable` defaults to `false` (`anthropic.go:274-279`) — unit-tested by
  `TestAnthropicUnknownModelGetsNoCacheMarkers`.
- PEP's `Reserve` **denies** on any DB/transaction error rather than granting spend
  (`policy/pep.go:57-90`; comment: "fail CLOSED: a DB read failure must not proceed on unknown
  spend" / "A transaction/DB error denies... rather than silently proceeding").
- An approval that **times out is a deny**, not a silent allow (`engine/exec.go:114-153`,
  `BoundaryDestructive` on timer fire) — verified end-to-end by
  `TestRunDenylistWriteBlocksOnDeny`.
- A tool command's exit code that can't be parsed is recorded as `-1` (failure), never a false
  success (`engine/helpers.go:61-75`, `parseExitCode`).

```
cd cli-os
go test ./internal/gateway/adapters/... -run TestAnthropicUnknownModelGetsNoCacheMarkers -v
go test ./internal/engine/... -run 'TestReadSnapshotMalformedJSONSurfaced|TestActiveRunForRepo' -v
go test ./internal/engine/... -run TestRunDenylistWriteBlocksOnDeny -v
```

**Failure modes:** writing `if err != nil { return zeroValue }` as a reflex without asking
whether `zeroValue` reads as ALLOW to the caller; testing only the legitimate not-found case and
never actually injecting the error path (a mock that never fails can't expose a wrong
fallback); fixing the lookup but not every caller — the round-1 fix touched three separate call
sites because each caller had a different "what does absence mean here" answer.

---

## Recipe 6 — Security gate analysis

**When to use:** whenever you're building or reviewing any allowlist, denylist, or
path-containment gate.

**The three PR #24 bypass patterns, generalized** (l00prite repo, round 2, commit `ff24aac`,
ledger `2026-07-05T19:16:00Z`–`20:15:00Z`, "three genuine security-critical gate bypasses
closed"):

**(a) Prefix-match without suffix validation.** An allowlist entry that matches as a string
prefix is only safe if you also constrain what comes *after* the match. Before the fix, an
allowlisted `"go test ./..."` let `"go test ./... ; rm -rf /"` run silently — it too started
with the allowlisted string. Fixed in `cli-os/internal/engine/tools.go:585-604`: a `shellChainChars`
regex (`` [;&|`$<>\n] ``) rejects a prefix match if the extension carries a shell-chaining
metacharacter; an **exact** match against the allowlist string is always honored regardless
(a human already approved that literal compound command at pre-flight). Checklist question:
*does your prefix match allow any continuation, or only a constrained one?*

**(b) A gate's own configuration must be inside the gate (self-reference).** The file/table
defining what's protected must itself be protected at least as strongly, or a run can loosen
its own guardrail and exploit that on its very next turn. Before the fix,
`.l00prite/constraints.md` — which carries the Autonomous-Edit Denylist — was neither hard-denied
nor matched by its own denylist globs. Fixed in `cli-os/internal/engine/tools.go:266-280`:
`protocolProtected` now hard-denies `constraints.md` unconditionally, alongside
`heartbeat.json`/`state.json`/`lock.json`/`prompts/` — never gate-then-approvable, so no
approval can loosen it mid-run. Checklist question: *can the mechanism that decides what's
protected edit itself?*

**(c) Every filesystem path needs the SAME containment check (symlinks).** If one tool resolves
paths through a containment-checking helper (symlinks included) and another opens paths
directly, the second is a bypass even though it "looks" repo-scoped. Before the fix,
`search_files` read files via `os.ReadFile` directly (which follows symlinks like a normal
`open()`) instead of the `resolvePath` containment logic used by `read_file`/`write_file`/
`list_dir`, so a symlink inside the repo pointing outside it could leak host files. Fixed in
`cli-os/internal/engine/tools.go:474-481` (skip any `fs.ModeSymlink` entry during the
`WalkDir`), alongside the pre-existing `resolvePath` (`tools.go:218-259`, which resolves the
deepest existing ancestor through `EvalSymlinks` and requires it stay under the resolved repo
root). Checklist question: *does every code path that touches a filesystem path run through the
same resolver, or does a "convenience" path (search/list/glob) quietly skip it?*

```
cd cli-os
go test ./internal/engine/... -run 'TestCommandAllowlistRejectsShellChaining|TestConstraintsMdIsProtocolProtected|TestSearchFilesSkipsSymlinkedFiles' -v
```

**Failure modes:** reviewing gate logic without asking what happens to the gate's *own*
definition file; testing prefix-matching only with well-behaved inputs (an adversarial
reviewer supplies the metacharacters); assuming "we already have a path resolver, so we're
covered" without grepping for every *other* place a path reaches the filesystem.

---

## Recipe 7 — Wall-clock-first budget reasoning

**When to use:** whenever you're tempted to gate a stop/budget decision on how much
work/tokens/cost has been spent so far, as **self-reported by the same agent** whose spend
you're trying to bound.

**Steps:**
1. Ask: can this number be wrong, estimated, or simply unknown to the reporting agent, while
   the agent still confidently reports *something*? Self-reported token counts almost always
   answer yes — an agent cannot observe its own true token usage.
2. Prefer an axis a plain file or clock can check honestly: wall-clock elapsed time, an
   iteration count against a hard cap, a real provider-side billing ledger (not a self-report)
   — anything a third party (a file, a clock, a billing API) can verify without trusting the
   agent's own arithmetic.
3. If you must show a token/cost figure at all, label it an **estimate** explicitly in the
   schema/output, and never let it be the enforcement input for a stop.
4. Wire actual enforcement to bounded, externally-checkable things: an iteration cap today,
   plus (when built) a wall-clock `time_budget_seconds` measured from a recorded `started_at`.

**Worked example** (l00prite repo, `HANDOFF.md`'s "No budget-by-token fiction" reframe,
2026-07-04 loop-maturity pass): "An agent cannot honestly measure its own token usage, so no
stop is built on self-reported spend. A future budget boundary will be **wall-clock-first**
(timestamps are file-checkable); it is deferred to the gated batch." The same principle is why
today's only implemented resource guard is iteration-count-based (`max_iterations`, already an
enforced run boundary) rather than token-based, and why the v1.2-gated `todos.md` item for a
formal `budget_exceeded` boundary specifies: "`time_budget_seconds` + `started_at` — the only
cost axis a file can honestly check; any token figure is labelled an estimate, never an
enforcement input." `docs/anti-patterns.md` §11, "Budgeting by self-reported tokens," states the
same rule as a named anti-pattern with the identical wall-clock-first remedy.

**Failure modes:** building a token-counting stop because a counter is easy to add, then
trusting that counter as ground truth; conflating "the provider's own billed usage" (real, but
not yet wired to a run boundary here) with "the agent's self-report of what it thinks it used"
(fiction) — they are not the same signal even though both get called "tokens."

---

## Provenance and maintenance

All facts below are dated **2026-07-06** and were re-verified while authoring this skill.
Counts, PASS totals, and commit references are volatile — re-run before trusting the stated
number. Commands assume a clone of the l00prite protocol repo, run from its root (`cd cli-os`
where noted); they re-verify the case studies above, not your own project.

| Fact stated above | Re-verification command |
|---|---|
| Validator: 519 PASS, 0 FAIL, exit 0 | `node scripts/validate-l00prite.js; echo exit=$?` |
| Doctor: 25 ok / 0 warn / 0 fail, exit 0 | `node scripts/l00prite-doctor.js .; echo exit=$?` |
| `go test ./...` passes across all `cli-os` packages | `cd cli-os && go test ./...` |
| Byte-identity test passes | `cd cli-os && go test ./internal/gateway/adapters/... -run TestAnthropicStablePrefixIdenticalAcrossDigests -v` |
| Fail-closed unknown-model test passes | `cd cli-os && go test ./internal/gateway/adapters/... -run TestAnthropicUnknownModelGetsNoCacheMarkers -v` |
| Security-gate regression tests pass | `cd cli-os && go test ./internal/engine/... -run 'TestCommandAllowlistRejectsShellChaining\|TestConstraintsMdIsProtocolProtected\|TestSearchFilesSkipsSymlinkedFiles' -v` |
| Approval-timeout fail-closed test passes | `cd cli-os && go test ./internal/engine/... -run TestRunDenylistWriteBlocksOnDeny -v` |
| `ReadSnapshot`/`ActiveRunForRepo` fail-closed tests pass | `cd cli-os && go test ./internal/engine/... -run 'TestReadSnapshotMalformedJSONSurfaced\|TestActiveRunForRepo' -v` |
| PR #24 round-1/round-2 commits exist as `ce0b11c` / `ff24aac` | `git show -s --format='%H %s' ce0b11c ff24aac` |
| The five 2026-07-02 rejected design shapes are recorded do-not-retry | `grep -n "2026-07-02 adversarial design review" -A 20 .l00prite/failures.md` |
| Wall-clock-first budget wording appears in HANDOFF/todos/anti-patterns | `grep -rn "wall-clock-first" HANDOFF.md .l00prite/todos.md docs/anti-patterns.md` |

Distribution note: this skill is currently distributed by manually copying this directory into
a target project's `.claude/skills/` — wiring it into what `build-loop` scaffolds would mean
editing a review-gated file, which is out of scope until the maintainer authorizes that change.
