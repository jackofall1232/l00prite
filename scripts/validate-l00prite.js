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

// The target-project payload lives under templates/l00prite/, which mirrors the l00prite/
// folder build-loop creates at a target repo's root: a human-facing README plus the
// .l00prite/ memory folder (with the canonical prompts inside it).
const TPL = 'templates/l00prite/.l00prite';
const EX = 'examples/vendor-neutral-output';
const EXL = `${EX}/l00prite/.l00prite`;

const required = [
  '.claude/commands/build-loop.md',
  '.claude/commands/execute-loop.md',
  '.claude/README.md',
  '.codex/README.md',
  '.codex/prompts/build-loop.md',
  '.codex/prompts/resume-loop.md',
  '.codex/prompts/heartbeat.md',
  '.codex/prompts/event-loop.md',
  '.codex/prompts/respond-to-review.md',
  '.codex/prompts/handoff-summary.md',
  '.codex/prompts/execute-loop.md',
  '.claude/prompts/event-loop.md',
  '.claude/prompts/respond-to-review.md',
  '.claude/prompts/resume-loop.md',
  '.claude/prompts/heartbeat.md',
  '.claude/prompts/handoff-summary.md',
  '.claude/prompts/execute-loop.md',
  'templates/codex/prompts/resume-loop.md',
  'templates/codex/prompts/heartbeat.md',
  'templates/codex/prompts/event-loop.md',
  'templates/codex/prompts/respond-to-review.md',
  'templates/codex/prompts/handoff-summary.md',
  'templates/codex/prompts/execute-loop.md',
  'templates/claude/prompts/resume-loop.md',
  'templates/claude/prompts/heartbeat.md',
  'templates/claude/prompts/event-loop.md',
  'templates/claude/prompts/respond-to-review.md',
  'templates/claude/prompts/handoff-summary.md',
  'templates/claude/prompts/execute-loop.md',
  'templates/CLAUDE.md.template',
  'templates/AGENTS.md.template',
  'templates/vendors.json',
  'templates/adapters/README.md',
  'templates/adapters/pointer-AGENTS.md',
  'templates/adapters/pointer-CLAUDE.md',
  'README.md',
  'AGENTS.md',
  'HANDOFF.md',
  `${EX}/l00prite/AGENTS.md`
];

const PROMPT_NAMES = ['resume-loop', 'heartbeat', 'event-loop', 'respond-to-review', 'handoff-summary', 'execute-loop'];

const memoryFiles = [
  'templates/l00prite/README.md',
  `${TPL}/README.md`,
  `${TPL}/blueprint.md`,
  `${TPL}/ledger.md`,
  `${TPL}/memory.md`,
  `${TPL}/heartbeat.json`,
  `${TPL}/constraints.md`,
  `${TPL}/failures.md`,
  `${TPL}/todos.md`,
  `${TPL}/state.json`,
  `${TPL}/lock.json`,
  `${TPL}/LOCKING.md`,
  `${TPL}/prompts/README.md`,
  ...PROMPT_NAMES.map((p) => `${TPL}/prompts/${p}.md`),
  `${TPL}/sessions/README.md`,
  `${TPL}/events/README.md`,
  `${TPL}/events/pending/README.md`,
  `${TPL}/events/processing/README.md`,
  `${TPL}/events/completed/README.md`,
  `${TPL}/events/example-event.json`,
  `${TPL}/reviews/README.md`,
  `${TPL}/reviews/github/README.md`
];

const exampleMemoryFiles = memoryFiles.map((rel) => rel.replace('templates/l00prite/', `${EX}/l00prite/`));
exampleMemoryFiles.push(`${EX}/l00prite/CLAUDE.md`, `${EX}/README.md`);

// This repo dogfoods its own protocol at the repo root (its memory folder is ./.l00prite/,
// not nested under a l00prite/ wrapper — the wrapper is target-project layout only): the
// loop prompts and the live memory files whose content is asserted below must exist in
// .l00prite/ too — otherwise those content checks would skip silently.
const ownDogfoodFiles = [
  '.l00prite/prompts/README.md',
  ...PROMPT_NAMES.map((p) => `.l00prite/prompts/${p}.md`),
  '.l00prite/heartbeat.json',
  '.l00prite/state.json',
  '.l00prite/lock.json',
  '.l00prite/LOCKING.md'
];

