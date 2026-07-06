---
name: l00prite-adopting
description: >
  Scope: any l00prite-managed project. Load this when a session is bringing l00prite INTO a
  new or existing repo, or checking whether a past adoption is complete — running the l00prite
  source repo's `/build-loop` slash command (Claude Code) or `.codex/prompts/build-loop.md`
  (Codex/CLI agents), answering the Step 1 clarifying questions, choosing a complexity tier
  (small/medium/large), asking "what exactly does a scaffold write", adopting into a repo that
  already has files at the target paths, deciding what the `--execute` flag does and does not
  do, or running the post-scaffold verification checklist (doctor run, disarmed-defaults
  eyeball, first ledger entry). Delivers the verified scaffold file list, the two scaffold
  routes, tier guidance, the never-silently-overwrite rule, and the vendor-adapter facts an
  adopter needs on day one.
---

# l00prite-adopting

Scope: any l00prite-managed project. This skill is written to make sense both for a session
running `/build-loop` inside the l00prite source repo to scaffold a brand-new target project,
and for a session that later opens that target project on its own and wants to check what
was actually adopted. Two repos are in play throughout this skill, and the two are always
named separately:

- **the l00prite source repo** — wherever `templates/`, `.claude/commands/build-loop.md`,
  `.codex/prompts/build-loop.md`, and `scripts/l00prite-doctor.js` live. A scaffold cannot be
  produced without access to this repo (a checkout, or a session already running inside it).
- **your project** (or "the target repo") — the repo receiving the scaffold. This skill never
  assumes your project IS the l00prite source repo.

Every canonical fact about how to operate day-to-day inside `.l00prite/` once it exists lives
in your project's own `.l00prite/prompts/` files — they are authoritative. This skill is a
map over the *adoption* step only: getting those files into place correctly the first time,
or verifying that a past adoption did it right.

## What this skill is for

Use it when the question is "how do I get l00prite into this repo" or "did my scaffold come
out right" — not "what do I do now that I have it" (that's day-to-day operation) and not "how
do I run Execution Mode" (that's a deeper dive on one flag this skill only summarizes).

### When NOT to use this

| Adjacent job | Use instead |
|---|---|
| Day-to-day loop life after adoption — which prompt to run when, lock etiquette, event lifecycle, memory hygiene | `l00prite-loop-operations` |
| Deep operator detail for Execution Mode — the full pre-flight walkthrough, all nine run boundaries and how to resume after each, arming semantics, stale-run recovery | `l00prite-execution-mode-ops` |
| Operating the `cli-os` binary/gateway itself — install, `serve`, the setup wizard, tokens, providers, repo registration, driving `/v1/runs*` over curl | `l00prite-run-and-operate` |
| Full field-by-field catalog of `heartbeat.json`/`state.json`/`lock.json`/`config.json`/env vars | `l00prite-config-and-flags` (Part A) |
| What counts as acceptable ledger evidence, Verifier Theater, "NOT measured" labeling | `l00prite-validation-and-qa` (Part A) |
| Something already looks broken — doctor FAIL, a lock conflict, stale arming, a stuck event | `l00prite-debugging-playbook` (Part A) |
| Measuring/interpreting doctor and ledger output in depth rather than eyeballing it | `l00prite-diagnostics-and-tooling` (Part A) |
| Coordinating multiple agents/sessions to build the project after it's scaffolded | `l00prite-subagent-delegation` |
| The field theory behind AGENTS.md discovery precedence, prompt-cache economics, lock/lease theory | `agent-loop-domain-reference` |
| The WHY behind a protocol design decision (byte-parity rationale, disarmed-by-default rationale) | `l00prite-architecture-contract` (repo-dev only — do not load in your project) |
| Developing the l00prite protocol/tooling itself, not adopting it into a project | `l00prite-change-control` / `l00prite-build-and-env` (repo-dev only) |

## 1. What adopting l00prite gives you

Adopting l00prite means running its scaffold ("Planning Mode") once against your project. You
get: a `CLAUDE.md` blueprint (Claude Code) and a vendor-neutral `AGENTS.md` (everything else),
a `.l00prite/` folder that is durable, file-based, cross-session project memory (mission,
architecture, requirements, a run ledger, a lock/lease convention, and the six canonical loop
prompts any agent can read), and — only if you explicitly opt in later — an autonomous
**Execution Mode** run behind a mandatory pre-flight confirmation, and/or the separate `cli-os`
gateway/runtime that can mechanically drive that run.

