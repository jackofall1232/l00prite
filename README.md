# l00prite

A Claude Code slash command (`/build-loop`) that turns a project idea into a `CLAUDE.md` blueprint and a skeleton repo — then stops. It does not execute anything.

## What this is

`l00prite` is a single Claude Code slash command, distributed as plain files in this repo. There is no backend, no hosted service, no stored credentials, and no telemetry. Everything runs locally, inside your own Claude Code session, using your own Anthropic API access.

When you run `/build-loop`:

1. You give it a project idea — a prompt describing something you want to build.
2. It asks clarifying questions before generating anything: project type, scope, languages/stack, target repo, constraints.
3. It generates a complete `CLAUDE.md` for your target project, following the 8-section "Loop Engineering" protocol (the same protocol this repo's own `CLAUDE.md` is written in — see below).
4. It generates a skeleton folder structure for the target project, matching one of three complexity tiers: small, medium, or large.
5. It gives you a rough complexity-tier cost estimate — something like "small tier: expect a handful of agentic loop iterations." This is deliberately not a precise token or dollar figure. Predicting the exact cost of an agentic loop before it runs is not reliable, and this tool will not pretend otherwise.
6. It stops.

## What this does NOT do

This is the important part, stated plainly:

- `/build-loop` does not execute the `CLAUDE.md` it generates.
- It does not run an autonomous or agentic build loop.
- It does not touch your target repo beyond writing the `CLAUDE.md` and the skeleton files.
- It never calls out to a backend — there isn't one.

Actually building the project — running an agentic loop against the generated `CLAUDE.md` — happens later, in your own separate Claude Code session, under that session's normal tool-approval flow. That handoff is deliberate. `/build-loop` produces a blueprint; it does not act on it. What you do with the blueprint, and what permissions you grant the session that runs it, is entirely on you.

## Read this before you run a generated blueprint

Once you take a generated `CLAUDE.md` into your own Claude Code session and start an agentic build loop against it, that loop can run for many iterations and consume real API spend. If you've loosened your tool-approval settings, it can do this largely unsupervised.

Before running any generated blueprint:

- Set a spend limit in the [Anthropic Console](https://console.anthropic.com). Do this first, not after you notice the bill.
- Actually read the generated `CLAUDE.md`. Don't run it blind. It's a few hundred lines describing what an agent is about to be told to do — read it the way you'd read a pull request before merging it.

`l00prite` itself never executes anything, so it cannot be the thing that runs up a bill. The risk lives entirely downstream, in what you do after `l00prite` hands you the blueprint.

## Why "l00prite"

The name is a leetspeak / stylized string, not a descriptive phrase you'd stumble on by googling "claude code build loop generator" or similar. That's intentional. It's a soft filter, not a secret: if you found this repo, you likely already followed a link from someone who knows what an agentic build loop is and what it costs when it goes unsupervised. The name isn't hiding anything — everything here is public and documented — it's just not optimized to be found by someone who doesn't yet have that context.

## Install / setup

`/build-loop` is a slash command file, not a package. Two ways to get it into your own Claude Code session:

**Option A — copy the command file into your project**

Copy `.claude/commands/build-loop.md` from this repo into your own project's `.claude/commands/` directory:

```
mkdir -p .claude/commands
curl -o .claude/commands/build-loop.md \
  https://raw.githubusercontent.com/<org>/l00prite/main/.claude/commands/build-loop.md
```

(Adjust the URL to wherever this repo actually lives.)

**Option B — clone the repo and point Claude Code at it**

```
git clone https://github.com/<org>/l00prite.git
cd l00prite
claude
```

Either way, `/build-loop` becomes available as a slash command in that Claude Code session. The command itself reads from `templates/CLAUDE.md.template` and `templates/skeleton/` in this repo to do its work, so if you copy just the command file (Option A), copy the `templates/` directory alongside it.

## Usage example

```
/build-loop a CLI tool that scrapes RSS feeds and emails a daily digest
```

`/build-loop` will ask you things like:

- What kind of project is this — CLI tool, web app, library, service?
- Roughly how big a scope are we talking — small, medium, or large?
- What languages or stack do you want?
- What's the target repo (new repo, or an existing one)?
- Any constraints — deployment target, dependencies to avoid, deadlines, etc.?

Once you answer, it writes a `CLAUDE.md` and a matching skeleton into your target repo, gives you a rough complexity-tier estimate, and stops here. Open a fresh Claude Code session against your new `CLAUDE.md` to actually build it.

## Complexity tiers

Generated projects fall into one of three tiers, each with a corresponding base skeleton under `templates/skeleton/`:

- **small** — `templates/skeleton/small/`
- **medium** — `templates/skeleton/medium/`
- **large** — `templates/skeleton/large/`

The tier affects the skeleton's folder structure and the rough iteration-count language used in the cost estimate. It is not a precise prediction of how long a build loop will actually take — see the spend-limit warning above.

## The Loop Engineering protocol

Every `CLAUDE.md` this tool generates — and this repo's own `CLAUDE.md` — follows the same 8 sections, in this order:

1. Mission
2. Architecture
3. Requirements
4. Definition of Done
5. Agent Operating Loop
6. Heartbeat Rules
7. Run Ledger
8. Completion Criteria

A filled, realistic example of what `/build-loop` produces for a sample project lives in `examples/example-output/`. The raw template with `{{placeholders}}` lives in `templates/CLAUDE.md.template`.

## Repo layout

```
.claude/commands/build-loop.md   the slash command definition
templates/CLAUDE.md.template     the 8-section template used to generate a target project's CLAUDE.md
templates/skeleton/              base folder structures by tier: small/, medium/, large/
examples/example-output/         a filled example CLAUDE.md showing real /build-loop output
CLAUDE.md                        l00prite's own blueprint (this repo is built using its own protocol)
```

## License

MIT. See [LICENSE](LICENSE).