for (const rel of required.concat(memoryFiles, exampleMemoryFiles, ownDogfoodFiles)) {
  check(exists(rel), `${rel} exists`);
}

// ---------------------------------------------------------------------------
// Byte-parity: the loop prompts have ONE canonical source. Every mirror must be
// byte-identical to it. If a check below fails: edit the canonical file at
// templates/l00prite/.l00prite/prompts/<name>.md, then re-copy the mirrors.
// ---------------------------------------------------------------------------
const MIRROR_DIRS = [
  '.claude/prompts',
  '.codex/prompts',
  'templates/claude/prompts',
  'templates/codex/prompts',
  '.l00prite/prompts',
  `${EXL}/prompts`
];
for (const name of PROMPT_NAMES) {
  const canonical = `${TPL}/prompts/${name}.md`;
  if (!exists(canonical)) continue;
  const canonicalContent = read(canonical);
  for (const dir of MIRROR_DIRS) {
    const mirror = `${dir}/${name}.md`;
    if (exists(mirror)) {
      check(read(mirror) === canonicalContent, `${mirror} is byte-identical to canonical ${canonical}`);
    }
  }
}
for (const dir of ['.l00prite/prompts', `${EXL}/prompts`]) {
  const mirror = `${dir}/README.md`;
  if (exists(`${TPL}/prompts/README.md`) && exists(mirror)) {
    check(read(mirror) === read(`${TPL}/prompts/README.md`), `${mirror} is byte-identical to canonical ${TPL}/prompts/README.md`);
  }
}
// LOCKING.md is one document in three copies — keep them from drifting apart.
for (const mirror of ['.l00prite/LOCKING.md', `${EXL}/LOCKING.md`]) {
  if (exists(`${TPL}/LOCKING.md`) && exists(mirror)) {
    check(read(mirror) === read(`${TPL}/LOCKING.md`), `${mirror} is byte-identical to canonical ${TPL}/LOCKING.md`);
  }
}
// The l00prite/ wrapper README ships verbatim into every target; the example copy must match.
if (exists('templates/l00prite/README.md')) {
  const wrapper = read('templates/l00prite/README.md');
  const low = wrapper.toLowerCase();
  check(low.includes('agents.md'), 'l00prite/ wrapper README points at AGENTS.md');
  check(low.includes('.l00prite'), 'l00prite/ wrapper README documents the memory folder');
  check(low.includes('point'), 'l00prite/ wrapper README explains the root pointer files');
  const exampleWrapper = `${EX}/l00prite/README.md`;
  if (exists(exampleWrapper)) {
    check(read(exampleWrapper) === wrapper, `${exampleWrapper} is byte-identical to templates/l00prite/README.md`);
  }
}
// The prompts carry a path-convention note so the same bytes are correct both in a target
// (memory at l00prite/.l00prite/) and in this source repo (memory at ./.l00prite/).
for (const name of PROMPT_NAMES) {
  const canonical = `${TPL}/prompts/${name}.md`;
  if (exists(canonical)) {
    const low = read(canonical).toLowerCase().replace(/\s+/g, ' ');
    check(low.includes('path convention'), `${canonical} carries the protocol-root path convention note`);
    check(low.includes('l00prite/.l00prite'), `${canonical} names the scaffolded l00prite/.l00prite/ layout`);
  }
}

// ---------------------------------------------------------------------------
// README documents the protocol, both modes, and the vendor coverage.
// ---------------------------------------------------------------------------
if (exists('README.md')) {
  const readme = read('README.md').toLowerCase();
  check(readme.includes('claude'), 'README mentions Claude');
  check(readme.includes('codex'), 'README mentions Codex');
  check(readme.includes('.l00prite'), 'README documents .l00prite');
  check(readme.includes('lock and lease'), 'README documents the lock and lease model');
  check(readme.includes('lock.json'), 'README mentions lock.json');
  for (const vendor of ['gemini', 'copilot', 'cursor', 'windsurf', 'aider', 'grok', 'agents.md']) {
    check(readme.includes(vendor), `README mentions ${vendor}`);
  }
  check(readme.includes('planning mode'), 'README documents Planning Mode');
  check(readme.includes('execution mode'), 'README documents Execution Mode');
  check(readme.includes('pre-flight'), 'README documents the pre-flight gate');
  check(readme.includes('run boundar'), 'README documents run boundaries');
  check(readme.includes('byte-identical'), 'README documents byte-identical prompt mirrors');
  check(readme.includes('l00prite/.l00prite'), 'README documents the l00prite/ target layout');
}