What it does **not** give you:

- No hosted service and no external dependency — everything is plain Markdown and JSON files
  plus one dependency-free Node script (the doctor). There is nothing to sign up for.
- No auto-push, auto-merge, or auto-deploy bot. Every push/merge/deploy/credential action
  requires per-action human permission under the protocol, regardless of mode.
- Execution Mode ships **disarmed** in every scaffold, unconditionally. Scaffolding a project
  never starts building it — Planning Mode stops after writing files, full stop.

## 2. The two scaffold routes

Both routes ask the same five clarifying questions, pick the same three tiers, and write the
same file set — verified below against the actual command text in the l00prite source repo
(as of 2026-07-06, by `wc -l`: `.claude/commands/build-loop.md`, 260 lines;
`.codex/prompts/build-loop.md`, 139 lines).

| Route | Where it lives (l00prite source repo) | Who uses it |
|---|---|---|
| Claude Code `/build-loop` slash command | `.claude/commands/build-loop.md` | A Claude Code session, invoked as `/build-loop <project idea>` (optionally `/build-loop --execute <idea>`) |
| Codex/CLI equivalent | `.codex/prompts/build-loop.md` | Any Codex or other CLI agent, invoked by having the agent read and follow that prompt file |

Both are **Planning Mode**: ask questions → pick a tier → write files → give a qualitative
cost estimate → stop. Neither executes the project it scaffolds. Step 1 of both requires
answering, in one batch, all five of: project type, MVP scope (and what's explicitly out of
scope), target languages/stack, target repo (existing path, or "new repo" and where), and hard
constraints. The command will fill in at most one item with a stated default if you
explicitly say "use your judgment" for it — it will not silently default anything you never
addressed.

### The exact file list a scaffold produces

Verified two ways: against the imperative steps in both command files, and against
`examples/vendor-neutral-output/` (a filled reference copy of real scaffold output, whose own
`README.md` documents what it deliberately omits — see below).

