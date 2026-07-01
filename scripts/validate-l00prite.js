#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failed = false;

function check(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
  } else {
    console.error(`FAIL ${message}`);
    failed = true;
  }
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const required = [
  '.claude/commands/build-loop.md',
  '.claude/README.md',
  '.codex/README.md',
  '.codex/prompts/build-loop.md',
  '.codex/prompts/resume-loop.md',
  '.codex/prompts/heartbeat.md',
  '.codex/prompts/event-loop.md',
  '.codex/prompts/respond-to-review.md',
  '.codex/prompts/handoff-summary.md',
  '.claude/prompts/event-loop.md',
  '.claude/prompts/respond-to-review.md',
  '.claude/prompts/resume-loop.md',
  '.claude/prompts/heartbeat.md',
  '.claude/prompts/handoff-summary.md',
  'templates/codex/prompts/resume-loop.md',
  'templates/codex/prompts/heartbeat.md',
  'templates/codex/prompts/event-loop.md',
  'templates/codex/prompts/respond-to-review.md',
  'templates/codex/prompts/handoff-summary.md',
  'templates/CLAUDE.md.template',
  'README.md',
  'AGENTS.md',
  'HANDOFF.md'
];

const memoryFiles = [
  'templates/l00prite/README.md',
  'templates/l00prite/blueprint.md',
  'templates/l00prite/ledger.md',
  'templates/l00prite/memory.md',
  'templates/l00prite/heartbeat.json',
  'templates/l00prite/constraints.md',
  'templates/l00prite/failures.md',
  'templates/l00prite/todos.md',
  'templates/l00prite/state.json',
  'templates/l00prite/lock.json',
  'templates/l00prite/LOCKING.md',
  'templates/l00prite/sessions/README.md',
  'templates/l00prite/events/README.md',
  'templates/l00prite/events/pending/README.md',
  'templates/l00prite/events/processing/README.md',
  'templates/l00prite/events/completed/README.md',
  'templates/l00prite/events/example-event.json',
  'templates/l00prite/reviews/README.md',
  'templates/l00prite/reviews/github/README.md'
];

const exampleMemoryFiles = memoryFiles.map((rel) => rel.replace('templates/l00prite/', 'examples/vendor-neutral-output/.l00prite/'));
exampleMemoryFiles.push('examples/vendor-neutral-output/CLAUDE.md', 'examples/vendor-neutral-output/README.md');

for (const rel of required.concat(memoryFiles, exampleMemoryFiles)) {
  check(exists(rel), `${rel} exists`);
}

if (exists('README.md')) {
  const readme = read('README.md').toLowerCase();
  check(readme.includes('claude'), 'README mentions Claude');
  check(readme.includes('codex'), 'README mentions Codex');
  check(readme.includes('.l00prite'), 'README documents .l00prite');
  check(readme.includes('lock and lease'), 'README documents the lock and lease model');
  check(readme.includes('lock.json'), 'README mentions lock.json');
}

if (exists('.claude/commands/build-loop.md')) {
  const buildLoop = read('.claude/commands/build-loop.md').toLowerCase();
  check(buildLoop.includes('does not execute'), 'build-loop says it does not execute generated projects');
  check(buildLoop.includes('.l00prite'), 'build-loop generates .l00prite memory');
  check(buildLoop.includes('templates/codex/prompts'), 'build-loop uses target-project Codex prompt templates');
}

const eventPrompts = ['.codex/prompts/event-loop.md', 'templates/codex/prompts/event-loop.md', '.claude/prompts/event-loop.md'];
for (const rel of eventPrompts) {
  if (exists(rel)) {
    const prompt = read(rel).toLowerCase();
    for (const term of ['classify', 'plan', 'execute', 'verify', 'persist', 'respond']) {
      check(prompt.includes(term), `${rel} includes ${term}`);
    }
    check(prompt.includes('one event per loop'), `${rel} limits default processing to one event`);
    check(prompt.includes('untrusted'), `${rel} warns that external content is untrusted`);
    check(!prompt.includes('move or copy'), `${rel} does not use ambiguous move-or-copy language`);
  }
}

