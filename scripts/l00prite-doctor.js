#!/usr/bin/env node
//
// l00prite-doctor — a read-only health check for a scaffolded project's .l00prite/ memory.
//
// Where scripts/validate-l00prite.js validates THIS repo (the protocol source), the doctor
// validates a TARGET project that was scaffolded with l00prite: it reads the project's
// .l00prite/ folder and reports whether the memory is internally consistent and safe to
// resume or arm. It is dependency-free (Node standard library only), strictly READ-ONLY
// (it never writes, and never "fixes" anything), and it exits non-zero only when a
// fail-level problem is found — so it is safe to run in CI or before arming an
// Execution Mode run.
//
//   node scripts/l00prite-doctor.js [path-to-project]   # default: current directory
//
// The check for prompt-mirror drift compares the project's OWN .l00prite/prompts against its
// OWN .claude/.codex mirrors (self-parity) — never against a hash of l00prite's canonical
// prompts, so it stays correct across legitimate protocol upgrades.

'use strict';

const fs = require('fs');
const path = require('path');

const targetArg = process.argv[2] || '.';
const root = path.resolve(targetArg);
const lp = path.join(root, '.l00prite');

const findings = [];
function ok(msg) { findings.push({ level: 'ok', msg }); }
function warn(msg, fix) { findings.push({ level: 'warn', msg, fix }); }
function fail(msg, fix) { findings.push({ level: 'fail', msg, fix }); }

