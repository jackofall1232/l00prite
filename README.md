# l00prite

l00prite is a **vendor-neutral persistent loop memory protocol for AI coding agents**. It helps scaffold a project blueprint, agent prompts, skeleton files, and a shared `.l00prite/` memory folder so Claude, Codex, GPT, Gemini, and future CLI agents can resume work across sessions without losing project intelligence.

It started as a Claude Code `/build-loop` scaffold generator. It is now an operating layer for safe, resumable agent loops.

## What l00prite is

- A scaffold-first protocol for creating project blueprints and shared memory.
- A set of Claude and Codex prompts for build, resume, heartbeat, and handoff flows.
- A `.l00prite/` folder model that stores durable project context across agents.
- A safe handoff system: one agent can scaffold, another can resume, and all agents read the same memory.

## What l00prite is not

- It is not an autonomous executor.
- It does not build generated projects during build-loop scaffolding.
- It does not install dependencies, run migrations, deploy, or execute implementation commands for generated projects.
- It does not depend on one AI vendor or one CLI.
- It does not promise exact token or dollar costs.

## Core safety boundary

`build-loop` scaffolds and then stops. It must not execute the generated project. Review generated files before starting a separate implementation session, and set appropriate spend/tool limits in your agent provider before running long loops.

## Claude usage

Copy `.claude/commands/build-loop.md` into a Claude Code project, or run Claude Code from this repo. Then use:

```text
/build-loop a CLI tool that scrapes RSS feeds and emails a daily digest
```

The command asks clarifying questions, picks a tier, writes `CLAUDE.md`, creates `.l00prite/`, scaffolds a skeleton, and stops. To implement later, open a fresh Claude Code session in the target repo and let it read `CLAUDE.md` and `.l00prite/`.

## Codex usage

Codex prompts live in `.codex/prompts/` and are plain Markdown for copy/paste use:

- `.codex/prompts/build-loop.md` — scaffold a target project and stop.
- `.codex/prompts/resume-loop.md` — resume the next smallest implementation step from `.l00prite/`.
- `.codex/prompts/heartbeat.md` — decide whether a loop should continue, pause, or stop.
- `.codex/prompts/event-loop.md` — process one pending event through classify, plan, execute, verify, persist, respond.
- `.codex/prompts/respond-to-review.md` — resolve one PR review event and draft a reviewer response.
- `.codex/prompts/handoff-summary.md` — prepare cross-agent handoff notes.

To resume a generated project with Codex, open the target repo and paste `.codex/prompts/resume-loop.md` into the Codex session.

## The `.l00prite/` folder

Generated projects should contain:

```text
.l00prite/
  blueprint.md
  ledger.md
  memory.md
  heartbeat.json
  constraints.md
  failures.md
  todos.md
  state.json
  sessions/README.md
  events/README.md
  events/example-event.json
  events/pending/README.md
  events/processing/README.md
  events/completed/README.md
  reviews/README.md
  reviews/github/README.md
```

This is the shared source of truth for all agents.

### Blueprint

`.l00prite/blueprint.md` stores mission, architecture, requirements, and definition of done.

### Ledger

`.l00prite/ledger.md` is the rich run history. Each run should record goal, triggering event, reviewer/comment reference, decision, completed work, fix implemented, changed files, tests run, response status, event status, failures, decisions, confidence, next action, and do-not-retry notes.

### Memory model

`.l00prite/memory.md` stores durable decisions and facts only. Temporary notes, speculative ideas, and stale debugging output belong in session logs or nowhere.

### Heartbeat

`.l00prite/heartbeat.json` is machine-readable loop control. It tracks max iterations, current iteration, stop conditions, human review gates, last run time, completion status, and whether the next loop should continue.

### State and TODOs

`.l00prite/state.json` stores the current machine-readable project state, including active event id, last processed event, pending event count, review response requirement, and CI status. `.l00prite/todos.md` stores prioritized next actions for the next agent.

### Failures and constraints

`.l00prite/failures.md` records approaches that should not be retried unless conditions change. `.l00prite/constraints.md` records hard rules, user preferences, security boundaries, and architecture constraints.

## Event and review workflow

l00prite treats project events as first-class protocol objects. An event is any signal that may need to interrupt normal roadmap work, including pull request review comments, failed CI, new issues, security alerts, merge conflicts, human TODOs, agent recommendations, and dependency update warnings.

Generated projects can store events under `.l00prite/events/`:

```text
.l00prite/events/
  README.md
  example-event.json
  pending/
  processing/
  completed/
.l00prite/reviews/
  README.md
  github/README.md
```

A PR review comment is an event. The expected lifecycle is:

```text
Event → Classify → Plan → Execute → Verify → Persist → Respond
```

Agents should read pending events before normal roadmap work. For review events, the agent should decide whether the reviewer comment is valid, already fixed, unclear, unsafe, or not actionable. Valid comments should be resolved with the smallest safe fix, verified with relevant checks, persisted in `.l00prite/` memory, and then answered with a concise response.

By default, process only one event per loop. This keeps the fix, verification, memory updates, and reviewer response auditable. It also prevents a review-response loop from drifting into unrelated refactors or broad autonomous behavior.

Verification is required before responding. If tests fail or cannot run, record that honestly in the ledger and event notes, keep or mark the event as blocked/deferred, and do not claim completion.

l00prite does not auto-push, merge, deploy, or behave as a full GitHub bot unless a human explicitly adds that workflow. Event prompts may draft responses, but posting, pushing, or merging requires explicit permission.

## Resuming with another agent

1. Open the generated target repo.
2. Start the new agent session.
3. Tell the agent to read `.l00prite/blueprint.md`, `ledger.md`, `memory.md`, `constraints.md`, `failures.md`, `todos.md`, `state.json`, and `heartbeat.json`.
4. Have the agent state its understanding and what it will not retry.
5. Have it execute only the next smallest useful step.
6. Require verification.
7. Require updates to ledger, state, todos, failures if needed, and heartbeat before stopping.

Claude can hand off to Codex by updating `.l00prite/` and `HANDOFF.md`; Codex can hand back to Claude the same way. Neither agent needs vendor-specific hidden state to continue.

## Complexity tiers

Generated projects use one of three skeleton tiers:

- `templates/skeleton/small/` — narrow scripts, plugins, small CLIs, or focused libraries.
- `templates/skeleton/medium/` — apps/services with several moving parts.
- `templates/skeleton/large/` — multi-module systems with stronger architecture and integration needs.

If scope is borderline, prefer the smaller tier.

## Validation

Run the lightweight validator after protocol changes:

```bash
node scripts/validate-l00prite.js
```

It checks required files, Codex prompts, event templates, target-project Codex templates, `.l00prite` templates, README coverage, non-execution language, event-aware ledger and state fields, example output, and JSON validity.

## Repo layout

```text
.claude/commands/build-loop.md   Claude build-loop command
.codex/prompts/                  Codex/CLI prompt equivalents
templates/CLAUDE.md.template     Generated target CLAUDE.md template
templates/l00prite/              Shared memory folder templates
templates/codex/prompts/         Target-project Codex prompt templates
templates/skeleton/              Small/medium/large skeletons
examples/example-output/         Legacy Claude-focused example
examples/vendor-neutral-output/  Vendor-neutral example output
scripts/validate-l00prite.js     Lightweight protocol validator
CLAUDE.md                        l00prite's own project blueprint
AGENTS.md                        Instructions for AI agents working here
```

## License

MIT. See [LICENSE](LICENSE).
