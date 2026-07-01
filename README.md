<p align="center">
  <img src="assets/l00prite-infinity.svg" alt="l00prite logo — an infinity loop next to the word l00prite" width="420" />
</p>

```
        ∞   l 0 0 p r i t e   ∞
           loop memory for agents
```

# l00prite

**Persistent loop memory for AI coding agents.**

## What is l00prite?

l00prite is a **vendor-neutral protocol for giving AI coding agents durable, file-based project memory**. It is not tied to one model or one CLI — it's a shared source of truth that Claude, Codex, GPT, Gemini, and future CLI agents can all read and write to the same repo.

- **Vendor-neutral**: the protocol is plain Markdown and JSON files, not a proprietary API or hosted service.
- **File-based memory**: project state lives in a `.l00prite/` folder inside the target repo, not in a chat thread that disappears when the session ends.
- **Shared source of truth**: any agent that can read files in the repo can pick up where another agent left off.
- **Claude and Codex workflows out of the box**: `.claude/commands/build-loop.md` for Claude Code, `.codex/prompts/` for Codex and other CLI agents.
- **Designed for resumable development**: an agent can stop mid-project, and a different agent (or the same one, days later) can resume with full context.

## Why it exists

AI coding agents are good at long, iterative work, but they have a structural weakness: **they forget**.

- Context resets between sessions, so agents lose track of what was already tried.
- Without memory of failed approaches, agents repeat the same broken fix.
- PR review comments and CI failures get answered once and then lost — the next session doesn't know they happened.
- Project state ends up scattered across chat transcripts, TODO comments, and tribal knowledge instead of the repo itself.

l00prite's answer is simple: **put project memory in the repo, as files.** Files survive context resets, are diffable, are readable by any agent or human, and don't depend on any one vendor's session state.

## What l00prite does

- Generates a project blueprint (`CLAUDE.md`) from a clarifying-questions conversation.
- Creates a `.l00prite/` memory folder scaffolded into the target repo.
- Supports run ledgers that record what actually happened, run by run.
- Supports heartbeat control (`heartbeat.json`) to decide whether a loop should continue, pause, or stop.
- Supports resume loops so a new session can pick up the next smallest useful step.
- Supports Codex and Claude prompts for build, resume, heartbeat, and event workflows.
- Supports event and review workflows so PR comments, CI failures, and other signals become first-class, trackable objects.
- Supports handoffs between agents — Claude to Codex, Codex to Claude, or agent to human — through shared files instead of hidden state.

## What l00prite does NOT do

- It does **not** secretly run autonomous agents. Nothing here starts a background loop on its own.
- It does **not** execute the generated project during scaffolding. `/build-loop` (and its Codex equivalent) stop after writing files.
- It does **not** replace human review. Verification and review are protocol requirements, not optional.
- It does **not** push, merge, or deploy anything unless a user explicitly wires that up later — this repo ships no such automation.
- It does **not** depend on one AI vendor. The protocol is plain files any agent can read.
- It does **not** predict exact token or dollar cost. Complexity tiers give a rough sense of scale, not a forecast.

## Core idea

The scaffold lifecycle:

```
Idea
  → Blueprint
    → Memory
      → Loop
        → Event
          → Verification
            → Ledger
              → Handoff
```

The event lifecycle (how a single interrupt — a review comment, a failed CI run — gets handled):

```
Event
  → Classify
    → Plan
      → Execute
        → Verify
          → Persist
            → Respond
```

Both lifecycles end the same way: state gets written to files before anyone stops, so the next agent (or human) can trust what's there.

## Repository layout

```text
.claude/                 Claude Code slash command and prompts
.codex/                  Codex/CLI-agent prompt equivalents
templates/               Templates used to generate target-project files
templates/l00prite/      Templates for the .l00prite/ memory folder
examples/                Filled reference outputs
scripts/                 Validation tooling
AGENTS.md                Instructions for AI agents working in this repo
HANDOFF.md               Living log of what changed and what's left
README.md                This file
```

## The `.l00prite` protocol

A generated target project gets a `.l00prite/` folder. Every file has one job:

| File | Purpose |
|------|---------|
| `blueprint.md` | Mission, architecture, requirements, and definition of done for the project. |
| `ledger.md` | Rich, human-readable run history — one entry per run: goal, triggering event, decision, what changed, tests run, response status, next action. |
| `memory.md` | Durable decisions and facts only. Speculative notes and stale debugging output don't belong here. |
| `heartbeat.json` | Machine-readable loop control: max iterations, current iteration, stop conditions, human review gates, continue/stop signal. |
| `constraints.md` | Hard rules, user preferences, security boundaries, architecture constraints. |
| `failures.md` | Approaches that already failed and should not be retried unless conditions change. |
| `todos.md` | Prioritized next actions for whichever agent picks this up next. |
| `state.json` | Current machine-readable state: active event id, last event processed, pending event count, review-response requirement, CI status. |
| `events/` | Pending, processing, and completed events (PR comments, CI failures, alerts) as JSON. |
| `reviews/` | Review-specific records, including GitHub PR review handling. |
| `sessions/` | Session log conventions for per-run notes that don't belong in `memory.md`. |

Any agent that reads these files has everything it needs to continue safely.