const reviewPrompts = ['.codex/prompts/respond-to-review.md', 'templates/codex/prompts/respond-to-review.md', '.claude/prompts/respond-to-review.md'];
for (const rel of reviewPrompts) {
  if (exists(rel)) {
    const prompt = read(rel).toLowerCase();
    check(prompt.includes('do not blindly agree'), `${rel} forbids blindly agreeing with reviewers`);
    check(prompt.includes('do not push or merge'), `${rel} forbids push or merge without instruction`);
    check(prompt.includes('verification'), `${rel} requires verification before completion`);
    check(prompt.includes('untrusted'), `${rel} warns that external content is untrusted`);
    check(!prompt.includes('move or copy'), `${rel} does not use ambiguous move-or-copy language`);
  }
}

const lockAwarePrompts = [
  '.codex/prompts/resume-loop.md', 'templates/codex/prompts/resume-loop.md', '.claude/prompts/resume-loop.md',
  '.codex/prompts/heartbeat.md', 'templates/codex/prompts/heartbeat.md', '.claude/prompts/heartbeat.md',
  ...eventPrompts, ...reviewPrompts
];
for (const rel of lockAwarePrompts) {
  if (exists(rel)) {
    const prompt = read(rel).toLowerCase();
    check(prompt.includes('lock.json'), `${rel} checks lock.json before mutating memory`);
  }
}

for (const rel of ['templates/l00prite/events/README.md', 'templates/l00prite/events/processing/README.md', 'templates/l00prite/events/completed/README.md']) {
  if (exists(rel)) {
    const doc = read(rel).toLowerCase();
    check(!doc.includes('move or copy'), `${rel} does not use ambiguous move-or-copy language`);
  }
}

if (exists('templates/l00prite/events/README.md')) {
  const eventsDoc = read('templates/l00prite/events/README.md').toLowerCase();
  check(eventsDoc.includes('event-yyyymmdd-hhmmss'), 'events README documents the event ID format');
}

if (exists('templates/l00prite/README.md')) {
  const protocolDoc = read('templates/l00prite/README.md').toLowerCase();
  check(protocolDoc.includes('blocked state wins'), 'protocol README documents blocked-over-should_continue precedence');
  check(protocolDoc.includes('lock'), 'protocol README documents lock precedence');
}

if (exists('templates/l00prite/ledger.md')) {
  const ledger = read('templates/l00prite/ledger.md').toLowerCase();
  for (const field of ['goal', 'triggering event', 'reviewer/comment reference', 'decision', 'fix implemented', 'tests run', 'response drafted/sent', 'event status', 'failures', 'next action', 'command', 'exit_code', 'evidence_path', 'timestamp', 'lock:']) {
    check(ledger.includes(field), `ledger template contains ${field}`);
  }
}

const jsonTemplates = ['templates/l00prite/heartbeat.json', 'templates/l00prite/state.json', 'templates/l00prite/events/example-event.json', 'templates/l00prite/lock.json'];
for (const rel of jsonTemplates) {
  try {
    const data = JSON.parse(read(rel));
    check(true, `${rel} is valid JSON`);
    check(Object.prototype.hasOwnProperty.call(data, 'schema_version'), `${rel} contains schema_version`);
  } catch (error) {
    check(false, `${rel} is valid JSON: ${error.message}`);
  }
}

if (exists('templates/l00prite/state.json')) {
  const state = JSON.parse(read('templates/l00prite/state.json'));
  for (const field of ['active_event_id', 'last_event_processed', 'pending_event_count', 'review_response_required', 'ci_status']) {
    check(Object.prototype.hasOwnProperty.call(state, field), `state.json contains ${field}`);
  }
}

if (exists('templates/l00prite/events/example-event.json')) {
  const event = JSON.parse(read('templates/l00prite/events/example-event.json'));
  for (const field of ['id', 'type', 'source', 'status', 'priority', 'verification_required', 'response_required', 'do_not_retry', 'notes', 'resolved_at', 'resolving_agent', 'verification_summary', 'response_summary', 'related_commit', 'outcome']) {
    check(Object.prototype.hasOwnProperty.call(event, field), `example-event.json contains ${field}`);
  }
  check(typeof event.id === 'string' && /^event-\d{8}-\d{6}-/.test(event.id), 'example-event.json id follows event-YYYYMMDD-HHMMSS-... format');
}

if (exists('templates/l00prite/lock.json')) {
  const lock = JSON.parse(read('templates/l00prite/lock.json'));
  for (const field of ['schema_version', 'lock_id', 'owner_agent', 'owner_session', 'acquired_at', 'expires_at', 'ttl_seconds', 'purpose', 'protected_paths', 'status']) {
    check(Object.prototype.hasOwnProperty.call(lock, field), `lock.json contains ${field}`);
  }
}

process.exit(failed ? 1 : 0);