// ---------------------------------------------------------------------------
// build-loop (BOTH variants): Planning Mode never executes; --execute is a
// gate-only handoff that never pre-arms; the scaffold nests the payload under
// l00prite/ and places root pointers.
// ---------------------------------------------------------------------------
const buildLoops = ['.claude/commands/build-loop.md', '.codex/prompts/build-loop.md'];
for (const rel of buildLoops) {
  if (exists(rel)) {
    const buildLoop = read(rel).toLowerCase();
    check(buildLoop.includes('does not execute'), `${rel} says it does not execute generated projects`);
    check(buildLoop.includes('.l00prite'), `${rel} generates .l00prite memory`);
    check(buildLoop.includes('--execute'), `${rel} documents the --execute flag`);
    check(buildLoop.includes('never pre-arms'), `${rel} states --execute never pre-arms the repo`);
    check(buildLoop.includes('execution.enabled: false'), `${rel} ships execution disarmed`);
    check(buildLoop.includes('agents.md.template'), `${rel} generates AGENTS.md from the template`);
    check(buildLoop.includes('templates/adapters'), `${rel} scaffolds the vendor adapters`);
    check(buildLoop.includes('l00prite/.l00prite/prompts'), `${rel} references the canonical prompt location in the target`);
    check(buildLoop.includes('l00prite/claude.md'), `${rel} writes the blueprint to l00prite/CLAUDE.md`);
    check(buildLoop.includes('l00prite/agents.md'), `${rel} writes the operating guide to l00prite/AGENTS.md`);
    check(buildLoop.includes('pointer-agents.md'), `${rel} places the root AGENTS.md pointer`);
    check(buildLoop.includes('pointer-claude.md'), `${rel} places the root CLAUDE.md pointer`);
    check(buildLoop.includes('.grok/grok.md'), `${rel} scaffolds the Grok CLI adapter`);
    check(!buildLoop.includes('create `.codex/prompts/`') && !buildLoop.includes('create `.claude/prompts/`'), `${rel} does not scaffold vendor prompt mirrors into targets`);
    check(buildLoop.includes('explicit human confirmation') || buildLoop.includes('explicit in-session confirmation'), `${rel} requires explicit confirmation for the Execution Mode handoff`);
  }
}

