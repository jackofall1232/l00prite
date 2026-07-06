---
name: l00prite-execution-mode-ops
description: >
  Scope: any l00prite-managed project. Load this when you are about to start, supervise,
  stop, or resume Execution Mode — the autonomous multi-iteration run behind
  `.l00prite/prompts/execute-loop.md` (or the `cli-os` run engine's `/v1/runs*` mechanization
  of it). Trigger on: "arm execution mode", "run execute-loop", "confirm EXECUTE", "pre-flight
  gate", "why won't the run start", a run stopped at one of the nine run boundaries
  (`definition_of_done_met`, `iteration_limit_reached`, `human_review_gate`,
  `destructive_operation_required`, `ambiguous_requirements`, `unfixable_failing_tests`,
  `missing_secrets_or_credentials`, `lock_lease_conflict`, `stop_signal`) and you need to know
  what it means or how to resume after it, `execution.enabled`/`preflight_confirmed`/
  `execution_active` looking armed with no live run behind it (stale/crash wreckage), the
  Autonomous-Edit Denylist blocking a write, or a `heartbeat.json` that predates the
  `execution` block (schema v2 migration). Defers to your project's own
  `.l00prite/prompts/execute-loop.md` as the authority this skill maps — never a replacement
  for it.
---

# l00prite Execution Mode ops

## What this skill is for

Execution Mode is the one place in the l00prite protocol where an agent is allowed to keep
working across many iterations without asking permission again after the first go-ahead. That
is exactly why it needs an operator's manual: the whole safety model rests on one gate (a
human explicitly saying "go" for *this* run, in *this* session) plus nine well-defined stop
conditions. This skill is that manual — for a human supervising a run, or an AI session
picking up after one stopped. It covers the protocol semantics shared by the two ways a
project can actually run Execution Mode:

- **Prompt-driven** — any agent (Claude, Codex, Gemini, a human copy-pasting) following your
  project's own `.l00prite/prompts/execute-loop.md` by hand, one session at a time.
- **Engine-driven** — the `cli-os` run engine mechanically enforcing the identical protocol in
  Go, reachable over `/v1/runs*`. `l00prite-run-and-operate` gives you the curl-level API
  walkthrough (request/response shapes, endpoint table); this skill gives you what those
  requests and responses *mean* — the arming semantics, the boundary theory, the resume
  playbook — that both surfaces share.

Wherever the two surfaces differ (and a few places genuinely do), each fact below is labeled
**[prompt]** or **[engine]**. If a fact carries no label, it holds on both. Your project's own
`.l00prite/prompts/execute-loop.md` is the canonical protocol text — if anything here seems to
disagree with it, that file wins; treat the disagreement as this skill being stale, not the
other way round.

All facts and quoted text below were checked against the l00prite repo's canonical copy of
`execute-loop.md`, its `heartbeat.json`/`state.json`/`lock.json` templates, and the `cli-os`
engine source, **as of 2026-07-06**. If your project vendors an older or newer copy of the
protocol, treat exact field names, defaults, and the engine behaviors as pointers to re-check
against your own `.l00prite/prompts/execute-loop.md` and (if you run it) your own `cli-os`
version — not guarantees.

## When NOT to use this