function existsL(rel) { return fs.existsSync(path.join(root, rel)); }
function readL(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function readJSON(rel) {
  try { return { ok: true, data: JSON.parse(readL(rel)) }; }
  catch (e) { return { ok: false, err: e.message }; }
}

const PROMPT_NAMES = ['resume-loop', 'heartbeat', 'event-loop', 'respond-to-review', 'handoff-summary', 'execute-loop'];
const RUN_BOUNDARY_IDS = [
  'definition_of_done_met', 'iteration_limit_reached', 'human_review_gate',
  'destructive_operation_required', 'ambiguous_requirements', 'unfixable_failing_tests',
  'missing_secrets_or_credentials', 'lock_lease_conflict', 'stop_signal'
];
const REQUIRED_MEMORY = [
  'blueprint.md', 'ledger.md', 'memory.md', 'constraints.md',
  'failures.md', 'todos.md', 'heartbeat.json', 'state.json', 'lock.json', 'LOCKING.md'
];

// ---------------------------------------------------------------------------
// 0. Is this a l00prite project at all?
// ---------------------------------------------------------------------------
if (!fs.existsSync(lp)) {
  console.error(`l00prite-doctor: no .l00prite/ folder found at ${root}`);
  console.error('This does not look like a l00prite-scaffolded project. Run build-loop first,');
  console.error('or pass the project root as the first argument.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 1. Required memory files exist and are non-empty (fail on missing/empty).
// ---------------------------------------------------------------------------
for (const name of REQUIRED_MEMORY) {
  const rel = `.l00prite/${name}`;
  if (!existsL(rel)) {
    fail(`missing required memory file: ${rel}`, `restore ${rel} from templates/l00prite/${name}`);
  } else if (readL(rel).trim().length === 0) {
    fail(`empty memory file: ${rel}`, `re-scaffold or fill ${rel}`);
  } else {
    ok(`memory file present: ${name}`);
  }
}
for (const dir of ['prompts', 'events', 'reviews', 'sessions']) {
  if (existsL(`.l00prite/${dir}`)) ok(`memory folder present: ${dir}/`);
  else warn(`missing memory folder: .l00prite/${dir}/`, `create .l00prite/${dir}/ (copy from templates/l00prite/${dir}/)`);
}

// ---------------------------------------------------------------------------
// 2. Unfilled template placeholders (warn — a scaffold that was never customized).
// ---------------------------------------------------------------------------
for (const rel of ['.l00prite/blueprint.md', '.l00prite/memory.md']) {
  if (existsL(rel)) {
    const txt = readL(rel);
    if (txt.includes('{{') || /replace-with-/i.test(txt)) {
      warn(`${rel} still contains template placeholders`, `fill in ${rel} before arming a run`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. JSON files parse (fail on parse error). heartbeat + state + lock + events.
// ---------------------------------------------------------------------------
const hbR = existsL('.l00prite/heartbeat.json') ? readJSON('.l00prite/heartbeat.json') : { ok: false, err: 'absent' };
const stR = existsL('.l00prite/state.json') ? readJSON('.l00prite/state.json') : { ok: false, err: 'absent' };
const lkR = existsL('.l00prite/lock.json') ? readJSON('.l00prite/lock.json') : { ok: false, err: 'absent' };
for (const [label, r] of [['heartbeat.json', hbR], ['state.json', stR], ['lock.json', lkR]]) {
  if (r.ok) ok(`${label} is valid JSON`);
  else fail(`${label} does not parse: ${r.err}`, `fix the JSON syntax in .l00prite/${label}`);
}
const hb = hbR.ok ? hbR.data : null;
const st = stR.ok ? stR.data : null;
const lock = lkR.ok ? lkR.data : null;

// Event JSON files parse.
const pendingDir = path.join(lp, 'events', 'pending');
let pendingEventFiles = [];
if (fs.existsSync(pendingDir)) {
  pendingEventFiles = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
  for (const f of pendingEventFiles) {
    try { JSON.parse(fs.readFileSync(path.join(pendingDir, f), 'utf8')); }
    catch (e) { fail(`events/pending/${f} does not parse: ${e.message}`, `fix the JSON in that event file`); }
  }
}

// ---------------------------------------------------------------------------
// 4. Execution block + arming consistency (the core safety check).
//    Mirrors validate-l00prite.js: enabled/active is legal ONLY with a matching active,
//    unexpired execute-loop lock; otherwise a crashed run left arming state committed.
// ---------------------------------------------------------------------------
const exec = hb && hb.execution && typeof hb.execution === 'object' ? hb.execution : null;
if (hb && !exec) {
  warn('heartbeat.json has no execution block (v1 schema)', 'execute-loop migrates it under lock; a missing block means Execution Mode is disabled');
} else if (exec) {
  ok('heartbeat.json carries the execution block');
  const boundaries = Array.isArray(exec.run_boundaries) ? exec.run_boundaries : [];
  const missing = RUN_BOUNDARY_IDS.filter((id) => !boundaries.includes(id));
  if (missing.length) warn(`execution.run_boundaries missing: ${missing.join(', ')}`, 'restore the full run_boundaries list from templates/l00prite/heartbeat.json');
  else ok('execution.run_boundaries lists all nine boundaries');
  if (!(typeof exec.max_iterations === 'number' && exec.max_iterations > 0)) {
    warn('execution.max_iterations is not a positive number', 'set a bounded max_iterations — never leave a run unbounded');
  }
}

if (hb && st) {
  const enabled = exec ? exec.enabled === true : false;
  const active = st.execution_active === true;

  // Is there a matching active, unexpired execute-loop lock right now?
  let lockActiveExecute = false;
  if (lock) {
    const notExpired = typeof lock.expires_at === 'string' && Date.parse(lock.expires_at) > Date.now();
    lockActiveExecute = lock.status === 'active' && notExpired &&
      typeof lock.purpose === 'string' && lock.purpose.includes('execute-loop');
  }

  if (enabled !== active) {
    fail(`arming mismatch: heartbeat execution.enabled=${enabled} but state.execution_active=${active}`,
      'set both to false and record the reconciliation in ledger.md, or re-run execute-loop pre-flight');
  } else if (enabled || active) {
    if (lockActiveExecute) {
      ok('Execution Mode is armed under a matching active execute-loop lock (mid-run)');
    } else {
      fail('Execution Mode is armed but no active, unexpired execute-loop lock backs it — a crashed run left arming state committed',
        'execute-loop pre-flight stale-run recovery will reset this; or set execution.enabled=false / execution_active=false and log it');
    }
  } else {
    ok('Execution Mode ships disarmed (enabled=false, execution_active=false)');
  }

  // preflight_confirmed left true while disarmed and unlocked is a stale audit artifact.
  if (exec && exec.preflight_confirmed === true && !enabled && !lockActiveExecute) {
    warn('execution.preflight_confirmed is true while Execution Mode is disarmed', 'a persisted preflight flag never authorizes a run; it is safe but stale — the next pre-flight overwrites it');
  }

  // blocked must win over should_continue.
  if (st.blocked === true && hb.should_continue === true) {
    warn('state.blocked is true while heartbeat.should_continue is true', 'blocked wins by protocol — ensure the loop stops, and clear one of the two signals');
  }
}

// ---------------------------------------------------------------------------
// 5. Lock sanity (warn only — a stale active lock is reclaimable, not fatal).
// ---------------------------------------------------------------------------
if (lock) {
  const required = ['schema_version', 'lock_id', 'acquired_at', 'expires_at', 'ttl_seconds', 'status', 'protected_paths'];
  const missing = required.filter((f) => !Object.prototype.hasOwnProperty.call(lock, f));
  if (missing.length) warn(`lock.json missing fields: ${missing.join(', ')}`, 'restore the lock.json shape from templates/l00prite/lock.json');
  if (lock.status === 'active' && typeof lock.expires_at === 'string' && Date.parse(lock.expires_at) <= Date.now()) {
    warn('lock.json is "active" but expired', 'the next agent may reclaim it and log the reclamation per LOCKING.md');
  }
}

// ---------------------------------------------------------------------------
// 6. Event bookkeeping: pending file count vs state.pending_event_count (State Rot).
// ---------------------------------------------------------------------------
if (st && Object.prototype.hasOwnProperty.call(st, 'pending_event_count')) {
  if (st.pending_event_count !== pendingEventFiles.length) {
    warn(`state.pending_event_count=${st.pending_event_count} but events/pending/ holds ${pendingEventFiles.length} event file(s)`,
      'reconcile the counter with the files — a common State Rot signal');
  } else {
    ok(`pending event count matches events/pending/ (${pendingEventFiles.length})`);
  }
}

// ---------------------------------------------------------------------------
// 7. Ledger verification evidence (Verifier Theater). Heuristic, warn-level.
// ---------------------------------------------------------------------------
if (existsL('.l00prite/ledger.md')) {
  const ledger = readL('.l00prite/ledger.md');
  const substantive = ledger.replace(/\s+/g, ' ').trim().length > 400;
  const hasEvidence = /(exit_code|exit code|command|tests? run|verified|verification|evidence_path)/i.test(ledger);
  if (substantive && !hasEvidence) {
    warn('ledger.md has run history but no visible verification evidence (command/exit_code/tests)', 'record command + exit_code + timestamp per ledger entry — otherwise "verified" is unaudited');
  } else if (substantive) {
    ok('ledger.md entries carry verification evidence');
  }
}

// ---------------------------------------------------------------------------
// 8. Seeded failure catalog + Autonomous-Edit Denylist present (loop wisdom + path safety).
// ---------------------------------------------------------------------------
if (existsL('.l00prite/failures.md')) {
  if (/inherited loop failure modes/i.test(readL('.l00prite/failures.md'))) ok('failures.md carries the inherited failure-mode catalog');
  else warn('failures.md is missing the inherited failure-mode catalog', 'seed it from templates/l00prite/failures.md so a fresh agent reads known failure modes');
}
if (existsL('.l00prite/constraints.md')) {
  if (/autonomous-edit denylist/i.test(readL('.l00prite/constraints.md'))) ok('constraints.md defines an Autonomous-Edit Denylist');
  else warn('constraints.md has no Autonomous-Edit Denylist', 'add a machine-readable protected-paths block so Execution Mode cannot edit secrets/auth/migrations without review');
}

// ---------------------------------------------------------------------------
// 9. No-progress stall telemetry (thrash circuit-breaker observability).
// ---------------------------------------------------------------------------
if (exec) {
  const isp = typeof exec.iterations_since_progress === 'number' ? exec.iterations_since_progress : 0;
  const threshold = typeof exec.no_progress_threshold === 'number' && exec.no_progress_threshold > 0 ? exec.no_progress_threshold : 3;
  if (isp >= threshold) {
    const active = st && st.execution_active === true;
    const msg = `execution.iterations_since_progress=${isp} has reached the no_progress_threshold (${threshold}) — the loop may be thrashing`;
    if (active) fail(msg, 'stop and escalate through human_review_gate; diagnose why no unit is closing before resuming');
    else warn(msg, 'leftover stall telemetry from a prior run; investigate before re-arming');
  }
}

// ---------------------------------------------------------------------------
// 10. Prompt-mirror self-parity (drift). Compare the project's OWN copies.
// ---------------------------------------------------------------------------
const mirrorDirs = ['.claude/prompts', '.codex/prompts'].filter((d) => existsL(d));
if (existsL('.l00prite/prompts') && mirrorDirs.length) {
  let drift = 0, compared = 0;
  const names = [...PROMPT_NAMES, 'README'];
  for (const name of names) {
    const base = `.l00prite/prompts/${name}.md`;
    if (!existsL(base)) continue;
    const baseContent = readL(base);
    for (const dir of mirrorDirs) {
      const mirror = `${dir}/${name}.md`;
      if (existsL(mirror)) {
        compared++;
        if (readL(mirror) !== baseContent) {
          drift++;
          fail(`prompt drift: ${mirror} differs from .l00prite/prompts/${name}.md`, `re-copy the canonical prompt so mirrors are byte-identical`);
        }
      }
    }
  }
  if (compared && !drift) ok(`prompt mirrors are byte-identical to .l00prite/prompts (${compared} compared)`);
} else if (existsL('.l00prite/prompts')) {
  ok('prompt self-parity skipped (no .claude/.codex prompt mirrors in this project)');
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const counts = { ok: 0, warn: 0, fail: 0 };
for (const f of findings) counts[f.level]++;

const LABEL = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL' };
console.log(`l00prite-doctor — ${lp}\n`);
for (const f of findings) {
  console.log(`${LABEL[f.level]}  ${f.msg}`);
  if (f.fix && f.level !== 'ok') console.log(`      ↳ ${f.fix}`);
}
console.log(`\n${counts.ok} ok · ${counts.warn} warn · ${counts.fail} fail`);

let verdict;
if (counts.fail > 0) verdict = `UNHEALTHY — ${counts.fail} blocking issue(s); resolve before resuming or arming a run.`;
else if (counts.warn > 0) verdict = `OK WITH WARNINGS — ${counts.warn} advisory item(s); review before an unattended run.`;
else verdict = 'HEALTHY — .l00prite/ memory is consistent and Execution Mode ships disarmed.';
console.log(verdict);

process.exit(counts.fail > 0 ? 1 : 0);