// ---------------------------------------------------------------------------
// execute-loop: the Execution Mode invariants live in the prompt text.
// Byte-parity above extends these checks to every mirror.
// ---------------------------------------------------------------------------
if (exists(`${TPL}/prompts/execute-loop.md`)) {
  // Normalize whitespace so hard-wrapped phrases still match.
  const ex = read(`${TPL}/prompts/execute-loop.md`).toLowerCase().replace(/\s+/g, ' ');
  check(ex.includes('pre-flight'), 'execute-loop has a pre-flight gate');
  check(ex.includes('does not satisfy this gate'), 'execute-loop: persisted flags never satisfy the gate');
  check(ex.includes('re-confirm every run'), 'execute-loop requires re-confirmation every run');
  check(ex.includes('headless'), 'execute-loop forbids headless entry into Execution Mode');
  const RUN_BOUNDARIES = [
    'definition_of_done_met',
    'iteration_limit_reached',
    'human_review_gate',
    'destructive_operation_required',
    'ambiguous_requirements',
    'unfixable_failing_tests',
    'missing_secrets_or_credentials',
    'lock_lease_conflict',
    'stop_signal'
  ];
  for (const boundary of RUN_BOUNDARIES) {
    check(ex.includes(boundary), `execute-loop defines the ${boundary} run boundary`);
  }
  check(ex.includes('lock.json'), 'execute-loop checks lock.json');
  check(ex.includes('check the lock first'), 'execute-loop checks the lock before any pre-flight write');
  check(ex.includes('the memory files belong to another agent'), 'execute-loop: lock_lease_conflict writes nothing to protected paths');
  check(ex.includes('never raise'), 'execute-loop: the loop may never raise its own limits');
  check(ex.includes('from false to true only via a confirmed pre-flight'), 'execute-loop: should_continue is one-way during a run');
  check(ex.includes('per-action'), 'execute-loop requires per-action permission for push/merge/deploy/credentials');
  check(ex.includes('not a blanket grant'), 'execute-loop: pre-flight confirmation is not a blanket grant');
  check(ex.includes('untrusted'), 'execute-loop warns that external content is untrusted');
  check(ex.includes('never expand scope'), 'execute-loop: events may never expand run scope');
  check(ex.includes('one unit per iteration'), 'execute-loop works one unit per iteration');
  check(ex.includes('always means execution is disabled'), 'execute-loop: missing execution block means disabled');
  check(ex.includes('resumable'), 'execute-loop exits are resumable');
}
if (exists('.claude/commands/execute-loop.md')) {
  const cmd = read('.claude/commands/execute-loop.md').toLowerCase();
  check(cmd.includes('pre-flight'), '.claude/commands/execute-loop.md enforces the pre-flight gate');
  check(cmd.includes('re-confirm every run'), '.claude/commands/execute-loop.md requires re-confirmation every run');
  check(cmd.includes('.l00prite/prompts/execute-loop.md'), '.claude/commands/execute-loop.md defers to the canonical prompt');
  check(cmd.includes('l00prite/.l00prite/prompts/execute-loop.md'), '.claude/commands/execute-loop.md knows the scaffolded target prompt location');
}

// ---------------------------------------------------------------------------
// Templates: the generated l00prite/CLAUDE.md and l00prite/AGENTS.md carry the
// protocol rules.
// ---------------------------------------------------------------------------
if (exists('templates/CLAUDE.md.template')) {
  const tpl = read('templates/CLAUDE.md.template').toLowerCase();
  check(tpl.includes('l00prite protocol (fixed'), 'CLAUDE.md.template carries the fixed protocol section');
  check(tpl.includes('lock.json'), 'CLAUDE.md.template mentions lock.json');
  check(tpl.includes('.l00prite/prompts'), 'CLAUDE.md.template points at the canonical prompts');
  check(tpl.includes('l00prite/.l00prite'), 'CLAUDE.md.template locates the memory under l00prite/');
  check(tpl.includes('untrusted'), 'CLAUDE.md.template carries the untrusted-content rule');
}
if (exists('templates/AGENTS.md.template')) {
  const tpl = read('templates/AGENTS.md.template');
  const low = tpl.toLowerCase();
  check(tpl.includes('{{project_name}}') && tpl.includes('{{mission_line}}'), 'AGENTS.md.template has exactly its two placeholders');
  check(low.includes('.l00prite'), 'AGENTS.md.template documents .l00prite');
  check(low.includes('lock.json'), 'AGENTS.md.template mentions lock.json');
  check(low.includes('untrusted'), 'AGENTS.md.template carries the untrusted-content rule');
  check(low.includes('.l00prite/prompts'), 'AGENTS.md.template points at the canonical prompts');
  check(low.includes('l00prite/.l00prite'), 'AGENTS.md.template locates the memory under l00prite/');
  check(low.includes('execution mode'), 'AGENTS.md.template documents Execution Mode');
  check(low.includes('pre-flight'), 'AGENTS.md.template documents the pre-flight gate');
  check(low.includes('one event per loop'), 'AGENTS.md.template keeps the one-event-per-loop rule');
  check(low.includes('nested'), 'AGENTS.md.template warns about nested AGENTS.md files');
}
if (exists(`${EX}/l00prite/AGENTS.md`)) {
  const ex = read(`${EX}/l00prite/AGENTS.md`);
  check(!ex.includes('{{'), 'example l00prite/AGENTS.md has no leftover placeholders');
  check(!ex.includes('<!--'), 'example l00prite/AGENTS.md dropped the template maintainer comment');
}
if (exists(`${EX}/l00prite/CLAUDE.md`)) {
  const ex = read(`${EX}/l00prite/CLAUDE.md`).toLowerCase();
  check(ex.includes('l00prite protocol (fixed'), 'example l00prite/CLAUDE.md carries the fixed protocol section');
}

