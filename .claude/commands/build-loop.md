---
description: Scaffold a CLAUDE.md + skeleton repo (Loop Engineering protocol) from a project idea. Does NOT execute it.
---

You are running the `/build-loop` command from the l00prite project. Your job in this
invocation is to **scaffold a blueprint**, not to build anything. Follow the steps below
in order. Do not skip ahead, do not combine steps, and do not execute any part of the
blueprint you produce.

The user's project idea (if provided as an argument to this command) is:

$ARGUMENTS

If no idea was provided as an argument, ask the user to describe the project they want to
build before continuing to Step 1.

---

## Step 1 — Ask clarifying questions (REQUIRED, do this first)

Before generating anything, ask the user for the following. Ask all of them together in one
message, not one at a time:

1. **Project type** — what kind of thing is this (CLI tool, web app, API/service, library,
   browser extension, WordPress/CMS plugin, data pipeline, mobile app, game, etc.)?
2. **Scope** — what's the minimum viable version? What is explicitly out of scope for v1?
3. **Target languages/stack** — programming language(s), frameworks, runtimes, package
   managers.
4. **Target repo** — an existing local path/repo to scaffold into, or "new repo" (and if
   new, where should it live)?
5. **Hard constraints** — deadlines, must-use libraries or APIs, deployment target,
   licensing requirements, anything else non-negotiable.

**Do not proceed to Step 2 until the user has answered all five.** The only exception: if
the user explicitly says something like "use your judgment" for a given item, you may fill
that one item in with a reasonable, clearly-labeled default — state the default you chose
out loud. Do not silently assume defaults for items the user hasn't addressed at all.

## Step 2 — Pick a complexity tier

Based on the answers from Step 1, choose one of three tiers: **small**, **medium**, or
**large**. Use this rough guidance:

- **small** — single-purpose script, plugin, CLI tool, or narrow library. One main
  responsibility, few or no external services, a handful of files.
- **medium** — a web app or service with a few moving parts: an API layer plus a small
  amount of business logic, maybe a database or a couple of integrations, config and basic
  CI.
- **large** — a multi-service or multi-module system: several independently meaningful
  components, integration tests, infra/deployment concerns, architecture decisions worth
  recording.

Tell the user which tier you picked **and explain why**, referencing their actual answers
(e.g., "You described a single WordPress plugin with one settings page and no external
services, so this is **small** tier."). If it's genuinely borderline, say so and pick the
smaller of the two — it's cheaper to upgrade a skeleton later than to have over-scaffolded.

## Step 3 — Generate the target project's CLAUDE.md

Read `templates/CLAUDE.md.template` from this repo. Fill in every `{{placeholder}}` with
content specific to the user's project, based on their Step 1 answers and the tier chosen
in Step 2. The output must:

- Preserve all 8 section headers, in order: Mission, Architecture, Requirements,
  Definition of Done, Agent Operating Loop, Heartbeat Rules, Run Ledger, Completion
  Criteria.
- Contain **zero** leftover `{{placeholder}}` tokens or bracketed guidance comments — every
  one must be replaced with real, specific content. Before showing the result to the user,
  grep your own output for `{{` and `}}` and fix anything you find.
- Be specific to *this* project, not generic boilerplate. Reference actual languages,
  frameworks, file names, and constraints the user gave you.
- In the "Agent Operating Loop" section, define a generator role, an evaluator role, and a
  concrete loop description appropriate to the chosen tier.
- In "Heartbeat Rules", set a concrete max-iteration cap and human-review gate appropriate
  to the tier (smaller tiers get tighter caps; never leave this unbounded).
- In "Run Ledger", include the empty table with header row only (Session | Date | Built |
  Tested | Status) — this is a living log the *target* project's build sessions will fill
  in, not something you pre-fill.

Write the result to the target repo (per the user's Step 1 answer) as `CLAUDE.md`. If the
target repo path doesn't exist yet and the user said "new repo", create the directory
first.

## Step 4 — Generate the skeleton folder structure

Copy the folder structure from `templates/skeleton/<tier>/` (where `<tier>` is whatever you
picked in Step 2) into the target repo. Adapt file names and extensions to the user's actual
language/stack (e.g., replace the `.stub` extension with the appropriate language extension like `.js`, `.py`, `.go`, or `.md` for documentation, and rename placeholder files to match their chosen stack). Do not invent extra structure beyond what the
tier skeleton provides — the point is a minimal starting scaffold, not a fully fleshed-out
app.

## Step 5 — Give a rough, qualitative cost estimate

Tell the user the rough shape of what to expect for the tier you picked, in **qualitative**
terms only. Use language like:

- "**Small tier** projects like this typically run a modest number of agentic loop
  iterations to reach Definition of Done — think single-session, low double-digit tool
  calls."
- "**Medium tier** projects usually take more iterations across multiple review gates,
  since there's more surface area to build and test."
- "**Large tier** projects can run substantially more iterations across multiple sessions,
  especially with integration tests and multiple modules in play."

Explicitly state: **this is not a precise token or dollar estimate.** Predicting exact
agentic loop cost ahead of execution is not reliable — actual cost depends on how the
generator and evaluator roles behave, how many review cycles are needed, how much the
codebase grows, and how the user steers it. Do not give a specific token count or dollar
figure. If the user pushes for a number, repeat that it can't be reliably predicted and
point them at the qualitative tiers instead.

## Step 6 — Stop. Do not execute anything.

End the command here. Tell the user, explicitly and in plain language:

- This command does **not** execute the generated `CLAUDE.md` and does **not** run any
  build loop. It only scaffolded files.
- **Review the generated `CLAUDE.md` yourself** before running it — read it the way you'd
  read a PR, not the way you'd skim a changelog.
- If you haven't already, **set a spend limit in the Anthropic Console** before pointing an
  agentic session at this blueprint. Unsupervised agentic loops can burn real API spend if
  left unattended.
- To actually build this project, **open a fresh, separate Claude Code session** in the
  target repo and let it pick up the new `CLAUDE.md` from there. Do not continue building
  inside this l00prite session — l00prite's job ends at scaffolding.

Do not, under any circumstances in this command, make further tool calls against the
target repo beyond writing the `CLAUDE.md` and skeleton files described above. Do not start
implementing requirements, do not run build/test commands in the target repo, and do not
open a build loop yourself.
