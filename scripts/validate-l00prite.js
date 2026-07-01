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
  '.codex/README.md',
  '.codex/prompts/build-loop.md',
  '.codex/prompts/resume-loop.md',
  '.codex/prompts/heartbeat.md',
  '.codex/prompts/handoff-summary.md',
  'templates/CLAUDE.md.template',
  'README.md',
  'AGENTS.md',
  'HANDOFF.md'
];

const memoryFiles = [
  'templates/l00prite/blueprint.md',
  'templates/l00prite/ledger.md',
  'templates/l00prite/memory.md',
  'templates/l00prite/heartbeat.json',
  'templates/l00prite/constraints.md',
  'templates/l00prite/failures.md',
  'templates/l00prite/todos.md',
  'templates/l00prite/state.json',
  'templates/l00prite/sessions/README.md'
];

for (const rel of required.concat(memoryFiles)) {
  check(exists(rel), `${rel} exists`);
}

if (exists('README.md')) {
  const readme = read('README.md').toLowerCase();
  check(readme.includes('claude'), 'README mentions Claude');
  check(readme.includes('codex'), 'README mentions Codex');
  check(readme.includes('.l00prite'), 'README documents .l00prite');
}

if (exists('.claude/commands/build-loop.md')) {
  const buildLoop = read('.claude/commands/build-loop.md').toLowerCase();
  check(buildLoop.includes('does not execute'), 'build-loop says it does not execute generated projects');
  check(buildLoop.includes('.l00prite'), 'build-loop generates .l00prite memory');
}

if (exists('templates/l00prite/ledger.md')) {
  const ledger = read('templates/l00prite/ledger.md').toLowerCase();
  for (const field of ['goal', 'completed work', 'tests run', 'failures', 'next action']) {
    check(ledger.includes(field), `ledger template contains ${field}`);
  }
}

for (const rel of ['templates/l00prite/heartbeat.json', 'templates/l00prite/state.json']) {
  try {
    JSON.parse(read(rel));
    check(true, `${rel} is valid JSON`);
  } catch (error) {
    check(false, `${rel} is valid JSON: ${error.message}`);
  }
}

process.exit(failed ? 1 : 0);