// ---------------------------------------------------------------------------
// Vendor manifest + adapters: the vendor set is data. Two kinds of discovery
// file exist:
//  - kind "pointer": thin root-level files that route into l00prite/. The
//    example copy is byte-identical to the template; this source repo's own
//    root copy is NOT (the source repo has no l00prite/ folder), so the
//    dogfood check is existence + required keywords only.
//  - kind "self-sufficient": dot-folder adapters carrying the six rules inline
//    with protocol-root-relative paths — dogfood + example copies must both be
//    byte-identical to the template.
// Entries with generated_from additionally produce the real payload file under
// l00prite/ in a target (example copy checked by keyword, placeholders filled).
// ---------------------------------------------------------------------------
if (exists('templates/vendors.json')) {
  let manifest = null;
  try {
    manifest = JSON.parse(read('templates/vendors.json'));
    check(true, 'templates/vendors.json is valid JSON');
  } catch (error) {
    check(false, `templates/vendors.json is valid JSON: ${error.message}`);
  }
  if (manifest) {
    check(Object.prototype.hasOwnProperty.call(manifest, 'schema_version'), 'vendors.json contains schema_version');
    check(manifest.schema_version === 2, 'vendors.json is schema_version 2 (l00prite/ target layout)');
    check(Array.isArray(manifest.vendors) && manifest.vendors.length > 0, 'vendors.json lists vendors');
    const adapterRefCounts = new Map();
    for (const vendor of manifest.vendors || []) {
      if (vendor.generated_from) {
        check(exists(vendor.generated_from), `${vendor.id}: generator template ${vendor.generated_from} exists`);
        if (vendor.generated_target_path) {
          check(vendor.generated_target_path.startsWith('l00prite/'), `${vendor.id}: generated payload lands under l00prite/ (${vendor.generated_target_path})`);
          const exampleCopy = `${EX}/${vendor.generated_target_path}`;
          check(exists(exampleCopy), `${vendor.id}: generated example ${exampleCopy} exists`);
          if (exists(exampleCopy)) {
            const low = read(exampleCopy).toLowerCase();
            for (const term of vendor.generated_required_strings || []) {
              check(low.includes(String(term).toLowerCase()), `${vendor.id}: ${exampleCopy} contains "${term}"`);
            }
          }
        }
      }
      if (vendor.adapter_template) {
        adapterRefCounts.set(vendor.adapter_template, (adapterRefCounts.get(vendor.adapter_template) || 0) + 1);
        check(exists(vendor.adapter_template), `${vendor.id}: adapter template ${vendor.adapter_template} exists`);
        if (!exists(vendor.adapter_template)) continue;
        const template = read(vendor.adapter_template);
        const low = template.toLowerCase();
        check(vendor.kind === 'pointer' || vendor.kind === 'self-sufficient', `${vendor.id}: adapter declares kind pointer|self-sufficient`);
        for (const term of vendor.required_strings || []) {
          check(low.includes(String(term).toLowerCase()), `${vendor.id}: adapter contains "${term}"`);
        }
        check(template.length < 5500, `${vendor.id}: adapter stays under 5,500 characters (${template.length})`);
        if (vendor.target_path) {
          const exampleCopy = `${EX}/${vendor.target_path}`;
          check(exists(exampleCopy), `${vendor.id}: example copy ${exampleCopy} exists`);
          if (exists(exampleCopy)) {
            check(read(exampleCopy) === template, `${vendor.id}: example ${exampleCopy} is byte-identical to ${vendor.adapter_template}`);
          }
        }
        if (vendor.dogfood_path) {
          check(exists(vendor.dogfood_path), `${vendor.id}: dogfood copy ${vendor.dogfood_path} exists at this repo's root`);
          if (exists(vendor.dogfood_path)) {
            if (vendor.kind === 'self-sufficient') {
              check(read(vendor.dogfood_path) === template, `${vendor.id}: dogfood ${vendor.dogfood_path} is byte-identical to ${vendor.adapter_template}`);
            } else {
              const dogfoodLow = read(vendor.dogfood_path).toLowerCase();
              for (const term of vendor.dogfood_required_strings || []) {
                check(dogfoodLow.includes(String(term).toLowerCase()), `${vendor.id}: dogfood ${vendor.dogfood_path} contains "${term}"`);
              }
            }
          }
        }
      }
      // Vendors with neither adapter_template nor generated_from (covered natively by the
      // root AGENTS.md pointer) contribute documentation only.
    }
    const adapterDir = path.join(root, 'templates/adapters');
    if (fs.existsSync(adapterDir)) {
      for (const file of fs.readdirSync(adapterDir)) {
        if (file === 'README.md') continue;
        const refCount = adapterRefCounts.get(`templates/adapters/${file}`) || 0;
        check(refCount === 1, `templates/adapters/${file} is referenced by exactly one vendors.json entry (found ${refCount})`);
      }
    }
  }
}

