---
name: l00prite-runs-view-campaign
description: >
  Scope: l00prite repo development. Load this when the task is "build the Dashboard Runs view",
  "wire the runs API into the dashboard", "add a Runs section to cli-os/public/dashboard.html",
  "write the Playwright e2e for runs", or anything referencing cli-os/docs/os-architecture.md §4,
  /v1/runs*, HandleRunCreate/HandleRunStart, or the stale todos.md "Dashboard Runs view" item.
  Delivers the executable campaign: numbered decision-gated phases, exact verified commands and
  code references, the full API contract, the UI patterns already established in dashboard.html
  to reuse (never rebuild), the Playwright checklist, and the promotion path through change
  control. This is THE plan for the hardest live problem in the repo as of 2026-07-06 — read it
  before writing a single line of dashboard.html.
---

# l00prite Runs View Campaign

**Scope: l00prite repo development.** This skill is for sessions working inside the l00prite
repo itself (`/home/user/l00prite`) on the CLI-OS Go runtime and its dashboard. It assumes you can
run `go test`, `git`, and the repo's own validator/doctor scripts. It is not for an adopter
project — an adopter never touches `cli-os/`.

## What this skill is for

The `/v1/runs*` engine API (create → pre-flight → Start → live events → approvals → stop) has
been complete and tested since PR #24 merged (2026-07-05), but `cli-os/public/dashboard.html` has
**zero** lines mentioning it (verified: `grep -c -i runs cli-os/public/dashboard.html` → `0`, as of
2026-07-06). Two prior sessions were assigned this exact unit and both died to a session usage
limit before writing UI code (`.l00prite/todos.md` Active section: "the UI writer was cut off by a
session usage limit in the 2026-07-05 pass"). This skill is the executable campaign that gets it
done this time: numbered phases, exact commands, the real API/UI contract pulled from source (not
memory), and a checkpoint discipline so a third cutoff still leaves useful, committed, verified
work instead of another empty attempt.

## When NOT to use this

| If your job is instead... | Use this sibling skill |
|---|---|
| Understanding the engine's internals in general (routing, caching, package map, gateway seam) not specific to shipping the Runs UI | `l00prite-cli-os-internals` |
| The branch/commit/PR/review procedure, the two review-gated files, or the byte-parity edit procedure | `l00prite-change-control` |
| Triaging a `go test` failure, a validator FAIL, or a doctor WARN you hit while working this campaign | `l00prite-debugging-playbook` |
| The history of PR #22 (dashboard/playground bugs) or PR #24 (engine review rounds) in full | `l00prite-failure-archaeology` |
| WHY the engine is built the way it is (pre-flight gate design, self-modification guard rationale) rather than HOW to wire the UI to it | `l00prite-architecture-contract` |
| Operating a *deployed* l00prite binary's runs (curl walkthrough, CLI, tokens) rather than building the dashboard for it | `l00prite-run-and-operate` |
| Deciding what counts as evidence for your ledger entry, or the golden-inventory numbers in general | `l00prite-validation-and-qa` |
| Writing/updating CLAUDE.md §7, ledger.md, or todos.md entries in the house style | `l00prite-docs-and-claims` |
| A general "prove it" method (worth-it analysis, adversarial review, negative testing) you want to reuse here | `l00prite-proof-and-analysis-toolkit` |

---

## 0. Campaign contract

**Success is measurable, not "looks done."** This campaign is complete only when ALL of the
following hold simultaneously:

1. A **committed** Playwright harness (a real file in the repo, not a claim) passes N named
   checks against the **real binary** (not a description of what it would check).
2. `cd cli-os && go test ./...` is green.
3. `node scripts/validate-l00prite.js` is 0 FAIL and `node scripts/l00prite-doctor.js .` is
   HEALTHY.
4. A PR is open and has been through at least one round of bot review, with findings addressed
   per `l00prite-change-control`.

Never write a ledger entry or CLAUDE.md row claiming this done from "the code looks right" or "I
believe the checks would pass." The repo has been burned by this twice already (see §7 and the
Wrong Paths list, §10, item 2).

**Opening position (verified 2026-07-06):**

| Fact | Verification |
|---|---|
| `/v1/runs*` API is complete and tested | `cli-os/internal/server/runs_api_test.go` — `TestRunsAPIAuthRequired`, `TestRunsAPICreateStartComplete`, `TestRunsAPIProjectScoped` all pass |
| UI spec exists | `cli-os/docs/os-architecture.md` §4 "Dashboard" |
| Dashboard has zero Runs UI | `grep -c -i runs cli-os/public/dashboard.html` → `0` |
| The `OS-APK` branch (where the two prior attempts worked) is gone again | `git ls-remote --heads origin` does not list `OS-APK` (checked 2026-07-06); `.l00prite/todos.md` still names it — that line is stale, see §10 item 6 |
| Two prior sessions were cut off before writing dashboard code | `.l00prite/todos.md` Active section, `.l00prite/ledger.md` PR #24 entries |

