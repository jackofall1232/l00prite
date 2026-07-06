---
name: l00prite-diagnostics-and-tooling
description: >
  Scope: dual — Part A covers any l00prite-managed project (interpreting
  scripts/l00prite-doctor.js output on YOUR project's .l00prite/, reading the cli-os gateway's
  dry-run route plan / route explain / ledger / dashboard-summary, and the run engine's event
  feed, approval inbox, and dual-persistence divergence checks); Part B covers l00prite repo
  development (interpreting node scripts/validate-l00prite.js output — including the
  PASS-goes-to-stdout/FAIL-goes-to-stderr trap — the byte-parity cmp/md5 toolkit, and git
  archaeology commands for proving or debunking a doc/history claim). Load this whenever you
  are about to eyeball a result instead of running the command that proves it: "is the
  validator actually green", "why did grep FAIL show nothing", "is my project's .l00prite/
  healthy", "did this prompt drift from canonical", "prove this PR/commit really shipped what
  it claims", "what does this route/cost/run actually look like right now". Ships four tested
  scripts under scripts/: check-parity.sh, verify-all.sh, sync-prompt-mirrors.sh (repo-dev) and
  run-doctor.sh (portable, with a vendored doctor snapshot).
---

# l00prite-diagnostics-and-tooling

## What this skill is for