// The Gemini/Qwen pointers must use the documented ./-prefixed subdirectory import form —
// the bare @dir/... form collided with a path-duplication bug in older Gemini CLI builds.
for (const rel of ['templates/adapters/GEMINI.md', 'templates/adapters/QWEN.md']) {
  if (exists(rel)) {
    const adapter = read(rel);
    check(adapter.includes('@./l00prite/AGENTS.md'), `${rel} imports @./l00prite/AGENTS.md (./-prefixed form)`);
    check(!/^\s*@l00prite\//m.test(adapter), `${rel} avoids the bare @l00prite/... import form`);
  }
}

// ---------------------------------------------------------------------------
// Event and review prompts keep their lifecycle and safety invariants.
// (Byte-parity above makes the canonical copy authoritative; the per-copy
// checks stay as defense in depth.)
// ---------------------------------------------------------------------------
const eventPrompts = [`${TPL}/prompts/event-loop.md`, '.codex/prompts/event-loop.md', 'templates/codex/prompts/event-loop.md', '.claude/prompts/event-loop.md', 'templates/claude/prompts/event-loop.md'];
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

const reviewPrompts = [`${TPL}/prompts/respond-to-review.md`, '.codex/prompts/respond-to-review.md', 'templates/codex/prompts/respond-to-review.md', '.claude/prompts/respond-to-review.md', 'templates/claude/prompts/respond-to-review.md'];
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
  `${TPL}/prompts/resume-loop.md`, '.codex/prompts/resume-loop.md', 'templates/codex/prompts/resume-loop.md', '.claude/prompts/resume-loop.md', 'templates/claude/prompts/resume-loop.md',
  `${TPL}/prompts/heartbeat.md`, '.codex/prompts/heartbeat.md', 'templates/codex/prompts/heartbeat.md', '.claude/prompts/heartbeat.md', 'templates/claude/prompts/heartbeat.md',
  `${TPL}/prompts/execute-loop.md`,
  ...eventPrompts, ...reviewPrompts
];
for (const rel of lockAwarePrompts) {
  if (exists(rel)) {
    const prompt = read(rel).toLowerCase();
    check(prompt.includes('lock.json'), `${rel} checks lock.json before mutating memory`);
  }
}

for (const rel of [`${TPL}/events/README.md`, `${TPL}/events/processing/README.md`, `${TPL}/events/completed/README.md`]) {
  if (exists(rel)) {
    const doc = read(rel).toLowerCase();
    check(!doc.includes('move or copy'), `${rel} does not use ambiguous move-or-copy language`);
  }
}

if (exists(`${TPL}/events/README.md`)) {
  const eventsDoc = read(`${TPL}/events/README.md`).toLowerCase();
  check(eventsDoc.includes('event-yyyymmdd-hhmmss'), 'events README documents the event ID format');
}

if (exists(`${TPL}/README.md`)) {
  const protocolDoc = read(`${TPL}/README.md`).toLowerCase();
  check(protocolDoc.includes('blocked state wins'), 'protocol README documents blocked-over-should_continue precedence');
  check(protocolDoc.includes('lock'), 'protocol README documents lock precedence');
  check(protocolDoc.includes('prompts/'), 'protocol README documents the prompts folder');
  check(protocolDoc.includes('l00prite/.l00prite'), 'protocol README locates the memory folder in the target layout');
  check(protocolDoc.includes('planning mode') && protocolDoc.includes('execution mode'), 'protocol README documents both operating modes');
}