**Checkpoint discipline is REQUIRED, not optional:** commit each working increment (one commit
per phase or sub-phase, per `l00prite-change-control`'s one-commit-per-verified-change rule). If
your own session is cut off mid-phase, your LAST ACT before running out of budget must be a
`.l00prite/ledger.md` entry stating exactly which phase you reached, what is verified vs.
unverified, and that the pass did not complete — an absent or empty result from a dead session is
an artifact of the cutoff, never evidence of a clean state (this is the costliest failure class in
the repo's history; see `l00prite-debugging-playbook`'s Trap #1 for the full story).

---

## 1. Phase 0 — branch + baseline

**Branch:** follow whatever branch your session's own instructions designate — that instruction
always takes precedence over any name in this skill or in `.l00prite/todos.md` (see §10 item 6:
the `OS-APK` name in todos.md is stale). If you are restarting after a squash-merge closed the
prior branch (the `OS-APK` precedent — `.l00prite/ledger.md` run `2026-07-05T20:17:23Z`):

```bash
git fetch origin main
git checkout -B <your-branch-name> origin/main   # never force-push over a branch that still exists
```

The worked example from that ledger entry, verified against `git ls-remote --heads origin`
(2026-07-06, confirms `OS-APK` absent, matching "GitHub auto-deleted the head branch on merge"):

```bash
git checkout -B OS-APK origin/main && git push -u origin OS-APK
```

Full branch/commit procedure, including what to do if the designated branch is itself gone or
diverged, lives in `l00prite-change-control` — do not re-derive it here.

**Baseline gates — run these BEFORE writing any UI code. All four commands and their exact
observed output as of 2026-07-06:**

```bash
node scripts/validate-l00prite.js 2>&1 | tail -3
# → PASS lock.json contains status   (519 PASS total, 0 FAIL; run `| grep -c FAIL` to confirm 0
#   directly — FAIL lines go to stderr, so pipe 2>&1 or you may misread a clean run)

node scripts/l00prite-doctor.js .
# → "25 ok · 0 warn · 0 fail" / "HEALTHY — .l00prite/ memory is consistent and Execution Mode
#   ships disarmed."

cd cli-os && go test ./... -count=1
# → all packages "ok" (144 top-level test functions across the module; ~4.7s on this host)

grep -c -i runs cli-os/public/dashboard.html
# → 0   (this is your literal starting-line proof that no Runs UI exists yet)
```

**If any of these is not exactly what's shown above → STOP. You are not at a clean baseline.**
Do not proceed into Phase 1 on top of an already-broken tree — that only obscures which failures
are yours. Go to `l00prite-debugging-playbook` first (Part B for validator/doctor/go-test triage).

---

## 2. Phase 1 — contract study (read-only)

Read these files fully before writing UI code. This phase produces no diff.

**`cli-os/docs/os-architecture.md` §2–§4** (design authority) and **the actual source**, because
the doc uses a slightly different name for one helper than the real code does (see the note
below the API table) — always defer to source, never to the doc, when they disagree.

### 2.1 The API contract (verified against `cli-os/internal/server/server.go`,
`cli-os/internal/gateway/runs.go`, and `runs_api_test.go`)

| Method | Path | Body → Response | Handler | Notes |
|---|---|---|---|---|
| POST | `/v1/runs` | `{repo, goal, objective?, gates?, command_allowlist?, max_iterations?, approval_timeout_s?, no_progress_threshold?}` → `200 {run, preflight}` | `HandleRunCreate` | `goal` required (400 otherwise); `repo` resolved project-scoped via `repoRootForToken`. |
| POST | `/v1/runs/preflight` | `{id}` → `200 {run, preflight}` | `HandleRunPreflight` | `409 run_active` if the run is currently `running`/`waiting_approval` — you must stop it first. |
| POST | `/v1/runs/start` | `{id, confirm}` → `200 {run, started:true}` | `HandleRunStart` | `confirm` must be the **exact literal string** `"EXECUTE"` (`strings.TrimSpace(confirm) != "EXECUTE"` is checked, `engine.go` `StartRun`). `409 run_not_ready` if status isn't `ready` or the pre-flight is stale. |
| GET | `/v1/runs/get?id=` | → `200 {run, preflight, pending_approvals}` | `HandleRunGet` | `404 run_not_found` for a missing OR cross-project run (never leaks existence). |
| GET | `/v1/runs/list` | → `200 {runs:[...]}` | `HandleRunList` | The token's project's runs, newest first, capped at 50. |
| GET | `/v1/runs/events?id=&after=` | → `200 {run, events, cursor}` | `HandleRunEvents` | Append-only feed; poll with `after=<last cursor>`. `cursor` stays at your `after` value if no new events arrived. |
| POST | `/v1/runs/approve` | `{id, approval_id, decision: "allow"\|"deny", note?}` → `200 {decided:true, decision}` | `HandleRunApprove` | `409 already_decided` on a repeat. |
| POST | `/v1/runs/stop` | `{id}` → `200 {stopping:true}` | `HandleRunStop` | `409 run_not_active` if the run isn't currently live. |
| POST | `/v1/repos/clone` | `{id, url}` → `200 {repo:{id,root,project,cloned_from}, memory:{status,present_count,total_files}}` | `HandleRepoClone` | https/ssh only; an https URL with embedded credentials is rejected (400 `bad_url`) because it would otherwise be echoed back in `cloned_from`. |

Every route above requires the same `Authorization: Bearer l00p_<id>_<secret>` token as the rest
of the gateway (`server.go` route table, right next to `/v1/chat/completions`). `TestRunsAPIAuthRequired`
proves all the mutating/creating ones 401 without a token.

**Doc/reality note:** `os-architecture.md` §4 says the dashboard will use "`fetchJSON` + poll
refresh" — the actual helper already in `dashboard.html` is named **`api(method, path, body)`**
(line ~668), not `fetchJSON`. Use the real name; don't invent a `fetchJSON` function that doesn't
exist. This is exactly the kind of doc/reality gap the repo has been burned by before — verify
against source, always (`l00prite-debugging-playbook` Trap #2).

### 2.2 Run state machine (8 statuses, `engine/types.go`)

```
draft --preflight--> ready --Start(human)--> running <--> waiting_approval
                        \                        |
                         \--> blocked (lock)     +--> done (definition_of_done_met)
                                                  +--> stopped (any other boundary; resumable)
interrupted (crash; recovered at next pre-flight, re-enterable via a fresh pre-flight)
```
Constants: `StatusDraft`, `StatusReady`, `StatusBlocked`, `StatusRunning`, `StatusWaitingApproval`,
`StatusDone`, `StatusStopped`, `StatusInterrupted`.

### 2.3 The nine run boundaries (`RunBoundaries` / `BoundaryXxx` in `types.go`)

`definition_of_done_met`, `iteration_limit_reached`, `human_review_gate`,
`destructive_operation_required`, `ambiguous_requirements`, `unfixable_failing_tests`,
`missing_secrets_or_credentials`, `lock_lease_conflict`, `stop_signal` — verbatim from
`execute-loop.md`. `run.boundary` is set only when `run.status` is `done`/`stopped`; render it as
the headline of the Phase 4 "Exit" state.

### 2.4 Approval flow semantics (`engine/exec.go` `awaitApproval`, `engine/types.go`)

- Gate classes (display order): `push`, `merge`, `deploy`, `credential_change`, `destructive`,
  `outside_repo` (`GateClasses`).
- Policies: `require_approval` (default for every class) or `deny` — there is **no** `auto_allow`.
  A `RunConfig.Gates` map missing a class reads as `require_approval` (fail-closed).
- Approval statuses: `pending`, `allowed`, `denied`, `expired`.
- **Timeout is a deny by design**: `awaitApproval` blocks for `RunConfig.ApprovalTimeoutSec`
  (default 900s — see `store.go` `CreateRun`), and on timeout the action is denied and the run
  stops at `destructive_operation_required`. Render this in the approvals inbox UI so an operator
  who walks away for >15 minutes understands why the run stopped, rather than assuming a bug.
- `Decide()` rejects an approval id that doesn't belong to the named run (`ErrNotFound`) —
  cross-run approval spoofing is impossible by construction; the UI never needs to guard this
  itself, just surface the 400/404 the API already returns.
- Only one run may be active per repo at a time (`ActiveRunForRepo` check inside `StartRun`) — if
  Start is attempted while another run is live against the same repo, expect `409 run_not_ready`
  wrapping `ErrBadState`. The Create-wizard should disable Start (or show why) when
  `/v1/runs/list` already shows a `running`/`waiting_approval` run for the selected repo.

### 2.5 RunConfig defaults (`engine/store.go` `CreateRun`) — show these in the create form

| Field | Default | Clamp |
|---|---|---|
| `max_iterations` | 25 | 1–100 |
| `approval_timeout_s` | 900 | none (must be > 0 to override) |
| `no_progress_threshold` | 3 | none |

### 2.6 Objectives → team (`engine/roles.go` `PlanForObjective`) — for the create wizard's "team preview"

| Objective | plan | code | review | summarize | Review step | Bridge (cross-provider) |
|---|---|---|---|---|---|---|
| `balanced` (default) | plan | code | review | summarize | on | on |
| `quality` | plan | quality | review | summarize | on | on |
| `cost` | cheap | cheap | review | cheap | **off** | **off** |
| `speed` | balanced | balanced | review | cheap | **off** | **off** |
| `privacy` | privacy | privacy | privacy | privacy | off | off |

`privacy` is NOT a built-in routing profile — it requires the operator to have configured
`routing.profiles.privacy` with a providers allowlist; if absent, `PlanForObjective`/pre-flight
surfaces a blocker naming exactly that (never a silent cloud fallback). Render this blocker text
verbatim if it appears; don't paraphrase it into something that sounds less final.

### 2.7 Self-check gate

Before moving to Phase 2, answer these five without looking anything up (then verify against
source if you're unsure — these are the actual verified answers as of 2026-07-06):

1. **What must the human type into Start, verbatim?** — `"EXECUTE"`, case-sensitive, checked
   server-side; nothing pre-fills or auto-supplies it.
2. **What happens if a foreign `.l00prite` lock is active at pre-flight time?** — `BuildPreflight`
   adds a `lock_lease_conflict` blocker and the run's status becomes `blocked`; nothing else is
   written.
3. **What happens if nobody decides a pending approval within its timeout?** — it is auto-denied
   and the run stops at `destructive_operation_required`; fail-closed, never "wait forever."
4. **Can two runs execute against the same repo at once?** — no; `StartRun` refuses with
   `ErrBadState` if `ActiveRunForRepo` finds another active run for that repo.
5. **What must render, unmodified, before the Start button may even be enabled?** — the complete
   `Preflight` display just returned by the most recent `/v1/runs/preflight` (or `/v1/runs`) call,
   with zero `blockers` — a stale or blocker-carrying pre-flight must keep Start disabled.

---

## 3. Phase 2 — UI skeleton (static render, zero API calls beyond what already exists)

**Where:** add a new `<section id="sec-runs">` to `cli-os/public/dashboard.html`, following the
exact existing convention — a `<nav>` anchor `<a data-goto="sec-runs">` alongside the current six
(`sec-top`, `sec-play`, `sec-providers`, `sec-cost`, `sec-repos`, `sec-activity`, `sec-tokens`
— verified list, `grep -n 'data-goto=' dashboard.html`). The click handler already generalizes:
`document.querySelectorAll("[data-goto]").forEach(a=>a.onclick=()=>{ ... el.scrollIntoView(...) })`
(line ~1039) — a new nav item needs no new JS wiring for scroll-to-section, only its own `<a>` and
matching `id`.

**Established patterns to reuse — verified line references in `dashboard.html` as of 2026-07-06:**

1. **Scheme-aware form controls (the black-on-black incident, fenced).** `:root` defines
   `--input-bg`/`--input-bg-solid`/`--text`/`--text-3`, and a global rule block
   (`input,select,textarea{color:var(--text);caret-color:var(--text);}` plus placeholder/
   autofill/option rules, lines ~22–30) makes every native control themed explicitly, overridden
   for light scheme inside `@media (prefers-color-scheme:light)` (line 243). This exists because
   a prior pass shipped inputs that rendered black-on-black in light mode (`CLAUDE.md` §7 "CLI-OS
   onboarding pass" row: "fixes black-on-black inputs in light-scheme modals"). **Never hardcode a
   text or background color in a new Runs form field — always use the existing `--text`/
   `--input-bg`/`--input-bg-solid` variables**, or you will reopen that exact bug for the Runs
   create form.
2. **Modal pattern.** `openModal(html)` / `closeModal()` (lines ~688–689) plus the `.modal`,
   `.modal .box`, `.field`, `.modal-actions` CSS classes already used by `add()` (add-provider) and
   `addRepo()`. Build the Create-run wizard and the Pre-flight display as a modal using this same
   pair of functions — do not invent a second modal mechanism.
3. **Auth header helper.** `api(method, path, body)` (line ~668) already attaches
   `authorization: Bearer <token>` and JSON-encodes `body`; every Runs call (`create`,
   `preflight`, `start`, `approve`, `stop`) should go through it, exactly like `toggleProvider`/
   `addRepo`/`removeRepo` already do. Error rendering should go through the existing `mErr(data,
   fallback)` (line ~679), which already normalizes the three error shapes the API returns.
4. **20s auto-refresh + anti-poisoning, NOT naive polling.** The dashboard already does
   `setInterval(()=>{ if(S.token && S.summary && document.visibilityState==="visible") refresh();
   }, 20000)` (line ~1042). For the Runs feed and any dropdown (repo picker, etc.) reuse the two
   anti-poisoning idioms already in the file, don't rebuild polling from scratch:
   - **Signature-diffing** (`playRepoSig`/`playModelSig`, lines ~939–954, ~955–966): compute a
     cheap signature of the incoming list (e.g. joined ids) and skip the re-render entirely if
     unchanged, so an open `<select>` dropdown doesn't "snap shut" on every refresh tick.
   - **Generation counter** (`chatGen`, lines 918/1000/1007/1031): capture the counter before an
     async call, increment it on any user action that invalidates in-flight requests (e.g.
     clicking Stop, or leaving the Runs view), and check `if (gen !== currentGen) return;` before
     applying a late response — this is exactly the PR #22 fix ("Clear-during-send can no longer
     poison the next conversation (generation counter)", `.l00prite/ledger.md` run
     `2026-07-04T23:30:00Z`). The events poll for a live run needs the same guard: a Stop click
     followed by a late in-flight events response must not resurrect a "running" render.
5. **Repo picker, project-scoped.** `renderPlayRepos(d)` (lines ~940–954) filters `d.repos` to
   `r.project === principal.project` and, if the token itself is repo-scoped, to that one repo —
   reuse this exact filter for the Runs create wizard's repo picker rather than showing every repo
   the summary returns.

**Gate: a static render of the new Runs section — nav item, empty-state card, and a
non-functional "New run" button that opens an empty modal shell — with zero new fetch calls,
committed as its own increment before Phase 3 begins.**

---

## 4. Phase 3 — create wizard + pre-flight display

1. **Create form** (modal, per §3.2): repo picker → project-scoped `<select>` (§3.5) with a
   "clone a new repo…" option that opens (or chains into) the Phase 5 clone modal; goal `<textarea>`;
   objective `<select>` (§2.6's five values, default `balanced`) with a live team preview once an
   objective + repo are chosen (call `/v1/runs/preflight` isn't available yet at this point — the
   team preview is only available after `/v1/runs` returns its first pre-flight, so either preview
   nothing until Create, or accept that the "live" preview only becomes accurate post-create);
   gates editor (six checkboxes/selects for the `GateClasses`, defaulting to `require_approval`);
   command-allowlist editor (a repeatable text list — the first entry is the done-check, per
   `preflight.go`'s note text: `"done-check convention: %q (the first allowlisted command) must
   pass before definition_of_done_met"`); iteration budget number input (default 25, clamp
   1–100, per §2.5).
2. On submit, `POST /v1/runs` and render the returned `preflight` object **verbatim** — every
   field named in `Preflight` (`engine/types.go`): `goal`, `definition_of_done`, `objective`,
   `planned_units`, `team` (role/profile/provider/model/reason per `TeamMember`),
   `current_iteration`/`max_iterations`, `run_boundaries` (all nine), `likely_changed_paths`,
   `per_action_permission`, `denylist`, `no_progress_threshold`, `command_allowlist`, `gates`,
   `branch`, and any `notes`/`blockers`. This is the one place in the whole UI where paraphrasing
   is a bug: the protocol's contract is that the human confirms *exactly this display*, so render
   it completely, not a summarized version.
3. **Start button state:** disabled whenever `preflight.blockers` is non-empty, and disabled again
   the instant any input changes after a pre-flight was fetched (a stale pre-flight cannot be
   confirmed server-side either — `HandleRunStart` returns `409 run_not_ready` for it — so mirror
   that client-side rather than letting the user hit the 409 for a UX-avoidable reason).
4. **The confirmation control itself must be a plain text input the human types `EXECUTE` into.**
   Never a checkbox, never a pre-filled value, never something the "Start" button auto-supplies.
   This is the protocol's per-run, session-local, in-person confirmation — see §10 item 4 for the
   explicit fence.

**Expected observation:** submitting a valid form renders the full pre-flight JSON with an empty
`blockers` array and a non-empty `team` array (mirrors `TestRunsAPICreateStartComplete`'s
assertions); Start stays disabled until you literally type `EXECUTE` and click it, at which point
`POST /v1/runs/start` returns `200 {run:{status:"running",...}, started:true}`.

---

## 5. Phase 4 — live run

1. **Status header:** one of the 8 statuses (§2.2) as a chip, `current_iteration`/`max_iterations`,
   `cost_usd` (from `runView`'s response shape — already includes `cost_usd`, `boundary`,
   `iterations_since_progress`), and the run's `branch`.
2. **Event stream:** poll `GET /v1/runs/events?id=&after=<cursor>` on the same 20s-or-tighter
   interval discipline as §3.4, tracking `cursor` from the response and passing it back as
   `after` each time — never re-fetch from `after=0` every tick. Render each event's `kind`
   (`preflight_built`, `armed`, `iteration_started`, `unit_selected`, `model_turn`, `tool_call`,
   `tool_denied`, `verify_result`, `review_result`, `persisted`, `approval_requested`,
   `approval_decided`, `boundary`, `status`, `error` — the full `EvXxx` set in `types.go`) with its
   payload; `model_turn` events are the "collaboration record" (provider/model/cost per turn) and
   are worth a distinct visual treatment since they're the most narratively interesting for an
   operator watching the team work.
3. **Approvals inbox:** `pending_approvals` is already returned by `/v1/runs/get`; render each
   `Approval` (`class`, `action`, `args`, `status`) with allow/deny buttons calling
   `POST /v1/runs/approve`, and note the timeout-is-a-deny behavior (§2.4) somewhere visible so an
   idle inbox doesn't look like a bug when it silently resolves to a stop.
4. **Stop button:** `POST /v1/runs/stop`; expect the run to transition to `stopped` with
   `boundary: "stop_signal"` on the next poll.
5. **Exercising a real run without a live provider key:** `runs_api_test.go`'s `scriptCaller`
   (a deterministic `engine.ModelCaller` stand-in — one planner turn selects a unit, one coder turn
   writes a file, the next planner turn reports done) is exactly how `TestRunsAPICreateStartComplete`
   drives a full create→start→done cycle with zero network calls and zero real spend. It is a Go
   test fixture, not something the dashboard can call directly — but it proves the full HTTP
   surface end-to-end, so when you build the Playwright harness in Phase 6, know that a **real**
   run through the dashboard needs an actual configured provider key; there is no dashboard-facing
   "run without spending" mode (the internal mock adapter is test-only — see the "no-mock-options"
   fence, §10 item 2). Budget your Playwright checks accordingly: verify the create→preflight
   render and the Stop/approval UI wiring against the real server, and treat "run reaches `done`"
   as an integration fact already proven by `TestRunsAPICreateStartComplete` rather than something
   the browser test needs to re-prove with a live model call.

---

## 6. Phase 5 — repo-connect clone

Wire `POST /v1/repos/clone` (§2.1's last row) into the repo picker as a "clone from a URL" path,
following the existing `addRepo()` modal shape (`dashboard.html` lines ~858–894) rather than
inventing new modal chrome:

- URL input; client-side hint (not a security control — the server enforces it) that only
  `https://` and `git@host:owner/repo` forms are accepted.
- On `400 bad_url`, surface the exact server message ("Provide an https:// or git@host:owner/repo
  URL...") — the server already rejects credential-embedded https URLs
  (`https://user:token@host/...`) specifically because they'd otherwise be echoed back in the
  response's `cloned_from` field; don't try to pre-validate for credentials client-side, just
  render the server's rejection.
- On success, the response includes `memory.present_count`/`total_files` — reuse `addRepo()`'s
  existing pattern of showing a "no `.l00prite` memory found yet, that's fine" warning note when
  `present_count` is 0, rather than treating it as an error.

---

## 7. Phase 6 — Playwright e2e (COMMIT the harness)

**The `uitest.js` lesson, fenced:** a prior pass claimed "18/18" Playwright checks twice in
`.l00prite/ledger.md` (runs `2026-07-04T...` and a follow-up) and in the `CLAUDE.md` Run Ledger
row "CLI-OS onboarding pass" — the harness that produced those numbers was **never committed**
(`find . -iname "uitest*"` returns nothing as of 2026-07-06). Those 18/18 claims are not
reproducible from the repo today. **Do not repeat this.** The moment you have a passing Playwright
run for the Runs UI, commit the harness file in the same commit (or the very next one) as the
evidence — a claim with no committed harness is not evidence, per `l00prite-validation-and-qa`.

- **Location:** a Node/Playwright script at the repo root or under `cli-os/` (e.g.
  `cli-os/uitest-runs.js` or a `cli-os/e2e/` directory) — check it will actually be tracked:
  the root `.gitignore` is Node boilerplate and does not exclude a script file by name; `cli-os/
  .gitignore` excludes `*.test` (Go test binaries) and `/cli-os`/`/l00prite` (compiled binaries),
  none of which match a `.js` filename, so any of the naming options above is safe. Prefer a name
  that can't collide with the `*.test` glob (don't name the file itself literally `runs.test` with
  no extension).
- **Browser env:** Chromium is preinstalled at `/opt/pw-browsers` (verified:
  `ls /opt/pw-browsers` shows `chromium-1194/` + a `chromium` symlink to
  `chromium-1194/chrome-linux/chrome`) — point Playwright at it via its existing
  `PLAYWRIGHT_BROWSERS_PATH`/executablePath convention rather than triggering a fresh download.
- **~12–18 checks to implement** (name them explicitly in the test output so a future session can
  tell which ones ran):
  1. Runs nav item present and scrolls to `#sec-runs`.
  2. Runs section renders in dark scheme with no black-on-black text (contrast check on every
     new input/select, mirroring the existing wizard/dashboard contrast checks from the CLI-OS
     onboarding pass).
  3. Same contrast check under `prefers-color-scheme: light`.
  4. Create-run modal opens via the New-run button.
  5. Repo picker only lists repos matching the token's project (§3.5's filter, exercised live).
  6. Objective picker offers all five values from §2.6.
  7. Submitting a valid create form renders the full pre-flight (goal/DoD/team/boundaries/
     denylist all present in the DOM).
  8. Start button is disabled while `blockers` is non-empty (force a blocker, e.g. an empty
     command allowlist, and assert Start stays disabled).
  9. Start button is disabled until the confirm input literally contains `EXECUTE` — assert it
     is NOT auto-filled and NOT satisfied by any other string.
  10. A (scripted/mocked-at-the-HTTP-layer, not dashboard-mocked) create→start reaches a
      `running` status render.
  11. Event stream renders at least one event kind from the `EvXxx` set after a run starts.
  12. Approvals inbox renders a pending approval with working allow/deny buttons.
  13. Stop button transitions the status chip to `stopped`.
  14. Clone-repo modal rejects a credential-embedded `https://user:pass@host/...` URL with the
      server's exact error text.
  15. No dashboard-mocked/demo run option is exposed anywhere in the Runs UI (see §10 item 2's
      "no-mock-options" fence) — assert its literal absence.
  16. The 20s auto-refresh does not reset an open repo-picker dropdown or wipe form input mid-edit
      (reuse the signature-diffing check pattern already validated for Playground's repo/model
      pickers).

Run it, capture the real pass/fail output, and quote that exact output (not a paraphrase) in your
ledger entry.

---

## 8. Phase 7 — promotion

1. `bash scripts/verify-all.sh` if it exists in your branch (validator + doctor + `go test`) or
   run the three baseline commands from §1 again individually.
2. Run the Playwright harness and capture its real output.
3. Write the `.l00prite/ledger.md` entry with full evidence fields (command/exit_code/summary/
   timestamp per check — see `l00prite-validation-and-qa` for the exact template) and the
   matching `CLAUDE.md` §7 Run Ledger row.
4. Update `.l00prite/todos.md`: move the "Dashboard Runs view" item from Active to done, and
   correct the stale `OS-APK` branch name if it's still there.
5. Open the PR (per `l00prite-change-control`'s branch policy — feature branch, one commit per
   verified change, no direct commits to `main`).
6. Respond to bot review rounds per `l00prite-change-control`'s procedure; paste the Playwright
   output as evidence in the PR description or a review reply, not just in the ledger.

---

## 9. Solution menu (ranked, with obligations)

| Decision | Recommendation | Why | Obligation if you choose otherwise |
|---|---|---|---|
| Events transport | **Polling** (reuse the existing 20s-cadence + cursor pattern) | Zero server changes; `/v1/runs/events?after=` is already cursor-based and built for exactly this; matches every other live-ish surface in the dashboard today. | SSE would need a new streaming route in `server.go` and a new response-writer path in the gateway — materially bigger blast radius. Treat any SSE proposal as a protocol-adjacent change and route it through `l00prite-change-control` thinking (not because it touches a gated file, but because it's new surface area worth a second look) before writing it. |
| Page structure | **Single-page section** (`#sec-runs` + nav anchor, matching the existing six sections) | `os-architecture.md` §4 itself says the new area "follows the existing single-file conventions"; the `data-goto`/`sec-*` pattern already generalizes with zero new JS. | A separate HTML page would need a new embedded asset (`public/*.html` + a Go `//go:embed` wire-up) and a new server route — do this only if the maintainer explicitly asks for it. |
| Create flow | **Modal** (reuse `openModal`/`.modal`/`.field`) | Every existing "add X" flow in the dashboard is a modal; a new pattern for just this one flow is inconsistent for no benefit. | An inline expanding card is defensible but means duplicating (not reusing) the modal CSS — extra surface for the same result. |
| Confirm control | **Plain text `<input>` the human types `EXECUTE` into, validated client-side only for UX (disable Start), never for authorization** | Matches the server's own gate exactly — a checkbox or pre-filled value would *look* equivalent but would violate the protocol's per-run, in-session confirmation the whole engine is built around. | There is no acceptable "otherwise" here — see §10 item 4. |

---

## 10. Wrong paths — fenced

1. **Editing either review-gated file** (`.claude/commands/build-loop.md`,
   `scripts/validate-l00prite.js`). Nothing in this entire campaign requires touching either —
   the Runs UI is pure `cli-os/public/dashboard.html` (+ maybe a committed Playwright test file).
   If you ever think you need to touch one of these two files for this campaign, stop: you have
   misunderstood the task. See `l00prite-change-control`.
2. **Fabricating dashboard data.** The entire reason `/v1/dashboard/summary` and now `/v1/runs*`
   exist as real, tested endpoints is that a prior mockup shipped 100% fake stats and was
   rewritten to real data (commit `f61b015`, "CLI-OS: real dashboard data + zero-config first-run
   wizard (#18)" — verified via `git show --stat f61b015`). Never render a placeholder run, a
   demo/mock run option, or synthetic event data anywhere the operator can mistake it for a real
   run. If you need something to click through during development, drive it against the real
   server with the real `scriptCaller`-style test fixture pattern (Go-side, in a test), not a
   client-side fake in `dashboard.html`.
3. **Bypassing the setup latch.** `SetupComplete()` permanently 403s `/v1/setup/*` once vault +
   provider + token all exist — never add a Runs-specific escape hatch around it.
4. **Auto-confirming `EXECUTE`.** Never pre-fill, default, remember, or script the confirm value
   into the Start action. That field being empty until a human types it is the entire mechanism
   of the protocol's per-run, session-local confirmation (`ArmHeartbeat`/`StartRun`'s explicit
   check) — auto-filling it anywhere, including "for testing convenience," reintroduces the exact
   persisted-flag-as-authorization failure the whole engine design rejects (see
   `l00prite-architecture-contract` for why).
5. **Rebuilding naive polling.** Don't write a fresh `setInterval` that blindly re-renders
   `innerHTML` on every tick. Reuse the signature-diffing and generation-counter idioms already
   fixed into the file after PR #22 (§3.4) — a naive rebuild will reopen the exact "snap shut
   dropdown" / "poisoned reply" bugs that were already found and fixed once.
6. **Starting from `.l00prite/todos.md`'s stale "Active" text instead of this campaign.** That
   section still names branch `OS-APK`, which is gone from `origin` again as of 2026-07-06
   (verified `git ls-remote --heads origin`) — it is a historical artifact of the pass that got
   cut off, not a live instruction. This skill supersedes it; update todos.md at promotion time
   (§8.4) rather than treating its current text as ground truth.

---

## Provenance and maintenance

| Volatile fact stated above | One-line re-verification command |
|---|---|
| Dashboard has zero Runs UI (`grep -c -i runs` → 0) | `grep -c -i runs cli-os/public/dashboard.html` |
| Validator 519 PASS / 0 FAIL | `node scripts/validate-l00prite.js 2>&1 \| grep -c FAIL` (expect `0`); `... \| grep -c PASS` (expect the current count, ≥519) |
| Doctor HEALTHY, 25 ok / 0 warn / 0 fail | `node scripts/l00prite-doctor.js .` |
| `go test ./...` green, 144 top-level test functions | `cd cli-os && go test ./... -count=1`; `grep -rn "^func Test" --include="*_test.go" cli-os \| wc -l` |
| `OS-APK` branch absent from origin | `git ls-remote --heads origin \| grep -c OS-APK` (expect `0`) |
| No committed Playwright harness exists yet | `find . -iname "uitest*" -o -iname "*playwright*"` (expect nothing before Phase 6 lands) |
| `f61b015` is the real "fabricated dashboard data replaced" commit | `git show --stat f61b015 \| head -5` |
| `runs_api_test.go` proves the full create→start→done HTTP flow | `cd cli-os && go test ./internal/server/... -run TestRunsAPI -v` |
| The engine test suite includes 5 run-lifecycle integration tests | `grep -n "^func Test" cli-os/internal/engine/run_integration_test.go` |
| `RunConfig` defaults (25/900/3) unchanged | `grep -n "MaxIterations = 25\|ApprovalTimeoutSec = 900\|NoProgressThreshold = 3" cli-os/internal/engine/store.go` |
| Playwright Chromium preinstalled at `/opt/pw-browsers` | `ls /opt/pw-browsers` |
| `dashboard.html`'s nav sections and their ids | `grep -n 'data-goto=\|id="sec-' cli-os/public/dashboard.html` |