MEASURE, don't eyeball. Every claim this protocol cares about — "the validator is green", "this
project's memory is healthy", "this prompt didn't drift", "this PR really shipped what its title
says" — has a command that proves it, and every one of those commands has at least one sharp
edge (a stream that silently swallows failures, a heading whose exact text gates a check, a
squash-merge that changes a commit hash but not its content). This skill is the interpretation
guide for those commands, plus four scripts under `scripts/` (in this skill's own directory) that
package the most-repeated ones so you run them instead of re-deriving them by hand each time.

Part A applies in any project that has adopted l00prite (a `.l00prite/` folder and/or the
`l00prite` cli-os binary) — it never assumes you are sitting in the l00prite protocol repo
itself. Part B applies only when developing the l00prite repo (this repo) — the validator, the
byte-parity mirrors, and git archaeology against this repo's own history only make sense there.

## When NOT to use this

| If you need... | Use instead |
|---|---|
| Root-cause triage starting from a symptom (not just "what does this tool's output mean") | `l00prite-debugging-playbook` |
| What counts as evidence, the golden/certified inventory, negative-testing discipline | `l00prite-validation-and-qa` |
| The full CLI/API walkthrough — mint tokens, register/clone repos, drive a run end-to-end | `l00prite-run-and-operate` |
| A function-level map of the Go gateway/engine internals (not just its diagnostic surface) | `l00prite-cli-os-internals` |
| The byte-parity EDIT procedure and its rationale/history for the two review-gated files | `l00prite-change-control` |
| The incident chronicle itself (symptom → root cause → evidence → status, narrated) | `l00prite-failure-archaeology` |
| The config-field / env-var / provider-manifest catalog | `l00prite-config-and-flags` |
| Fresh clone → all-green build/test setup from zero | `l00prite-build-and-env` |

---

# Part A — in any l00prite-managed project

## A1. The doctor (`scripts/l00prite-doctor.js`)

The doctor is a read-only, dependency-free Node script that checks **your project's**
`.l00prite/` memory folder for internal consistency. It never writes anything and never "fixes"
anything.

```
node scripts/l00prite-doctor.js [path-to-project]      # default: current directory
```

If your project didn't scaffold its own copy of the doctor, use this skill's wrapper instead —
see [A1b](#a1b-the-run-doctorsh-wrapper-portable) below.

**Exit code rule: `warn` does NOT affect the exit code.** Only a `fail`-level finding makes the
process exit non-zero. Verified in this session against this repo's own `.l00prite/` (25 ok, 0
warn, 0 fail, exit 0) and against `examples/vendor-neutral-output/.l00prite/` (24 ok — one fewer,
because that example ships without `.claude/`/`.codex/` prompt mirrors by design, so the
self-parity check reports "skipped" instead of comparing anything):

```
$ node scripts/l00prite-doctor.js .
...
25 ok · 0 warn · 0 fail
HEALTHY — .l00prite/ memory is consistent and Execution Mode ships disarmed.
$ echo $?
0
```

The check list, in the order the script runs them (read `scripts/l00prite-doctor.js` — the
numbered comment blocks match this list):

| # | Check | Level | What it catches |
|---|---|---|---|
| 0 | `.l00prite/` exists at all | hard exit 2 | not a l00prite project / wrong path |
| 1 | Required memory files present + non-empty | fail | missing/blanked `blueprint.md`, `ledger.md`, etc. |
| 2 | Unfilled `{{...}}` / `replace-with-` placeholders in blueprint/memory | warn | scaffold never customized |
| 3 | `heartbeat.json`/`state.json`/`lock.json`/pending events parse as JSON | fail | corrupt JSON |
| 4 | Execution block present; arming (`enabled`/`execution_active`) matches a live, unexpired execute-loop lock | fail/warn/ok | crash wreckage vs legitimate mid-run arming |
| 5 | `lock.json` field completeness, parseable dates, active/expired/foreign-lock state | warn/fail | unparseable dates are a **fail by design** — see below |
| 6 | `state.pending_event_count` vs actual files in `events/pending/` | warn | State Rot |
| 7 | Ledger run entries carry real verification evidence, not just prose | warn | "Verifier Theater" (S2 in `docs/failure-modes.md`) — **see the heading gotcha below** |
| 8 | `failures.md` seeded catalog + `constraints.md` Autonomous-Edit Denylist present with critical globs | warn | a project missing inherited loop wisdom |
| 9 | `iterations_since_progress` vs `no_progress_threshold` | warn/fail | thrash / no-progress stall |
| 10 | Prompt mirrors (`.claude/prompts`, `.codex/prompts`) byte-identical to `.l00prite/prompts` | fail | drifted vendor copies |

**The gotcha this session verified by injecting and then removing it**: check #7 only inspects
ledger text that comes *after a literal `## Runs` heading*. Reproduced live:

```
# baseline: HEALTHY, 24 ok, 0 warn
# append an evidence-free "## Runs" section with a real run entry underneath →
24 ok · 1 warn · 0 fail
WARN  ledger.md has run entries but no visible verification evidence (command/exit_code/tests)

# now just rename that SAME heading to "## Run History (renamed)", content unchanged →
24 ok · 0 warn · 0 fail
HEALTHY — .l00prite/ memory is consistent and Execution Mode ships disarmed.
```

Nothing about the evidence changed — only the heading text did, and the check went from
catching it to silently skipping it. **HEALTHY does not mean every ledger entry carries
evidence; it means the entries under a heading spelled exactly `## Runs` do (or there is no such
heading at all, in which case the check contributes nothing either way).** Do not read a
green doctor run as a substitute for actually reading `ledger.md`.

What HEALTHY does **not** cover, stated plainly: narrative-field drift (the prose in
`memory.md`/`ledger.md` can be stale or wrong and no JSON check catches it), whether a lock is
*correctly* held by the process that claims it (only whether its shape/expiry is sane), and
anything about cli-os itself (the doctor only reads files, never calls the gateway).

### A1b. The `run-doctor.sh` wrapper (portable)

`scripts/run-doctor.sh` (in this skill's own `scripts/` folder) finds a copy of
`l00prite-doctor.js` and runs it against a target directory, in this order:

1. `$L00PRITE_DOCTOR_PATH` if set (explicit override).
2. `<target>/scripts/l00prite-doctor.js` — if the project vendored its own copy.
3. `l00prite-doctor.js` bundled next to this wrapper (`scripts/l00prite-doctor.js` inside this
   skill) — a **vendored snapshot dated 2026-07-06** (md5 `2e9bb058a6e46c466a21487334abbf44` at
   that time), so the wrapper still works the moment this skill directory is copied somewhere
   with no path back to the l00prite repo. It is a snapshot, not a live sync — periodically
   replace it with a fresh copy of `scripts/l00prite-doctor.js` from a current l00prite checkout.

```
bash scripts/run-doctor.sh [path-to-project]     # default: current directory
```

Verified all three resolution paths plus the two error paths in this session:

```
$ bash scripts/run-doctor.sh /home/user/l00prite
running: node ".../scripts/l00prite-doctor.js" ...   (doctor source: project's own vendored copy)
... 25 ok · 0 warn · 0 fail ... exit 0

$ bash scripts/run-doctor.sh /path/with/no/vendored/doctor   # only .l00prite/, no scripts/
running: ... (doctor source: bundled snapshot (dated 2026-07-06 ...))
... 24 ok · 0 warn · 0 fail ... exit 0

$ bash scripts/run-doctor.sh /path/with/no/dot-l00prite-at-all
l00prite-doctor: no .l00prite/ folder found at ...
exit 2

$ L00PRITE_DOCTOR_PATH=/some/other/copy.js bash scripts/run-doctor.sh .
running: ... (doctor source: explicit override ($L00PRITE_DOCTOR_PATH)) ...
```

## A2. Gateway diagnostics (the cli-os binary)

All of the following were run for real against a locally built binary in a sandboxed
`LOOPRITE_HOME` with one internal `mock` adapter provider (no real keys, no egress) — not
inferred from source alone.

**Dry-run route plan** — see the routing decision with no upstream call and no spend, via the
`x-l00prite-dry-run` header:

```
$ curl -s -X POST http://127.0.0.1:PORT/v1/chat/completions \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -H "x-l00prite-dry-run: true" \
    -d '{"model":"mocktest/some-model","messages":[{"role":"user","content":"hi"}]}'
{
  "object": "l00prite.route_plan", "request_id": "req_...",
  "would_route": {"provider": "mocktest", "model": "some-model"},
  "decision": {"rule_id": "explicit_pin", "reason": "model pin mocktest/some-model",
               "chosen": "mocktest/some-model", "alternatives": []},
  "bridge": {"armed": false, "max_hops": 3}
}
```

Dry-run requests are **not** written to the ledger (verified: `l00prite ledger` and
`l00prite route explain <that request_id>` both come back empty for a dry-run request ID, while
a real request's ID shows up in both immediately).

**Same thing from the CLI**, no server needed (`l00prite route plan <model|auto|auto:profile>`
reads local config + DB directly):

```
$ l00prite route plan mocktest/some-model
Would route -> mocktest/some-model   (rule: explicit_pin)
  reason: model pin mocktest/some-model

$ l00prite route plan auto
No route: [400] Auto routing found no routable models. Enable a provider that publishes a
known model catalog (e.g. anthropic, zhipu), then retry.
```

That second result is a real, reproducible trap, not a hypothetical: `auto:` routing needs a
provider whose **manifest** publishes a model catalog. A `mock`-adapter-only setup (or any
provider with zero enabled models) makes every `auto`/`auto:<profile>` request 400 even though
`route profiles` still happily lists all seven built-in profiles — the profiles existing doesn't
mean anything is routable through them yet.

```
$ l00prite route profiles
Auto profiles (model "auto:<name>" or header x-l00prite-route: auto:<name>):
  auto:balanced   preference=balanced   (default for bare "auto")
  auto:plan       preference=quality
  auto:review     preference=quality
  auto:summarize  preference=cost
  auto:code       preference=balanced  require=tools
  auto:cheap      preference=cost
  auto:quality    preference=quality
```

**Explain a past request** — `l00prite route explain <request_id>` reads the ledger row(s) for
that request:

```
$ l00prite route explain req_a4444e15969d24580b
request req_a4444e15969d24580b @ 2026-07-06T18:55:42.144Z
  route   mocktest/some-model  (rule: explicit_pin)
  reason  model pin mocktest/some-model
  tokens  in=8 out=46 cache_read=0
  cost    $0.000000 (estimated/unconfirmed price)
  memory  empty   outcome ok
```

**Provider circuit-breaker + version visibility** — unauthenticated `GET /healthz`:

```
$ curl -s http://127.0.0.1:PORT/healthz
{"auto_profiles":[...],"bridge":{"enabled":false,"max_hops":3},
 "providers":[{"name":"mocktest","enabled":true,"default":true,
               "circuit_open":false,"has_key":true}],
 "status":"ok","version":"1.0.0"}
```

`circuit_open: true` on a provider means its breaker has tripped (repeated upstream failures) —
requests routed to it will be rejected until it resets; check this before assuming a routing
failure is a config problem rather than a tripped breaker. (`version` is a hardcoded
default in `gateway.Version` — do not read it as a real semver signal; see
`l00prite-docs-and-claims`' stale-facts inventory.)

**Cost / ledger inspection**, three ways (cheapest first):

1. `l00prite ledger [--limit N]` — CLI, most recent entries, no auth needed locally.
2. `GET /v1/dashboard/summary` (authenticated) — richer JSON: `activity` (recent ledger rows),
   `audit` (token/provider/repo actions), provider health aggregates. Verified real shape in this
   session (fields: `activity[].{request_id,provider,model,cost_usd,cost_unconfirmed,outcome,ts}`,
   `audit[].{action,actor,detail,ts}`, `generated_at`, `object: "l00prite.dashboard_summary"`).
3. Direct SQLite read of the `ledger` table (`state.go`'s schema — columns include `ts`,
   `request_id`, `provider`, `model`, `rule_id`, `decision`, `prompt_tokens`,
   `completion_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost_usd`, `cost_estimated`,
   `cost_unconfirmed`, `memory_status`, `outcome`), at the DB path from `config.json`
   (`DBPath`, default `~/cli-os.db`). If the `sqlite3` CLI isn't installed (it was not in this
   session's environment — verified with `which sqlite3` failing), Python's stdlib `sqlite3`
   module works identically and was the actually-tested path here:
   ```
   python3 -c "
   import sqlite3
   con = sqlite3.connect('/path/to/cli-os.db')
   for row in con.execute('SELECT ts, provider, model, cost_usd, outcome FROM ledger ORDER BY ts DESC LIMIT 10'):
       print(row)
   "
   ```

Tip for a throwaway diagnostic instance instead of touching your real config: `l00prite` reads
`LOOPRITE_HOME` (verified in `internal/config/config.go`) for its data directory, so
`LOOPRITE_HOME=$(mktemp -d) l00prite init` gives you a fully isolated sandbox to run any of the
above against, with no risk to a real deployment.

## A3. Engine (run) diagnostics

The run engine has 8 statuses (`internal/engine/types.go`): `draft`, `ready`, `blocked`,
`running`, `waiting_approval`, `done`, `stopped`, `interrupted`.

- **Run + pending-approval inbox**: `GET /v1/runs/get?id=<run_id>` (authenticated, must own the
  run) returns `{"run": {...}, "preflight": {...}, "pending_approvals": [...]}` — verified
  against `internal/gateway/runs.go`'s `HandleRunGet`. `pending_approvals` is exactly the
  approval inbox; there is no separate "list approvals" endpoint.
- **Event feed**: `GET /v1/runs/events?id=<run_id>&after=<seq>` returns
  `{"run": {...}, "events": [...], "cursor": <seq>}` (`HandleRunEvents`) — poll with the returned
  `cursor` as the next `after` value; this is the same generation-counter-style cursor pattern
  used elsewhere in the dashboard, not naive re-polling from zero.
- **Dual persistence, and how to detect divergence**: the engine writes run state to the gateway's
  SQLite (`runs`, `run_events`, `run_approvals` tables — `internal/state/db.go`) **and**, for
  the *target repo* being worked on, to that repo's own `.l00prite/{heartbeat.json,state.json,
  ledger.md,...}` (`internal/engine/l00pfiles.go`). Divergence looks like: SQLite's `runs.status`
  says `running`/`waiting_approval` for a run whose target-repo `.l00prite/state.json` shows
  `execution_active: false` (or vice versa) — that combination means a crash, not a healthy
  mid-run state. At boot, `Store.ReconcileOrphans()` (`internal/engine/store.go`) flips any run
  still `running`/`waiting_approval` from a previous process to `interrupted` — if you see a run
  stuck in `running` with no live process, that reconciliation either hasn't run yet or something
  bypassed it; don't hand-edit the row, restart the binary so `ReconcileOrphans` runs, then
  inspect `.l00prite/state.json` on the target repo to confirm both sides agree.

For the full create → preflight → start → approve/deny → stop lifecycle over curl, see
`l00prite-run-and-operate` — this section is diagnostics (reading state), not operation.

## A4. Interpretation discipline: evidence, ready to paste

`templates/l00prite/ledger.md`'s own entry template defines the evidence bar per check: a
**`command`**, an **`exit_code`**, a **`summary`**, an optional **`evidence_path`**, and a
**`timestamp`**. "Tests passed" alone is non-compliant with this repo's own template. A
paste-ready single-check block:

```
- command: node scripts/l00prite-doctor.js .
  exit_code: 0
  summary: "25 ok, 0 warn, 0 fail — HEALTHY"
  evidence_path: none
  timestamp: 2026-07-06T20:00:00Z
```

For the full evidence standard (what counts, the Verifier Theater failure mode by name, and the
golden/certified inventory), see `l00prite-validation-and-qa` Part A — this skill only gives you
the mechanics to produce the evidence, not the policy for what's acceptable.

---

# Part B — in the l00prite repo

## B1. The validator (`scripts/validate-l00prite.js`)

```
node scripts/validate-l00prite.js
```

Verified in this session: **519 PASS, 0 FAIL, exit 0** (as of 2026-07-06, tip `d4c6518`, branch
`claude/beautiful-gauss-bxlzbs`). The count is expected to grow as checks are added — 0 FAIL is
the actual contract, not any specific PASS number. The validator always validates the repo it
lives in (`path.resolve(__dirname, '..')`); it takes no arguments and cannot be pointed at
another directory.

**The stderr trap, proven, not just asserted.** `check()` in the validator does
`console.log('PASS ...')` on success and `console.error('FAIL ...')` on failure — i.e. **PASS
goes to stdout, FAIL goes to stderr.** A shell pipe (`| grep ...`) only reads stdout; stderr
still prints to your terminal directly, which is exactly what makes this trap sneaky — a human
watching the terminal live sees the FAIL line and assumes it was caught. Proven by capturing
what the pipe actually delivers, not just what appears on screen:

```
$ out=$(node -e "console.log('PASS x'); console.error('FAIL x');" | grep FAIL)
FAIL x                          # <- this printed because stderr leaks straight to the terminal
$ echo "grep's captured stdout: [$out]"
grep's captured stdout: []      # <- but grep itself matched NOTHING

$ out2=$(node -e "console.log('PASS x'); console.error('FAIL x');" 2>&1 | grep FAIL)
$ echo "grep's captured stdout: [$out2]"
grep's captured stdout: [FAIL x]   # <- 2>&1 first: now grep actually sees it
```

**Canonical safe invocation**: always merge streams before filtering or capturing —
`node scripts/validate-l00prite.js 2>&1 | grep -i fail` (or capture the whole thing:
`node scripts/validate-l00prite.js > out.txt 2>&1; echo exit=$?`). Any script, CI step, or
ledger-evidence capture that does `| grep FAIL` without `2>&1` first will silently report a
clean bill even when the validator is failing — this is the exact shape of the "empty findings
from a dead/misconfigured check ≠ a clean bill" trap (see `l00prite-debugging-playbook`).

**Check categories** (read `scripts/validate-l00prite.js` — it is organized in exactly this
order, with comment-block dividers):

1. Flat existence checks for required files, memory-template files, their `examples/` mirror,
   and this repo's own dogfood copies (existence only, no content).
2. **Byte-parity**: the six loop prompts (`resume-loop`, `heartbeat`, `event-loop`,
   `respond-to-review`, `handoff-summary`, `execute-loop`) compared canonical-vs-mirror across
   the same 6 mirror directories this skill's `check-parity.sh` uses (§B2); `prompts/README.md`
   and `LOCKING.md` byte-checked the same way into the 2 live-memory copies.
3. README content assertions (mentions Claude/Codex/vendors/lock model/both operating modes/
   byte-identical mirrors).
4. `build-loop.md` invariants, both the Claude and Codex variant: "does not execute", ships
   `execution.enabled: false`, documents `--execute`, states it "never pre-arms".
5. `execute-loop.md` invariants (whitespace-normalized so hard-wraps don't break a phrase match):
   pre-flight gate, "persisted flags never satisfy the gate", all nine run-boundary IDs present,
   lock-check-first, "never raise" (self-modification guard), "not a blanket grant",
   untrusted-content warning, one-unit-per-iteration, resumable exits.
6. `CLAUDE.md.template` / `AGENTS.md.template` content assertions (protocol section, lock.json,
   canonical prompt pointer, untrusted-content rule, exactly the two template placeholders).
7. The `examples/vendor-neutral-output` generated files carry no leftover `{{...}}` placeholders
   or `<!--` maintainer comments.
8. `vendors.json` schema validity + per-vendor adapter checks: adapter file exists, contains
   every `required_strings` entry, stays under 5,500 characters, and its dogfood + example
   copies are byte-identical to the template — **plus** every file under `templates/adapters/`
   must be referenced by *exactly one* vendor entry (catches orphaned or duplicated adapters).
9. Event/review/lock-aware prompt content checks across all their copies: the
   Classify/Plan/Execute/Verify/Persist/Respond stages, "one event per loop", "do not blindly
   agree", "do not push or merge" without instruction, `lock.json` mentioned before mutation.
10. Protocol-doc assertions: `templates/l00prite/README.md` (blocked-state-wins precedence,
    both modes documented), `LOCKING.md` ("protocol files" phrase), `ledger.md` template
    (every evidence field from §A4 present).
11. JSON schema validity + `schema_version` presence for `heartbeat.json`, `state.json`,
    `lock.json`, `example-event.json`; template/example copies must ship **disarmed**
    unconditionally, while this repo's own live `.l00prite/heartbeat.json`/`state.json` may
    legitimately be armed **only** with a matching active, unexpired `execute-loop` lock —
    otherwise it's treated as crash wreckage left committed by mistake.
12. Field-completeness checks for `state.json`, `example-event.json` (plus its
    `event-YYYYMMDD-HHMMSS-...` ID format regex), and `lock.json`.

**Negative checks worth knowing** (things the validator affirmatively forbids, not just
requires): the banned ambiguous phrase `"move or copy"` in event/review prompts and the events
README (events must be *moved*, not copied, between `pending/`/`processing/`/`completed/` — a
copy would crash-duplicate state); no leftover template placeholders in generated example files;
exactly-one-referencing-vendor-entry per adapter file.

## B2. Byte-parity toolkit

**One-liner `cmp` loop** for a single prompt across every location that carries it:

```
for f in templates/l00prite/prompts/execute-loop.md \
         .claude/prompts/execute-loop.md .codex/prompts/execute-loop.md \
         templates/claude/prompts/execute-loop.md templates/codex/prompts/execute-loop.md \
         .l00prite/prompts/execute-loop.md \
         examples/vendor-neutral-output/.l00prite/prompts/execute-loop.md; do
  md5sum "$f"
done
```

Or just run `scripts/check-parity.sh` (§B4) — it does this for all six prompts plus
`prompts/README.md`/`LOCKING.md` in one pass and reports drift with exact `diff` commands.

**Files beyond the six prompts that are also parity-checked**: `templates/l00prite/prompts/
README.md` (into `.l00prite/prompts/README.md` and the example copy) and
`templates/l00prite/LOCKING.md` (into `.l00prite/LOCKING.md` and the example copy) — verified by
reading the validator's own byte-parity block (its second and third loops, right after the
six-prompt loop).

## B3. Git archaeology toolkit

**Fetch PR head refs** (read-only; lets you inspect PRs whose commits never made it into local
branch history, including ones GitHub later closed unmerged):

```
git fetch origin 'refs/pull/*/head:refs/pr/*'
```

**Churn hotspot** — files touched by the most commits:

```
git log --oneline --name-only | grep -v '^$' | grep -v '^[a-f0-9]\{7\} ' \
  | sort | uniq -c | sort -rn | head -15
```
(Verified output as of 2026-07-06 topped by `README.md` (13), `CLAUDE.md` (9), `.l00prite/
ledger.md` (8) — treat the exact numbers as volatile; re-run rather than trust this line.)

**Worked example: proving a doc claim against history**, end to end, exactly as run in this
session. The claim (from this repo's own memory) is that commit `87384b4` — titled "Add
execution mode to l00prite with safety features" — actually shipped **prose only**, no code:

```
$ git show --stat 87384b4
 CLAUDE.md | 116 ++++++++++++++++++++++++++++++++++++++++----------------------
 1 file changed, 75 insertions(+), 41 deletions(-)
```
One file, `CLAUDE.md`. Claim confirmed directly from the commit's own stat — no code file is
touched. This is the general method: never trust a commit *title*; run `git show --stat <sha>`
(or `git show <sha>` for the full diff) and read what actually changed.

**Worked example: finding a "ghost PR"** (a PR number that never appears as its own merge on
`main`, because its content landed under a different PR number — e.g. via a rebase or a
re-opened PR). Two different techniques, matched to two different real cases found in this
session:

1. **Identical commit** — the simple case. `refs/pr/12` and `refs/pr/13` are, byte for byte, the
   *same commit*:
   ```
   $ git rev-parse refs/pr/12 refs/pr/13
   91b2c59d10d1f735159495942cc22fe997067fb8
   91b2c59d10d1f735159495942cc22fe997067fb8
   ```
2. **Identical tree, different commit hash** — the squash-merge case, which `rev-parse` alone
   will NOT catch (a squash creates a new commit hash even when nothing in the tree changed):
   ```
   $ git diff --stat refs/pr/4 refs/pr/5     # no output = identical tree
   $ git rev-parse refs/pr/5^{tree}
   4c5c35a754e56ca6777b20152adb19ce0f7ebb66
   $ git log origin/main --format='%H %T %s' \
       | awk -v t=4c5c35a754e56ca6777b20152adb19ce0f7ebb66 '$2==t {print}'
   e0f47367c6ce935afa13768424d2ea547a28406e 4c5c35a754e56ca6777b20152adb19ce0f7ebb66 Add codex (#5)
   ```
   This chains three facts into one proof: PR #4's tree == PR #5's tree == the tree of the real
   commit that landed on `main` (titled "Add codex (#5)"). PR #4's content is what's actually on
   `main` today, filed under PR #5's number. (`refs/pr/3`'s tree does **not** match — it's an
   earlier, smaller ancestor state, not the same content; don't over-claim equivalence you
   haven't actually diffed.) The full narrative for every ghost-PR case in this repo's history
   lives in `l00prite-failure-archaeology` — this section is the *method*, not the catalog.

## B4. Shipped scripts (this skill's `scripts/` directory)

| Script | Scope | Mutates the repo? | Purpose |
|---|---|---|---|
| `check-parity.sh` | repo-dev | No (read-only) | cmp every canonical prompt + README/LOCKING against every mirror; exit 1 with a drift report |
| `verify-all.sh` | repo-dev | No (read-only) | validator + doctor + `go test ./...`, one verdict line each, `--skip-go` to omit Go |
| `sync-prompt-mirrors.sh` | repo-dev | **Only with `--apply`** | copy one canonical prompt to its six mirrors, then self-verify with `check-parity.sh` |
| `run-doctor.sh` (+ vendored `l00prite-doctor.js`) | portable | No (read-only) | wrapper described in §A1b |

All four resolve the l00prite repo root from their own file location, so they run correctly
from any working directory.

### `check-parity.sh`

Read-only. Its mirror-directory list is a **hardcoded copy** of
`scripts/validate-l00prite.js`'s `MIRROR_DIRS` array (by design — this script must never
`require()` or otherwise depend on the shape of that review-gated file; keep the two lists in
sync by hand if the validator's list ever changes). Verified real output, both clean and with
injected drift in a disposable scratch copy (never the real repo):

```
$ bash scripts/check-parity.sh
Checked 40 file(s) against their canonical source.
PARITY OK — 0 drifted

# (in a disposable scratch copy, with one byte appended to .claude/prompts/execute-loop.md)
$ bash scripts/check-parity.sh
Checked 40 file(s) against their canonical source.

PARITY FAIL — 1 of 40 file(s) drifted from canonical:
  DRIFT .claude/prompts/execute-loop.md  (differs from templates/l00prite/prompts/execute-loop.md — inspect with: diff "..." "...")

Fix: edit the canonical file under templates/l00prite/prompts/ (or LOCKING.md), then
re-copy it to every mirror (see sync-prompt-mirrors.sh --apply), then re-run:
  node scripts/validate-l00prite.js 2>&1 | grep -i fail
exit 1
```

### `verify-all.sh`

Read-only (aside from whatever `go test` itself does, e.g. populate the Go build cache — never
this repo's tracked files). Verified real output:

```
$ bash scripts/verify-all.sh
== validator: node scripts/validate-l00prite.js ==
validator: PASS  (519 PASS, 0 FAIL, exit 0)

== doctor: node scripts/l00prite-doctor.js . ==
doctor: PASS  (HEALTHY — .l00prite/ memory is consistent and Execution Mode ships disarmed.)

== go test ./... (cd cli-os) ==
go test: PASS  (exit 0)

VERDICT: all checks green
$ echo $?
0
```

`--skip-go` runs validator + doctor only (verified, exits 0, prints "skipped (--skip-go)" for
the Go section) — useful with no Go toolchain on hand.

### `sync-prompt-mirrors.sh`

**Defaults to a dry run.** It only writes when passed `--apply` explicitly, because writing the
six mirror files is real repo mutation *outside* this skill's own directory — appropriate for a
human or an authorized session to run after editing the canonical prompt, never something an
agent session bound to "write only inside my own skill directory" should invoke with `--apply`
itself. Verified dry-run output for real (no files touched — confirmed with `git status`
afterward):

```
$ bash scripts/sync-prompt-mirrors.sh execute-loop
DRY RUN — no files will be written. Pass --apply to actually copy.

would copy templates/l00prite/prompts/execute-loop.md -> .claude/prompts/execute-loop.md
would copy templates/l00prite/prompts/execute-loop.md -> .codex/prompts/execute-loop.md
would copy templates/l00prite/prompts/execute-loop.md -> templates/claude/prompts/execute-loop.md
would copy templates/l00prite/prompts/execute-loop.md -> templates/codex/prompts/execute-loop.md
would copy templates/l00prite/prompts/execute-loop.md -> .l00prite/prompts/execute-loop.md
would copy templates/l00prite/prompts/execute-loop.md -> examples/vendor-neutral-output/.l00prite/prompts/execute-loop.md

(dry run only — re-run with --apply to write, which then auto-runs check-parity.sh)
```

`--apply` was tested only in a disposable scratch copy of the repo, never here: it correctly
wrote all six mirrors, then auto-ran `check-parity.sh`, which reported `PARITY OK — 0 drifted`.
Bad prompt names and bad mode flags both fail fast with `exit 2` and a usage message (verified).
This script is the mechanical half only — it never tells you *what* to change; that edit (and
whether it needs its own review) is `l00prite-change-control`'s byte-parity procedure.

---

## Provenance and maintenance

| Fact stated in this skill | As of | Re-verification command |
|---|---|---|
| Validator: 519 PASS, 0 FAIL, exit 0 | 2026-07-06 | `node scripts/validate-l00prite.js 2>&1 \| awk '/^PASS/{p++} /^FAIL/{f++} END{print p" PASS, "f+0" FAIL"}'` |
| Doctor (this repo): 25 ok, 0 warn, 0 fail, HEALTHY | 2026-07-06 | `node scripts/l00prite-doctor.js . \| tail -1` |
| Doctor (example output): 24 ok (no vendor prompt mirrors there) | 2026-07-06 | `node scripts/l00prite-doctor.js examples/vendor-neutral-output \| tail -3` |
| `go test ./...`: all pass, 144 top-level `Test` funcs | 2026-07-06 | `cd cli-os && go test ./... && grep -rh '^func Test' --include='*_test.go' . \| wc -l` |
| Repo tip `d4c6518`, branch `claude/beautiful-gauss-bxlzbs` | 2026-07-06 | `git rev-parse HEAD && git branch --show-current` |
| `sqlite3` CLI absent in this environment; `python3`'s `sqlite3` module present | 2026-07-06 | `which sqlite3; python3 -c "import sqlite3; print(sqlite3.sqlite_version)"` |
| refs/pr/12 == refs/pr/13 (same commit) | 2026-07-06 | `git fetch origin 'refs/pull/*/head:refs/pr/*' && git rev-parse refs/pr/12 refs/pr/13` |
| refs/pr/4 tree == refs/pr/5 tree == `main`'s "Add codex (#5)" commit tree | 2026-07-06 | `git diff --stat refs/pr/4 refs/pr/5` (expect no output), then `git log origin/main --format='%H %T %s' \| grep $(git rev-parse refs/pr/5^{tree})` |
| `87384b4` touched only `CLAUDE.md` (no code) | 2026-07-06 | `git show --stat 87384b4` |
| Vendored `l00prite-doctor.js` snapshot matches the live repo copy | 2026-07-06 | `cmp scripts/l00prite-doctor.js .claude/skills/l00prite-diagnostics-and-tooling/scripts/l00prite-doctor.js` |
| All four shipped scripts are executable and pass their own dry/read-only run | 2026-07-06 | `bash .claude/skills/l00prite-diagnostics-and-tooling/scripts/check-parity.sh && bash .claude/skills/l00prite-diagnostics-and-tooling/scripts/verify-all.sh` |