if (exists(`${TPL}/LOCKING.md`)) {
  const locking = read(`${TPL}/LOCKING.md`).toLowerCase();
  check(locking.includes('protocol files'), 'LOCKING.md documents prompts/ as protocol files agents never modify');
}

if (exists(`${TPL}/ledger.md`)) {
  const ledger = read(`${TPL}/ledger.md`).toLowerCase();
  for (const field of ['goal', 'triggering event', 'reviewer/comment reference', 'decision', 'fix implemented', 'tests run', 'response drafted/sent', 'event status', 'failures', 'next action', 'command', 'exit_code', 'evidence_path', 'timestamp', 'lock:']) {
    check(ledger.includes(field), `ledger template contains ${field}`);
  }
}

// The Autonomous-Edit Denylist must protect the protocol files in BOTH layouts —
// l00prite/.l00prite/ in a scaffolded target and .l00prite/ at a repo root.
if (exists(`${TPL}/constraints.md`)) {
  const constraints = read(`${TPL}/constraints.md`);
  check(constraints.includes('l00prite/.l00prite/prompts/**'), 'constraints denylist covers l00prite/.l00prite/prompts/** (target layout)');
  check(constraints.includes('.l00prite/prompts/**'), 'constraints denylist covers .l00prite/prompts/** (root layout)');
  check(constraints.includes('l00prite/AGENTS.md'), 'constraints denylist covers l00prite/AGENTS.md');
}

// ---------------------------------------------------------------------------
// JSON schemas: templates parse, carry schema_version, and ship Execution Mode
// disarmed in every copy (template, example, and this repo's own dogfood).
// ---------------------------------------------------------------------------
const jsonTemplates = [`${TPL}/heartbeat.json`, `${TPL}/state.json`, `${TPL}/events/example-event.json`, `${TPL}/lock.json`];
for (const rel of jsonTemplates) {
  try {
    const data = JSON.parse(read(rel));
    check(true, `${rel} is valid JSON`);
    check(Object.prototype.hasOwnProperty.call(data, 'schema_version'), `${rel} contains schema_version`);
  } catch (error) {
    check(false, `${rel} is valid JSON: ${error.message}`);
  }
}

const RUN_BOUNDARY_IDS = [
  'definition_of_done_met',
  'iteration_limit_reached',
  'human_review_gate',
  'destructive_operation_required',
  'ambiguous_requirements',
  'unfixable_failing_tests',
  'missing_secrets_or_credentials',
  'lock_lease_conflict',
  'stop_signal'
];
// Shipped copies (template + example) must be disarmed unconditionally. The live dogfood
// copy is checked separately below: it may legitimately be armed mid-run, but only with a
// matching active execute-loop lock — otherwise a crashed run left arming state committed.
const heartbeatCopies = [`${TPL}/heartbeat.json`, `${EXL}/heartbeat.json`, '.l00prite/heartbeat.json'];
for (const rel of heartbeatCopies) {
  if (!exists(rel)) continue;
  try {
    const hb = JSON.parse(read(rel));
    const isDogfood = rel === '.l00prite/heartbeat.json';
    check(hb.execution && typeof hb.execution === 'object', `${rel} contains the execution block`);
    if (hb.execution) {
      if (!isDogfood) {
        check(hb.execution.enabled === false, `${rel} ships Execution Mode disarmed (enabled === false)`);
        check(hb.execution.preflight_confirmed === false, `${rel} ships preflight_confirmed === false`);
      }
      check(typeof hb.execution.max_iterations === 'number' && hb.execution.max_iterations > 0, `${rel} execution.max_iterations is a bounded number`);
      check(Object.prototype.hasOwnProperty.call(hb.execution, 'current_iteration'), `${rel} execution has current_iteration`);
      check(Object.prototype.hasOwnProperty.call(hb.execution, 'last_run_boundary'), `${rel} execution has last_run_boundary`);
      const boundaries = hb.execution.run_boundaries || [];
      for (const id of RUN_BOUNDARY_IDS) {
        check(boundaries.includes(id), `${rel} run_boundaries includes ${id}`);
      }
    }
  } catch (error) {
    check(false, `${rel} parses for execution checks: ${error.message}`);
  }
}