| If you actually need... | Use instead |
|---|---|
| The curl-level `/v1/runs*` request/response shapes, endpoint table, and a real walkthrough | `l00prite-run-and-operate` (this skill gives you the *protocol semantics*; that one gives you the *API shape*) |
| Day-to-day protocol life outside a run — which of the other five canonical prompts to run when, lock etiquette, event lifecycle, memory hygiene | `l00prite-loop-operations` |
| Bringing l00prite into a project for the first time, what `build-loop --execute` scaffolds, complexity tiers | `l00prite-adopting` |
| Deep Go-runtime internals — package map, routing internals, prompt-cache mechanics, "where to add a new gate class" | `l00prite-cli-os-internals` (repo-dev) |
| The full `heartbeat.json`/`state.json`/`lock.json`/`RunConfig` field catalog with every default and fallback rule | `l00prite-config-and-flags` (Part A) |
| Symptom-indexed triage when something behaves unexpectedly (validator/doctor output, lock conflicts as a class of bug, go test failures) | `l00prite-debugging-playbook` |
| WHY per-run session-local confirmation beats persisted flags, restriction-ladder theory, cooperative lock/lease theory in general | `agent-loop-domain-reference` |
| Building or extending the run engine's code itself (new gate class, new boundary) | `l00prite-cli-os-internals` (repo-dev) — and note any new *boundary* is a protocol change, routed through change control, not a quick add |
| Multi-agent delegation rules for a pass that happens to include an Execution Mode run | `l00prite-subagent-delegation` (note: Execution Mode confirmation is per-run and session-local — a subagent cannot confirm a pre-flight on a human's behalf; see §2 below) |

---

## 1. The mental model

l00prite has exactly two operating modes:

- **Planning Mode** — scaffold, discuss, edit files under normal supervision, then stop. This
  is the default and the only mode any scaffold ships in.
- **Execution Mode** — an autonomous run: plan a unit, execute, verify, persist, repeat —
  until a run boundary is reached. It is entered **only** through the pre-flight gate in
  `execute-loop.md`, and never starts without a confirmation that is (a) explicit, (b)
  in-session, and (c) fresh to this run. Once confirmed, the run does not ask again per
  iteration — the whole point of the gate is that it is asked once, deliberately, and covers
  the run's entire iteration budget.

Two ways to actually run it, sharing the same protocol semantics:

1. **[prompt]** Any agent reads `.l00prite/prompts/execute-loop.md` (or its byte-identical
   mirror under `.claude/prompts/` or `.codex/prompts/`) and follows it turn by turn inside an
   interactive session.
2. **[engine]** The `cli-os` run engine (`internal/engine/`) is, in its own words, "`execute-
   loop.md` translated into Go" (`cli-os/docs/os-architecture.md` §2.2) — every numbered
   pre-flight step, the iteration protocol, and all nine boundaries are concrete code, not
   agent-followed prose. `POST /v1/runs/start` with `confirm:"EXECUTE"` **is** the explicit
   in-session confirmation for this surface. See `l00prite-run-and-operate` §6 for the request
   shapes.

Both surfaces write the **same** `.l00prite/` files (`heartbeat.json`, `state.json`,
`lock.json`, `ledger.md`, `todos.md`, `failures.md`) in the same shapes, so a run started one
way can, in principle, be picked up and reasoned about by a session using the other — that
cross-surface continuity is the point of keeping the protocol file-based.

---

## 2. Arming semantics: why persisted flags never authorize

Three fields can *look* like "execution is on": `heartbeat.json`'s `execution.enabled`,
`execution.preflight_confirmed`, and `state.json`'s `execution_active`. **None of them
authorize a run.** They are audit records of a *past* confirmation, nothing more. `execute-
loop.md` says this outright:

> A `preflight_confirmed: true` or `execution.enabled: true` already present in
> `heartbeat.json` **does not satisfy this gate**. Those fields are an audit record of a past
> run, never an authorization for this one. Re-confirm every run.

The reasoning, from this project's own decision record (`.l00prite/memory.md`): "any agent can
write them, so honoring them would be a forgeable blanket grant." A field in an
agent-writable JSON file has no way to prove a human actually saw and approved *this* run — so
the protocol never lets it substitute for asking again.

Two hard consequences:

- **Headless sessions cannot enter Execution Mode.** If there is no interactive human in the
  session — a CI-triggered, scheduled, or fire-and-forget agent — the pre-flight gate cannot
  be satisfied. `execute-loop.md` step 6: "Do not enter Execution Mode; record why in the
  session output and stop." **[engine]** The same rule holds structurally: `cli-os/docs/
  os-architecture.md` states it as "there is deliberately no non-interactive path to Start" —
  no config key, env var, or API default can substitute for the authenticated `Start` call.
- **`build-loop --execute` never pre-arms.** The flag only offers the Execution Mode handoff
  *after* scaffolding finishes; the scaffold always ships `execution.enabled: false`, and the
  gate still runs in-session, fresh, afterward. There is no flag combination that produces an
  already-armed repo on disk.

**[engine]** One place the two surfaces genuinely differ in mechanism, not intent: the prompt
asks for "explicit human confirmation (for example, by replying `EXECUTE`)" — the *example*
wording isn't a strict string match at the prompt level. The engine is stricter by
construction: `StartRun` rejects anything except the literal string `"EXECUTE"` (case-
sensitive, trimmed) — `strings.TrimSpace(confirm) != "EXECUTE"` is checked before touching
anything else. Verified:

```
$ curl -s .../v1/runs/start -d '{"id":"run_...","confirm":"yes"}'
# HTTP 400 start_rejected
$ curl -s .../v1/runs/start -d '{"id":"run_...","confirm":"EXECUTE"}'
{"run":{...,"status":"running",...},"started":true}
```

---

## 3. The pre-flight walkthrough

Every run, prompt-driven or engine-driven, goes through the same seven steps before the first
iteration. Read `.l00prite/prompts/execute-loop.md`'s "Mode entry" section for the literal
text this table maps — it is the authority; this is the operator's digest.

| Step | What happens | Operator notes |
|---|---|---|
| 1. Read all memory | `blueprint.md`, `ledger.md`, `memory.md`, `constraints.md`, `failures.md`, `todos.md`, `state.json`, `heartbeat.json`, `lock.json`, pending/processing events, plus `CLAUDE.md`/`AGENTS.md` if present. **[engine]** also scaffolds `.l00prite/` memory files first if the target repo has none yet — deliberately *not* the six loop prompts (`cli-os/docs/os-architecture.md` §2.6: an eighth generated copy of the prompts would either drift or expand the validator's mirrored-copy set). | If step 1 can't read a file, that's a blocker, not a skip. |
| 2. Check the lock **first** | `lock.json` read before any write, including the pre-flight audit fields. A foreign active unexpired lock is a blocker — report owner/purpose/expiry and stop; write nothing. | This is the single most important ordering rule in the whole gate: lock-check precedes even the pre-flight display's own bookkeeping. |
| 3. Recover a stale run | If `state.json.execution_active` or `heartbeat.json.execution.enabled` is `true` but no live, unexpired lock backs it, the previous run crashed or was interrupted. Disarm **both** sides under your own (new) lock: `execution_active: false`, `execution.enabled: false`, `execution.preflight_confirmed: false`, `should_continue: false`. Log the reclamation in `ledger.md`. | Clearing *both* sides matters — see §8. |
| 4. Migrate the schema if needed | No `execution` block → add the full default (disarmed) block, bump `schema_version` to `2`. Block exists but missing the no-progress trio (`iterations_since_progress`/`last_progress_iteration`/`no_progress_threshold`) → backfill just those three with their defaults (`0`, `null`, `3`). Do it under the lock; record it in `ledger.md`; release the lock right after — never hold it while waiting on the human. | See §9 for what schema v2 actually changed. |
| 5. Display the pre-flight | Goal + Definition of Done; planned units (from `todos.md` + named pending events); `current_iteration`/`max_iterations` (the *previous* run's counter — it resets to 0 only on confirm); all nine boundaries; likely-changed files; the always-separately-gated actions; the `constraints.md` Autonomous-Edit Denylist in effect; `no_progress_threshold`; the verification commands that will be used. | **[engine]** builds this as a real API object (`Preflight` struct) with `Blockers`/`Notes` — a stale worktree, no commits, or an unroutable role becomes a hard `Blockers` entry that makes Start impossible until resolved, distinct from an informational `Notes` entry. |
| 6. Wait for explicit human confirmation | The human must affirmatively confirm, in this session, against *this* fresh pre-flight. Decline or silence → stay in Planning Mode, nothing armed. | See §2 for exactly what does and does not count. |
| 7. Arm the run | Only after confirmation: acquire the lock (`purpose: "execute-loop run"`), reset `current_iteration` to 0 **and** reset the no-progress telemetry (`iterations_since_progress: 0`, `last_progress_iteration: null`) — this is the *only* place those counters get a non-increment write — then set `execution.enabled/preflight_confirmed(_at/_by)`, `should_continue: true`, `state.json.execution_active: true`. | If a prior run stopped exactly at the no-progress threshold, arming without resetting the stall counter would start the new run already thrashing — that's why the reset happens here, not just at Start. |

**If the human declines at step 6:** nothing is armed, no repo file is written differently
than it already was (any recovery/migration from steps 3-4 already happened and was already
logged — declining doesn't undo bookkeeping that already completed). The project stays in
Planning Mode.

---

## 4. The nine run boundaries — what each means and how to resume

Stop the run, before starting another unit, when any boundary applies. This table adds the
operator's half execute-loop.md doesn't spell out per-boundary: **what to actually do next.**

| # | Boundary | What triggers it | What gets written on stop | How to resume |
|---|---|---|---|---|
| 1 | `definition_of_done_met` | Every Definition of Done item genuinely verified — the goal state, not a failure. **[engine]**: the planner reports no remaining unit *and* the command allowlist's first entry (the designated done-check) passes, recorded with its evidence. | `completion_status: "complete"`; `last_run_boundary`; ledger run-summary with the verification evidence. | Nothing to resume — report completion. More work on the same project is a *new* goal: a fresh pre-flight, a fresh confirmation. |
| 2 | `iteration_limit_reached` | `execution.current_iteration` reaches `execution.max_iterations`. **[engine]**: the budget is fixed at Start; no code path raises it mid-run (the self-modification guard, §6). | `last_run_boundary`; ledger summary of what got done. | Review the ledger for what's left, then run a fresh pre-flight. A brand-new confirmed run may set a *larger* `max_iterations` (clamped 1-100 in the engine) — the immutability rule only forbids raising the budget of a run already in progress, not choosing a bigger one for the next run. |
| 3 | `human_review_gate` | A `heartbeat.json` `human_review_gates` condition applies; a scope/requirements question needs a human call; a post-confirmation event needs handling; a protocol-file change would be required (§6). **Also carries the no-progress escalation** (see below) — there is no dedicated tenth boundary for it. | `pause_reason` names the specific reason in plain language; ledger entry. | Read `pause_reason`/the ledger entry for the *specific* trigger before doing anything — this boundary covers several distinct situations. Make the actual human decision it's asking for (answer the scope question; for a would-be protocol-file change, make that change yourself outside the run — never by loosening the gate), then fresh pre-flight. |
| 4 | `destructive_operation_required` | Editing a path that matches the `constraints.md` Autonomous-Edit Denylist, or any of: deleting/rewriting git history, force-push, dropping data, writing/deleting outside the repo, installing dependencies not named at pre-flight, modifying CI/workflow/git-hook files, running network-fetched code, changing credentials. Checked *before* every file edit. | `last_run_boundary`; the specific denied/expired action named in the ledger/pause reason. | See the detailed note below — resuming depends on which surface you're on and whether it was a decision or a timeout. |
| 5 | `ambiguous_requirements` | `blueprint.md`, `constraints.md`, and `todos.md` conflict, or don't determine the next unit. **[engine]**: a structured planner refusal, not free text. | `pause_reason` states the conflict. | A human resolves the conflict by editing the memory files themselves (under the lock) — `blueprint.md`/`todos.md`/`constraints.md` — **before** re-running pre-flight. The loop never guesses at scope. |
| 6 | `unfixable_failing_tests` | The same unit fails verification after two distinct fix attempts, or matches an existing `failures.md` `do_not_retry` signature. | A `failures.md` entry: failure signature, attempt count, `do_not_retry` when warranted. | **Read `failures.md`'s attempts log for this exact unit first.** Don't let a fresh session retry the same failed approach a third time. Bring a genuinely different approach, split the unit smaller, or get direct human help — then fresh pre-flight. |
| 7 | `missing_secrets_or_credentials` | The next unit needs a secret/token/credential that isn't available. Never guessed, fabricated, or searched for. | `pause_reason` names what's missing (never a value). | A human supplies the credential through its proper channel (provider vault, an `.env` the Denylist already protects, etc.) — never by having the agent go look for it — then fresh pre-flight. |
| 8 | `lock_lease_conflict` | **Special case.** An active, unexpired lock owned by a different agent/session appears mid-run. | **Nothing** is written to any protected `.l00prite/` path — the mode-exit recording rules explicitly do not apply here, because the memory belongs to someone else right now. **[engine]** verified in source: this path calls `Store.FinishRun` directly (only the engine's own SQLite `runs` row — status/boundary/summary/ended_at), bypassing the normal exit routine that touches the repo's `heartbeat.json`/`state.json`/`ledger.md` entirely. | Report the lock (owner, purpose, expiry) and coordinate with whoever holds it — do not try to write around it. Once it's released or expired, a fresh pre-flight will do its own lock check (and stale-run recovery, if that other party's own run crashed). |
| 9 | `stop_signal` | `heartbeat.json.should_continue` is `false`, `state.json.blocked` is `true`, `execution.enabled` was set `false`, or a human says stop. **[engine]**: the `Stop` API call, or the same file-side signals detected mid-run. | Standard mode-exit writes (ledger summary, disarm both sides, release lock). | Usually an intentional pause — read the recorded reason, then fresh pre-flight when ready. |

**No-progress escalation (not a tenth boundary).** If an iteration makes no real progress (no
`todos.md` item closed, no Definition of Done check newly passing),
`execution.iterations_since_progress` increments; a genuine step resets it to `0` and updates
`execution.last_progress_iteration`. Reaching `execution.no_progress_threshold` (default `3`)
stops the run **at `human_review_gate`** — execute-loop.md is explicit that this escalates
through the existing boundary rather than inventing a new one, and the v1.2 roadmap batch
(`.l00prite/todos.md`) is where a dedicated `no_progress_detected` boundary is tracked as
*future*, gated work — do not treat it as already existing.

**`destructive_operation_required` in more depth — resuming correctly depends on the surface:**

- **[prompt]** A denylist match (or any of the other destructive triggers) is itself the
  boundary: the run boundary section is unconditional — the loop stops the *whole run*, asks
  for per-action permission, and every exit-recording rule applies.
- **[engine]** The mechanism is layered, and it matters for what "resume" means:
  - A Denylist/non-allowlisted-command/`git push`/`git merge` hit **suspends into
    `waiting_approval`** for that one action — it does not, by itself, end the run.
  - An explicit human **deny** just skips that action; the run keeps going (the model is told
    to adapt within the unit, or call its own `unit_blocked`) — this is *not* automatically a
    `destructive_operation_required` stop.
  - Only an **approval timeout** (no decision inside `approval_timeout_s`, default 900s)
    fail-closes into an actual `destructive_operation_required` boundary stop — verified in
    `cli-os/internal/engine/exec.go`'s `awaitApproval`: `timer.C` fires →
    `ExpireApproval` → `return false, BoundaryDestructive`, and this is true for **every** gate
    class (push/merge/deploy/credential_change/destructive/outside_repo alike) — a timed-out
    push approval reports the same boundary id as a timed-out denylist edit.
  - **Honest gap, dated 2026-07-06:** the gate classes `deploy`, `credential_change`, and
    `outside_repo` are declared and configurable (shown at pre-flight, settable per run), but
    no code path in the current tool loop actually constructs a gate request carrying one of
    those three labels (verified: only three call sites build a `GateRequest` in
    `cli-os/internal/engine/tools.go`, and none use them). `outside_repo` can't structurally
    occur — the repo jail makes leaving the repo root a hard error, never a gate. A
    would-be deploy or credential-change *command* not on the allowlist still gets gated —
    just generically, as `destructive`, not under its own dedicated label. Don't assume a run
    configured with `gates: {"deploy": "deny"}` is doing anything today; verify against
    `l00prite-cli-os-internals` or the source before relying on it.
  - **Resuming:** find the specific action from the run's event feed (`approval_requested` /
    `approval_decided` with `decision: "expired"`) or the ledger. The exact denied/timed-out
    action is not silently retried — a fresh confirmed run re-attempts the unit and may
    re-request approval; be ready to answer promptly this time, or set a larger
    `approval_timeout_s` at the next run's creation.

---

## 5. Per-action permission and the Denylist

Some actions are **always** separately gated, no matter what the pre-flight confirmed: push
(any remote), merge, deploy/publish, changing credentials or secrets, deleting anything
outside the repo, installing/upgrading dependencies not named at pre-flight, editing any
Autonomous-Edit Denylist path, and running any command not on the allowlist. The pre-flight
confirmation is **not** a blanket grant for these — `execute-loop.md`: "A denied permission is
recorded as a skip or a boundary stop — never worked around by other means."

The **Autonomous-Edit Denylist** lives in your project's `constraints.md`, as a fenced
gitignore-style glob block under the `## Autonomous-Edit Denylist` heading. A file about to be
edited that matches any glob there is treated as `destructive_operation_required` — stop and
ask, never edit past it. This block is itself **loop-immutable**: a run may never remove or
loosen an entry to get past a stop; wanting to is itself the `human_review_gate` boundary, not
a green light to edit the list. Edit your Denylist yourself, before you arm a run, not during
one. `scripts/l00prite-doctor.js` (portable — see §7) warns if the heading exists with no
fenced block, or if it's missing the critical secret/credential/`.env` protections.

**[engine]** The Denylist is enforced doubly, and the second layer is the reason a run can
never talk its way past it: `constraints.md` itself, along with `.l00prite/heartbeat.json`,
`state.json`, `lock.json`, and `.l00prite/prompts/**`, are **hard-denied** to the model's own
tools — not gate-then-approvable like an ordinary Denylist hit, an unconditional deny. If
`constraints.md` were only Denylist-*gated* (or, since it wouldn't match its own globs,
ungated entirely), a run could edit it to remove/loosen an entry and then, next iteration,
freely edit whatever it just unprotected — defeating the whole self-modification guard. This
is why "edit it yourself, before you arm a run" in `constraints.md`'s own doc block is not
just a style note.

---

## 6. Self-modification guard, digested

During a run — prompt-driven or engine-driven — the loop may write only a narrow, named set of
`heartbeat.json` fields: `execution.current_iteration` (one increment per iteration; the
arming reset is the only other legal write), the no-progress telemetry pair
(`iterations_since_progress`/`last_progress_iteration`), `execution.enabled` (true→false
only), `execution.last_run_boundary`, the arming audit fields set once at Start,
`last_run_time`, `completion_status`, `pause_reason`, and `should_continue` (true→false only —
inside Execution Mode it only goes false→true again via a fresh confirmed pre-flight).

**Never**, during a run: raise `execution.max_iterations` or `execution.no_progress_threshold`;
edit `execution.run_boundaries`, `human_review_gates`, `.l00prite/prompts/`, `AGENTS.md`, the
protocol section of `CLAUDE.md`, vendor adapter files, or `.l00prite/LOCKING.md`; or remove/
loosen a `constraints.md` Denylist entry. Needing any of these is itself the
`human_review_gate` boundary — not something to work around.

**[engine]** The same guard exists as unconditional code, not just an instruction a model is
asked to honor: the model's own tools (`write_file`, etc.) cannot touch `heartbeat.json`,
`state.json`, `lock.json`, or `.l00prite/prompts/**` **at all** — `protocolProtected()` in
`cli-os/internal/engine/tools.go` hard-denies them before the Denylist gate is even
consulted. Those files are written only by the engine's own persistence code (`ArmHeartbeat`/
`DisarmHeartbeat`/`TickHeartbeat`/`SetStateRun`), never by anything the model asked for. The
iteration budget and no-progress threshold are immutable for the life of a run by construction
(`RunConfig` is read-only after `Start`); the only way to get a different value is a *new* run.