| Path | Source | Step |
|---|---|---|
| `CLAUDE.md` | `templates/CLAUDE.md.template`, filled in | Step 3 |
| `AGENTS.md` | `templates/AGENTS.md.template`, filled in | Step 3 |
| `.l00prite/` (full tree: `blueprint.md`, `ledger.md`, `memory.md`, `constraints.md`, `failures.md`, `todos.md`, `heartbeat.json`, `state.json`, `lock.json`, `LOCKING.md`, `prompts/` (6 files + README), `events/`, `reviews/`, `sessions/`) | `templates/l00prite/`, project-specific fields filled | Step 4 |
| `.codex/prompts/` (6 files: `resume-loop.md`, `heartbeat.md`, `event-loop.md`, `respond-to-review.md`, `handoff-summary.md`, `execute-loop.md`) | `templates/codex/prompts/`, byte-identical mirror | Step 4 |
| `.claude/prompts/` (same 6 files) | `templates/claude/prompts/`, byte-identical mirror | Step 4 |
| `GEMINI.md`, `QWEN.md`, `CONVENTIONS.md` (repo root); `.github/copilot-instructions.md`; `.cursor/rules/l00prite.mdc`; `.windsurf/rules/l00prite.md` | `templates/adapters/*`, copied verbatim (no placeholders) | Step 4 |
| Tier skeleton (`src/`, `tests/`, plus tier-dependent `docs/`, `config/`, `infra/`, `services/`, `.github/`, `.gitignore`, `README.md` — **minus** each tier's internal `TIER.md`) | `templates/skeleton/<tier>/`, `.stub` extensions adapted to your stack | Step 5 |

`.l00prite/prompts/`, `.claude/prompts/`, and `.codex/prompts/` are copied **verbatim** —
protocol files, never templates to fill in. Every other write in the table above applies a
uniform no-silent-overwrite rule (see §4).

`examples/vendor-neutral-output/` matches this table except for two things its own `README.md`
states it deliberately omits: the `.claude/prompts/` and `.codex/prompts/` mirrors (they would
duplicate `.l00prite/prompts/` byte-for-byte, so showing one copy stands for all three), and
the tier skeleton (tier- and stack-dependent, so no single copy is representative). Confirmed
by directory listing: `examples/vendor-neutral-output/` has `.l00prite/`, `CLAUDE.md`,
`AGENTS.md`, and all six adapter targets, but no `.claude/` or `.codex/` folders and no `src/`.

## 3. Complexity tiers

Step 2 of both routes picks exactly one of three tiers, using this rough guidance from the
command text itself:

| Tier | Rough shape |
|---|---|
| `small` | Single-purpose script, plugin, CLI tool, or narrow library — one main responsibility, few or no external services, a handful of files. |
| `medium` | A web app or service with a few moving parts: an API layer plus some business logic, maybe a database or a couple of integrations, config and basic CI. |
| `large` | A multi-service or multi-module system: several independently meaningful components, integration tests, infra/deployment concerns, architecture decisions worth recording. |

The agent must tell you which tier it picked **and why**, referencing your actual Step-1
answers — not a generic justification. **Borderline rule: if it's genuinely ambiguous between
two tiers, the command picks the smaller one** — it's cheaper to upgrade a skeleton later than
to have over-scaffolded. Step 6 then gives a qualitative-only cost estimate (iteration-count
language like "single-session, low double-digit tool calls" for `small`) and explicitly
refuses to give a token or dollar figure, because predicting exact agentic-loop cost ahead of
execution isn't reliable.

## 4. Adopting into an EXISTING repo

Both routes apply the same rule at every write in §2's table: **never silently overwrite.**
If a file already exists at a target path (`CLAUDE.md`, `AGENTS.md`, any `.l00prite/` file,
any prompt mirror, any adapter, any skeleton file), the agent must stop and ask you to choose
one of three options — overwrite, write a `.generated` sibling copy for manual merging, or
abort — before writing anything at that path. For the tier skeleton specifically, Step 5 skips
(rather than asks about) any file that already exists at the target path and reports what it
skipped, because Step 5 runs after you've already resolved the guidance-file collisions in
Steps 3-4.

**Lock check before scaffolding (Step 4, both routes):** if `.l00prite/lock.json` already
exists at the target path, the agent reads it *before* doing anything else in Step 4. If
`status` is `"active"` and `expires_at` is in the future, another agent may currently be
working in that project — the command stops and reports the held lock (owner, purpose,
expiry) instead of scaffolding over it. It only proceeds if `lock.json` is missing,
`"unlocked"`, `"released"`, or `"expired"`. This is the same lock/lease convention that governs
day-to-day writes once `.l00prite/` exists (see `l00prite-loop-operations` for the full
etiquette) — a scaffold run respects it exactly like any other write to a protected path.

## 5. What `--execute` does and does not do

Apply only when `--execute` was in the invocation. It changes nothing about Steps 1-7 of
either route — the scaffolded `heartbeat.json` still ships with `execution.enabled: false` and
`preflight_confirmed: false` unconditionally; verified: `examples/vendor-neutral-output/.l00prite/heartbeat.json`
shows exactly that, plus `state.json`'s `execution_active: false`, and `lock.json`'s
`status: "unlocked"`. What `--execute` actually does is **offer the Execution Mode handoff
after scaffolding completes**: the agent reads `.l00prite/prompts/execute-loop.md` in the
target repo and follows its pre-flight gate — lock check, stale-run recovery, schema check,
full pre-flight display, then **explicit human confirmation typed in that same session**. A
`preflight_confirmed: true` left over from an earlier run does not satisfy this gate; the flag
is a request to offer the handoff, never the confirmation itself. If you decline, don't
answer, or the session is headless with no human present, the command stops exactly as it
would without `--execute` — scaffold delivered, nothing armed, nothing executed. The full
pre-flight walkthrough, all nine run boundaries, and how to resume after each live in
`l00prite-execution-mode-ops` — this skill only needs you to know the flag is a gated offer,
never a shortcut.

## 6. Post-scaffold verification checklist

Run these in order right after a scaffold (or to check a scaffold you're inheriting):

1. **Health-check the memory with the doctor.** The doctor
   (`scripts/l00prite-doctor.js` in the l00prite source repo) is the one piece of l00prite-repo
   tooling built for exactly this — it is dependency-free (Node standard library only, verified:
   `grep -n "require(" scripts/l00prite-doctor.js` → only `fs` and `path`) and strictly
   read-only. Either run it from a checkout of the l00prite source repo against your project's
   path, or copy the single file into your project first (it takes a target-directory argument
   and needs nothing else from the source repo at runtime):
   ```bash
   node scripts/l00prite-doctor.js /path/to/your/project   # default: current directory
   ```
   Verified against `examples/vendor-neutral-output/` (2026-07-06):
   ```
   node scripts/l00prite-doctor.js examples/vendor-neutral-output
   → 24 ok · 0 warn · 0 fail
   → HEALTHY — .l00prite/ memory is consistent and Execution Mode ships disarmed.
   → exit 0
   ```
   The l00prite source repo's own `.l00prite/` scores 25 ok (one more check: it has real
   `.claude/`/`.codex/` prompt mirrors to compare for byte-parity, so it runs the actual parity
   check instead of the "skipped, no mirrors present" line the freshly-scaffolded example gets
   before those mirrors exist in *your* project). Do not expect the two counts to match — a
   `fail` is what should worry you, not a lower `ok` count. A `warn` does not fail the exit code;
   only a `fail` does.
2. **Eyeball the disarmed defaults yourself**, don't just trust the doctor's summary line —
   open `.l00prite/heartbeat.json` and confirm `execution.enabled: false` and
   `preflight_confirmed: false`; open `.l00prite/state.json` and confirm `execution_active:
   false`; open `.l00prite/lock.json` and confirm `status: "unlocked"`.
3. **Read the generated `CLAUDE.md` and `AGENTS.md` yourself**, the way you'd read a PR, before
   pointing any agent at them — the scaffold text says this explicitly, and it's the cheapest
   check you'll ever run.
4. **Set a spend limit with your model provider** before running any agentic session against
   the new blueprint, scaffolded or not.
5. **Make the first ledger entry.** `.l00prite/ledger.md` ships with an Entry Template at its
   top (Goal / Triggering event / Decision / Completed work / Changed files / Tests run —
   Verification with `command`/`exit_code`/`summary`/`timestamp` per check / Lock, and more) —
   use it for the scaffold itself: goal "scaffold l00prite into this project", verification =
   the doctor run from step 1. `l00prite-validation-and-qa` (Part A) owns the deeper evidence
   discipline; this is just "don't skip the first entry."
6. **Commit the scaffold** as its own commit before doing anything else in the project, so the
   pre-adoption and post-adoption states are cleanly separable in history.

## 7. Keeping current

There is an honest gap here, stated plainly by the canonical prompts themselves
(`.l00prite/prompts/README.md` in your project, mirrored from `templates/l00prite/prompts/README.md`
in the source repo): "the vendor prompt folders... start out byte-identical to it — but
**nothing inside this project checks for drift afterward**." Prompt-content upgrades are
**manual** today — there is no versioning or migration story for the prompt text itself. If you
ever hand-edit a canonical prompt in your project (only on explicit human request — these are
protocol files, never agent-edited during a loop), you are responsible for updating all three
local copies (`.l00prite/prompts/`, `.claude/prompts/`, `.codex/prompts/`) yourself.

What *does* carry a version: `heartbeat.json` and `state.json` both declare a top-level
`schema_version` (`2` as of this scaffold's shipped templates) so `execute-loop.md` can detect
and migrate an older file under lock — see `l00prite-execution-mode-ops` for the migration
mechanics. `lock.json` intentionally stays at `schema_version: 1` — that is a design choice,
not drift.

To re-check your own three prompt copies stay identical to each other (self-parity, not a
check against the l00prite source repo's canonical copy — a legitimate hand-edit that touched
all three should still pass), the doctor's `prompt mirrors are byte-identical` /
`prompt self-parity` check is exactly this — see item 1 above.

## 8. Vendor adapter notes an adopter needs

Every adapter is copied verbatim in Step 4 with no placeholders — you don't fill anything in,
but you should know what each one is for and its limits (all facts below are project-recorded
in `templates/vendors.json` in the l00prite source repo, dated 2026-07-06; third-party tool
behavior can rot — re-check before relying on it for a tool update you weren't expecting):

| Adapter target | Reads it | Notable limit |
|---|---|---|
| `AGENTS.md` (generated, not a copied adapter) | OpenAI Codex, Cursor, GitHub Copilot (coding agent/CLI/VS Code), Windsurf, Zed, Jules, Factory, Amp, opencode, Devin, Warp, Roo Code, JetBrains Junie, and more | Codex caps combined `AGENTS.md` content at 32 KiB (`project_doc_max_bytes` default) and **silently truncates** beyond it |
| `GEMINI.md` | Google Gemini CLI | Default context file, not `AGENTS.md`; the adapter `@AGENTS.md`-imports the full standard file |
| `QWEN.md` | Qwen Code (a Gemini CLI fork) | Same situation as Gemini CLI |
| `.github/copilot-instructions.md` | GitHub Copilot, all surfaces | Some Copilot surfaces read only this file and cannot open others on instruction; **Zed ranks this file above `AGENTS.md`** in its first-match priority list, which is exactly why this adapter is self-sufficient rather than a bare pointer |
| `.cursor/rules/l00prite.mdc` | Cursor | `alwaysApply: true` frontmatter guarantees injection even where `AGENTS.md` support is disabled |
| `.windsurf/rules/l00prite.md` | Windsurf / Devin Desktop | `always_on` trigger; documented limits ~6,000 characters per rules file / ~12,000 combined, silently truncated beyond — the validator that gates this file in the source repo warns above 5,500 |
| `CONVENTIONS.md` | Aider | **Not auto-loaded** — users must pass `--read CONVENTIONS.md --read AGENTS.md` or set `read: [...]` in their own `.aider.conf.yml` |

Every adapter is deliberately kept **self-sufficient** (the six load-bearing protocol rules
inline, never just "go read AGENTS.md") because some surfaces inject a file's text but can't
follow a pointer, and because of the Zed ranking quirk above.

**Never add loaded vendor *config* files** (`.aider.conf.yml`, `.gemini/settings.json`) to your
project as part of adoption — those belong to you, the user, not to the scaffold. Two concrete
reasons the source repo gives: an `.aider.conf.yml` at repo root silently overrides same-named
keys in a user's own home-directory Aider config, and common `.aider*` gitignore patterns would
swallow a shipped one anyway. The adapters plus `templates/adapters/README.md` document the
snippets you'd want (e.g. the Aider `--read` flags, the Gemini CLI settings override) instead
of shipping the config file itself.

## Provenance and maintenance

All facts below are dated **2026-07-06** and were verified directly against the l00prite
source repo at that time. Re-run the command in the right-hand column before relying on a row
for anything load-bearing — this repo's own history shows banners and counts rot.

| Volatile fact | Re-verification command (run from the l00prite source repo root) |
|---|---|
| `.claude/commands/build-loop.md` is 260 lines; `.codex/prompts/build-loop.md` is 139 lines | `wc -l .claude/commands/build-loop.md .codex/prompts/build-loop.md` |
| The scaffold file list in §2 (six canonical prompts, mirrored to `.claude/prompts/`+`.codex/prompts/`, six adapters, tier skeleton) | `grep -n "templates/adapters\|templates/skeleton\|templates/l00prite\|templates/claude/prompts\|templates/codex/prompts" .claude/commands/build-loop.md` |
| `examples/vendor-neutral-output/` omits `.claude/prompts/`, `.codex/prompts/`, and the tier skeleton (documented, not a bug) | `cat examples/vendor-neutral-output/README.md` and `find examples/vendor-neutral-output -maxdepth 1` |
| Doctor scores `examples/vendor-neutral-output/` at 24 ok/0 warn/0 fail, exit 0 | `node scripts/l00prite-doctor.js examples/vendor-neutral-output` |
| Doctor scores the source repo's own `.l00prite/` at 25 ok/0 warn/0 fail, exit 0 | `node scripts/l00prite-doctor.js .` |
| Doctor is dependency-free (only `fs`/`path`) | `grep -n "require(" scripts/l00prite-doctor.js` |
| Disarmed defaults in a fresh scaffold (`execution.enabled: false`, `preflight_confirmed: false`, `execution_active: false`, lock `"unlocked"`) | `cat examples/vendor-neutral-output/.l00prite/heartbeat.json examples/vendor-neutral-output/.l00prite/state.json examples/vendor-neutral-output/.l00prite/lock.json` |
| Six canonical prompts exist identically named in all three template locations | `ls templates/l00prite/prompts/ templates/claude/prompts/ templates/codex/prompts/` |
| Three tier skeletons exist, each with an internal (non-scaffolded) `TIER.md` | `find templates/skeleton -maxdepth 2 -name TIER.md` |
| Seven vendor adapter targets and their size/notes in §8 | `cat templates/vendors.json` and `cat templates/adapters/README.md` |
| Validator is green at 519 PASS / 0 FAIL (repo-dev tool — not prescribed to adopters, cited here only to date-stamp the source repo's own health at time of writing) | `node scripts/validate-l00prite.js 2>/dev/null \| grep -c '^PASS'` and `node scripts/validate-l00prite.js 2>&1 1>/dev/null \| grep -c '^FAIL'` |
| "Nothing checks for prompt drift afterward" gap statement, and `schema_version: 2` on heartbeat/state templates | `grep -n "schema_version" templates/l00prite/heartbeat.json templates/l00prite/state.json` and read `templates/l00prite/prompts/README.md` |