const stateCopies = [`${TPL}/state.json`, `${EXL}/state.json`, '.l00prite/state.json'];
for (const rel of stateCopies) {
  if (!exists(rel)) continue;
  try {
    const state = JSON.parse(read(rel));
    if (rel !== '.l00prite/state.json') {
      check(state.execution_active === false, `${rel} ships execution_active === false`);
    }
    check(Object.prototype.hasOwnProperty.call(state, 'execution_stop_reason'), `${rel} contains execution_stop_reason`);
  } catch (error) {
    check(false, `${rel} parses for execution checks: ${error.message}`);
  }
}

// Live dogfood arming state: armed is legal only mid-run, i.e. with an active, unexpired
// execute-loop lock; and heartbeat/state must agree about whether a run is active.
if (exists('.l00prite/heartbeat.json') && exists('.l00prite/state.json')) {
  try {
    const hb = JSON.parse(read('.l00prite/heartbeat.json'));
    const state = JSON.parse(read('.l00prite/state.json'));
    const enabled = hb.execution ? hb.execution.enabled === true : false;
    const active = state.execution_active === true;
    check(enabled === active, `.l00prite/ heartbeat execution.enabled matches state execution_active (${enabled} vs ${active})`);
    if (enabled || active) {
      let lockOk = false;
      if (exists('.l00prite/lock.json')) {
        const lock = JSON.parse(read('.l00prite/lock.json'));
        lockOk = lock.status === 'active'
          && typeof lock.expires_at === 'string'
          && Date.parse(lock.expires_at) > Date.now()
          && typeof lock.purpose === 'string'
          && lock.purpose.includes('execute-loop');
      }
      check(lockOk, '.l00prite/ armed execution state has a matching active, unexpired execute-loop lock (otherwise a crashed run left arming state committed)');
    } else {
      check(true, '.l00prite/ dogfood execution state is disarmed');
    }
  } catch (error) {
    check(false, `.l00prite/ dogfood arming-state consistency: ${error.message}`);
  }
}

if (exists(`${TPL}/state.json`)) {
  try {
    const state = JSON.parse(read(`${TPL}/state.json`));
    for (const field of ['active_event_id', 'last_event_processed', 'pending_event_count', 'review_response_required', 'ci_status']) {
      check(Object.prototype.hasOwnProperty.call(state, field), `state.json contains ${field}`);
    }
  } catch (error) {
    check(false, `${TPL}/state.json parses for field checks: ${error.message}`);
  }
}

if (exists(`${TPL}/events/example-event.json`)) {
  try {
    const event = JSON.parse(read(`${TPL}/events/example-event.json`));
    for (const field of ['id', 'type', 'source', 'status', 'priority', 'verification_required', 'response_required', 'do_not_retry', 'notes', 'resolved_at', 'resolving_agent', 'verification_summary', 'response_summary', 'related_commit', 'outcome']) {
      check(Object.prototype.hasOwnProperty.call(event, field), `example-event.json contains ${field}`);
    }
    check(typeof event.id === 'string' && /^event-\d{8}-\d{6}-/.test(event.id), 'example-event.json id follows event-YYYYMMDD-HHMMSS-... format');
  } catch (error) {
    check(false, `${TPL}/events/example-event.json parses for field checks: ${error.message}`);
  }
}

if (exists(`${TPL}/lock.json`)) {
  try {
    const lock = JSON.parse(read(`${TPL}/lock.json`));
    for (const field of ['schema_version', 'lock_id', 'owner_agent', 'owner_session', 'acquired_at', 'expires_at', 'ttl_seconds', 'purpose', 'protected_paths', 'status']) {
      check(Object.prototype.hasOwnProperty.call(lock, field), `lock.json contains ${field}`);
    }
  } catch (error) {
    check(false, `${TPL}/lock.json parses for field checks: ${error.message}`);
  }
}

process.exit(failed ? 1 : 0);