---

## 7. Supervision checklists

Copy-paste `jq` one-liners below were run against this project's own `.l00prite/heartbeat.json`
/`state.json`/`lock.json` as a worked example — point them at your own project's files (same
relative paths from your project root: `.l00prite/heartbeat.json` etc.).

### Before Start

- [ ] Doctor is healthy: `node <path-to-l00prite-doctor.js> .` → `HEALTHY` (or at least no
  `FAIL` lines — `WARN` doesn't block a run, but read every warning first). See
  `l00prite-diagnostics-and-tooling` for full interpretation; the portable summary: exit code
  0 unless a `FAIL`-level problem exists, `WARN` never changes the exit code.
- [ ] Disarmed baseline, confirmed by hand, not assumed:
  ```
  jq '{enabled: .execution.enabled, preflight_confirmed: .execution.preflight_confirmed, should_continue: .should_continue}' .l00prite/heartbeat.json
  jq '.execution_active, .execution_stop_reason, .blocked' .l00prite/state.json
  ```
  Expect `enabled`/`preflight_confirmed`/`should_continue`/`execution_active` all `false`
  (or `should_continue: true` only if you're mid-confirmation right now) and `blocked: false`.
- [ ] Lock is clean:
  ```
  jq '.status, .owner_agent, .expires_at' .l00prite/lock.json
  ```
  Expect `"unlocked"`, `"released"`, or an `"active"`/`"expired"` status whose `expires_at` has
  already passed (reclaimable — see `LOCKING.md` rule 4, and §8 below). An `"active"` status
  with a future `expires_at` and an owner that isn't you is a real blocker: stop, don't arm.
- [ ] All nine boundaries present:
  ```
  jq '.execution.run_boundaries | length' .l00prite/heartbeat.json
  ```
  Expect `9`. A shorter or differently-named list is drift from the templates — restore it
  from your project's canonical `templates/l00prite/heartbeat.json` equivalent (or ask
  `l00prite-diagnostics-and-tooling`/doctor to catch it for you) before arming.

### During the run

- [ ] The ledger is actually growing, one entry per iteration, each with real verification
  evidence (command, exit code, summary, timestamp) — not vague "tests passed" prose. If the
  next iteration hasn't started and the ledger hasn't grown, something is stuck; check the
  lock and the process, don't just wait.
- [ ] No-progress telemetry isn't creeping toward the threshold unnoticed:
  ```
  jq '{isp: .execution.iterations_since_progress, threshold: .execution.no_progress_threshold, lpi: .execution.last_progress_iteration}' .l00prite/heartbeat.json
  ```
  `isp` reaching `threshold` means the run is about to stop and escalate at
  `human_review_gate` on its own — that's working as intended, not a bug to interrupt early.
- [ ] **[engine]** If you're watching an approvals inbox, decide promptly — an unanswered
  approval fail-closes into a `destructive_operation_required` stop after
  `approval_timeout_s` (default 900s), not into a wait-forever state.

### After any stop

- [ ] The boundary got recorded, not just "the run went quiet":
  ```
  jq '.execution.last_run_boundary, .completion_status, .pause_reason' .l00prite/heartbeat.json
  ```
- [ ] Both sides are actually disarmed (the dual-write is not optional — a stop that only
  clears one side is exactly the crash-wreckage shape in §8):
  ```
  jq '.execution.enabled, .should_continue' .l00prite/heartbeat.json
  jq '.execution_active' .l00prite/state.json
  ```
  Expect `false`/`false` and `false`.
- [ ] The lock was released, not left dangling:
  ```
  jq '.status' .l00prite/lock.json
  ```
  Expect `"released"` (never a lingering `"active"` after a clean stop).
- [ ] The ledger's last entry names the boundary and the next recommended action — that's what
  the *next* session (possibly a different vendor's agent) will read to pick this up.

---

## 8. Stale-run recovery for operators

Recognize crash wreckage before it fools you: `execution.enabled: true` or
`state.json.execution_active: true` with **no** live, unexpired lock behind it means the
previous run's process died mid-iteration — not that a run is quietly still going.
`scripts/l00prite-doctor.js` calls this out as a hard `FAIL` for exactly this reason (mirrors
the validator's own arming-consistency check): "Execution Mode is armed but no active,
unexpired execute-loop lock backs it — a crashed run left arming state committed." A `WARN`
instead of `FAIL` for the *same* shape means it's already disarmed but `preflight_confirmed`
is stale (harmless audit leftover — the next pre-flight overwrites it, not a live danger).

**What to do:** nothing by hand, and never partially. Run a fresh pre-flight (prompt-driven:
just start `execute-loop.md` again; **[engine]**: `POST /v1/runs/preflight`, or boot the
server — orphan reconciliation runs automatically at startup, marking any `running`/
`waiting_approval` row `interrupted`). The pre-flight's own step 3 disarms **both**
`heartbeat.json` and `state.json` sides together and logs the reclamation. Disarming only one
side by hand — say, flipping `execution_active` to `false` but leaving
`execution.enabled: true` — recreates exactly the mismatch the doctor flags as a hard failure,
and leaves the next pre-flight (which keys off `execution_active`) looking at an inconsistent
picture. Let the protocol's own recovery step do both writes atomically under the lock; don't
race it by hand-editing JSON mid-investigation.

---

## 9. Schema v2 — what actually changed

`heartbeat.json`/`state.json` moved to `schema_version: 2` specifically for the `execution`
block (heartbeat) and the `execution_active`/`execution_stop_reason` pair (state) — Execution
Mode's own fields. Everything that existed before (the top-level `max_iterations`/
`current_iteration`/`stop_conditions`/`human_review_gates`/`should_continue` in
`heartbeat.json`, used by the *supervised* loops — `resume-loop.md`, `heartbeat.md` — not by
Execution Mode) is untouched and still present alongside the new block. **Do not confuse the
two counter pairs**: `heartbeat.json`'s top-level `current_iteration`/`max_iterations` belongs
to the older supervised-loop convention; `execution.current_iteration`/`execution.
max_iterations` is the one Execution Mode actually reads and increments. The full field
catalog for both lives in `l00prite-config-and-flags` (Part A) — this skill only needs you to
not conflate them while reading a pre-flight display or a stopped run's counters.

`heartbeat.json`'s top-level `stop_conditions` and `execution.run_boundaries` are
**deliberately different fields with different vocabularies** — this project's own do-not-
retry record (`.l00prite/failures.md`) names the earlier, rejected design explicitly: "Naming
the execution boundary list `stop_conditions`: heartbeat.json already has a top-level
`stop_conditions` with different semantics; the collision made governance ambiguous. It is
`run_boundaries`." If you ever see code or a doc conflate the two, that's the bug, not a
naming choice to preserve.

A project with no `execution` block at all is not broken — it's a v1 project (or a heartbeat
predating this feature). "Execution disabled" is the correct, safe reading of a missing block;
step 4 of the pre-flight (§3) is exactly the migration path, and it always defaults to
disarmed.

`lock.json` has stayed at `schema_version: 1` throughout — its own field shape (`lock_id`,
`owner_agent`, `expires_at`, `ttl_seconds`, `status`, etc., per `LOCKING.md`) never needed a
matching bump when `heartbeat.json`/`state.json` went to 2, since the execution block is not a
lock concept. Seeing `lock.json` at version 1 next to a version-2 `heartbeat.json` is not, by
itself, a sign that anything is out of date — the three files' schema numbers are independent
of each other and track their own fields, not one shared protocol version.

---

## Provenance and maintenance

All facts below are dated **2026-07-06**; re-verify anything you rely on, especially engine
behavior, which is more likely than the prompt text to change across `cli-os` releases.

| Fact stated in this skill | Re-verification command |
|---|---|
| The full pre-flight gate text (steps 1-7), the nine boundaries, the exit/mode-exit rules, hard rules during a run | Read `.l00prite/prompts/execute-loop.md` in your own project (or, in the l00prite repo, `templates/l00prite/prompts/execute-loop.md`) directly — it is the authority, not this skill |
| The six/seven-way byte-parity of `execute-loop.md` (canonical + mirrors) | (l00prite repo only) `for f in .claude/prompts/execute-loop.md .codex/prompts/execute-loop.md templates/claude/prompts/execute-loop.md templates/codex/prompts/execute-loop.md .l00prite/prompts/execute-loop.md examples/vendor-neutral-output/.l00prite/prompts/execute-loop.md; do cmp templates/l00prite/prompts/execute-loop.md "$f"; done` (no output = identical) |
| `preflight_confirmed`/`enabled` are forgeable audit records, never authorization; headless sessions cannot enter Execution Mode | `grep -n "forgeable\|Headless" .l00prite/memory.md` (l00prite repo) or your own project's `memory.md`/decision log if it records the same rationale |
| Engine's strict `confirm:"EXECUTE"` string match | `grep -n 'TrimSpace(confirm)' cli-os/internal/engine/engine.go` |
| The disarmed default shape and all nine `run_boundaries` names | `cat templates/l00prite/heartbeat.json` (l00prite repo) or your own project's `.l00prite/heartbeat.json` |
| Doctor's arming-consistency FAIL/WARN wording and the no-progress stall check | `sed -n '133,300p' scripts/l00prite-doctor.js` (l00prite repo — this file is dependency-free and copy-able into any project per `l00prite-adopting`) |
| Doctor run against this repo's own `.l00prite/` and against the shipped example | `node scripts/l00prite-doctor.js .` and `node scripts/l00prite-doctor.js examples/vendor-neutral-output` (both l00prite repo; expect `HEALTHY`, 0 fail) |
| `stop_conditions` vs `run_boundaries` naming-collision rationale | `grep -n "stop_conditions" .l00prite/failures.md` (l00prite repo) |
| `lock.json` stays `schema_version: 1` by design (independent of heartbeat/state's v2 bump) | `jq .schema_version templates/l00prite/lock.json templates/l00prite/heartbeat.json templates/l00prite/state.json` (l00prite repo) — compare against `LOCKING.md`'s field list, which has not changed |
| Engine mode-entry/iteration/boundary/self-modification mechanisms, function-by-function | `cli-os/internal/engine/engine.go`, `preflight.go`, `exec.go`, `tools.go`, `l00pfiles.go`, `types.go`; the protocol-conformance table in `cli-os/docs/os-architecture.md` §2.2 |
| Denylist/protocol-file hard-deny layering (`protocolProtected` before the Denylist gate) | `grep -n "func protocolProtected" -A 8 cli-os/internal/engine/tools.go` |
| Approval timeout → `destructive_operation_required` for every gate class; explicit deny → skip, not a stop | `grep -n "func (e \*Engine) awaitApproval" -A 45 cli-os/internal/engine/exec.go` |
| `deploy`/`credential_change`/`outside_repo` gate classes declared but never constructed as of this date | `grep -n "GateRequest{" -B2 cli-os/internal/engine/tools.go` (only 3 call sites; none use those 3 classes) |
| `lock_lease_conflict` writes nothing to the target repo (only the engine's own SQLite row) | `grep -n "BoundaryLockConflict" -B3 -A6 cli-os/internal/engine/engine.go` and `grep -n "func (s \*Store) FinishRun" -A4 cli-os/internal/engine/store.go` |
| Approval default timeout 900s, iteration budget default 25 clamped 1-100, no-progress default 3 | `sed -n '60,86p' cli-os/internal/engine/store.go` |
| The five engine integration tests behind this skill's claims all pass | `cd cli-os && go test ./internal/engine/... -run 'TestRunReachesDefinitionOfDone|TestRunDenylistWriteBlocksOnDeny|TestStartRequiresFreshPreflightAndConfirm|TestReconcileOrphansAfterCrash|TestDecideRejectsCrossRunApproval' -v` |