## Claude usage

Copy `.claude/commands/build-loop.md` into a Claude Code project, or run Claude Code from this repo directly. Then:

```text
/build-loop a CLI tool that scrapes RSS feeds and emails a daily digest
```

`/build-loop` asks clarifying questions (project type, scope, stack, constraints), picks a complexity tier, writes `CLAUDE.md`, scaffolds `.l00prite/`, creates a tiered skeleton, and **stops**. To implement, open a separate Claude Code session in the target repo and let it read `CLAUDE.md` and `.l00prite/` before doing any work. Claude-side resume behavior mirrors the Codex `resume-loop` prompt: read memory, state the plan, execute the next smallest step, verify, then update memory before stopping.

## Codex usage

Codex prompts live in `.codex/prompts/` as plain Markdown, meant to be copy-pasted into a Codex or other CLI-agent session:

- `.codex/prompts/build-loop.md` — scaffold a target project and stop.
- `.codex/prompts/resume-loop.md` — resume the next smallest implementation step from `.l00prite/`.
- `.codex/prompts/heartbeat.md` — decide whether a loop should continue, pause, or stop.
- `.codex/prompts/event-loop.md` — process one pending event through classify, plan, execute, verify, persist, respond.
- `.codex/prompts/respond-to-review.md` — resolve one PR review event and draft a reviewer response.

No special tooling is required — open the target repo, paste the relevant prompt, and go.

## Event and PR review workflow

l00prite treats project interrupts as first-class, trackable events:

- A PR review comment becomes an event.
- A failed CI run can become an event.
- Agents process **one event per loop by default** — this keeps each fix, verification, and reviewer response auditable instead of letting a review-response loop drift into unrelated refactors.
- Verification is required before responding. If tests fail or can't run, that gets recorded honestly — not glossed over.
- Agents update `ledger.md`, `state.json`, and related memory files before stopping, whether or not the event fully resolved.
- l00prite does **not** auto-push, merge, or act as a full GitHub bot. Drafting a response is in scope; posting, pushing, or merging requires explicit human permission.

## Safety boundary

This is the boundary that matters most, stated plainly:

- The scaffold/`build-loop` phase creates structure and memory — nothing else.
- It does **not** execute the generated project.
- It does **not** silently overwrite existing files in a target repo.
- It does **not** continue into implementation unless a user explicitly starts a resume loop or event loop in a separate session.

## Install / setup

l00prite is not packaged as an installable CLI or extension yet. Setup today is manual:

1. Clone this repo.
2. For Claude Code: copy `.claude/commands/build-loop.md` into your project's `.claude/commands/`, or run Claude Code from this repo directly.
3. For Codex or other CLI agents: open `.codex/prompts/` and copy/paste the relevant prompt into your session.
4. To generate a new project: run `/build-loop` (Claude) or paste `.codex/prompts/build-loop.md` (Codex/others), then follow the clarifying questions.
5. `templates/` files (skeletons, `.l00prite/` templates, Codex prompt templates) can be copied directly into a target repo if you're scaffolding by hand instead of via a prompt.

> TODO: canonical repository URL for install instructions/badges — this README intentionally avoids inventing one.

## Validation

A lightweight validator checks structural and protocol invariants:

```bash
node scripts/validate-l00prite.js
```

It checks: required files exist (Claude/Codex prompts, templates, examples), the README documents Claude/Codex/`.l00prite`, `build-loop` explicitly states it does not execute generated projects, event prompts cover classify/plan/execute/verify/persist/respond and cap default processing at one event per loop, review-response prompts forbid blind agreement and unauthorized push/merge, the ledger template carries event-aware fields, and all JSON templates (`heartbeat.json`, `state.json`, `example-event.json`) parse and carry their required fields.

## Current maturity

**Alpha / protocol preview.**

- l00prite is mostly Markdown- and JSON-driven — a protocol and a set of prompts, not a running service.
- The scaffold-first design is deliberately safe: nothing executes without a separate, explicit session.
- The event engine is protocol-level (file conventions and prompts), not a hosted bot watching your repo.
- Automation integrations (GitHub webhooks, CI ingestion, auto-triggered event creation) are future work, not present today.

## Roadmap

- Stronger, more semantic validation (beyond file existence and keyword checks).
- GitHub event ingestion (turning real PR comments into `.l00prite/events/` entries automatically).
- CI failure capture as events.
- Richer, filled-in examples (a real resolved PR review, a real multi-session handoff).
- Stack-specific skeleton packs (e.g. a Python/pytest pack, a Node/vitest pack).
- Cross-agent compatibility tests (verify Claude and Codex genuinely hand off cleanly).
- An optional executable validator with stricter guarantees than the current script.
- Release packaging (so setup isn't fully manual).

## Contributing

- Preserve the non-execution boundary. `build-loop` scaffolds; it must never start executing a generated project.
- Keep the protocol vendor-neutral — avoid hardcoding assumptions that only one agent CLI can satisfy.
- Update `README.md`, `HANDOFF.md`, and `AGENTS.md` when you change protocol behavior, not just code/templates.
- Add an example when you add a new protocol concept — an unillustrated concept is hard for both agents and humans to apply correctly.

## License

MIT. See [LICENSE](LICENSE).
