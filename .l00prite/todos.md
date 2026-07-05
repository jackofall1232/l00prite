# Prioritized TODOs

## Active — L00prite OS build pass (maintainer brief, branch `OS-APK`, 2026-07-05)

Maintainer brief: evolve the repo toward "L00prite OS" — an installable, vendor-neutral
autonomous software-engineering application (add keys → connect repo → prompt → Start).
Build on `cli-os/`; do not discard existing work; zero edits to the two review-gated files;
maintainer opens the PR. Units, in order:

- [ ] `cli-os/docs/os-architecture.md` — L00prite OS design: run engine that mechanically
      embodies `execute-loop.md` (pre-flight display, Start-click = in-session confirmation,
      one-unit iterations, nine run boundaries in code, Autonomous-Edit Denylist enforcement,
      resumable exits), role-aware multi-provider team assembly over the existing
      auto-routing, configurable approval gates, packaging plan, multi-version roadmap.
- [ ] Capability/routing v2 — role task-rank maps in config (opinions) + role profiles
      (`plan`/`code`/`review`/`summarize`) + run objectives (cost/speed/quality/privacy/
      balanced) resolving deterministically through the existing auto-router. No ML.
- [ ] `internal/engine/` — run aggregate + SQLite persistence, target-repo `.l00prite/`
      persistence per the protocol (scaffold if missing, lock lease, heartbeat arming,
      ledger append, stale-run recovery), iteration loop (plan → execute tool-loop via
      `runTurn` → verify → persist → boundary check), engine tool registry (repo-jailed fs,
      git, allowlisted commands), approval-gate queue.
- [ ] `/v1/runs*` API — create/preflight/start(confirm)/status/events/approve/stop, same
      auth + flat-action conventions as `/v1/providers*`.
- [ ] Dashboard Runs view — create wizard, pre-flight + Start, live run view, approvals
      inbox, stop; GitHub-clone option on repo connect.
- [ ] Packaging — pure-Go cross-compile dist matrix (win/mac/linux), `install.ps1`,
      extend `install.sh`, INSTALL/GETTING_STARTED updates.
- [ ] Tests — engine against the mock adapter (boundaries, gates, denylist, resume),
      `go test ./...`, validator zero FAIL, doctor HEALTHY.

## Next
- [ ] Maintainer decisions on l00prite CLI-OS design (branch `claude/looprite-cli-os-jntwqi`,
      `cli-os/`): answer `cli-os/docs/open-questions.md` — esp. Q1 (which providers in v1),
      Q2 ("quality" in routing), Q3 (runtime language), Q7 (authoritative pricing). Bless
      assumption A1 (CLI-OS supersedes the "no backend" constraint for the `cli-os/` subtree
      only). Implementation of the Gateway/Memory tracks waits on these.
- [ ] Maintainer review of branch `claude/powerful-helper-agent-pfsyj1` (v1.1: universal
      agent layer + Execution Mode), including the two review-gated files changed at the
      maintainer's direction: `.claude/commands/build-loop.md` and
      `scripts/validate-l00prite.js`. Merge to `main` when satisfied.

## Later
- [ ] Runtime harness that mechanically enforces run boundaries and iteration budgets
      (today they are validator-enforced prompt invariants; a harness would make them
      guarantees a non-compliant model can't ignore).
- [ ] GitHub event ingestion (turn real PR comments into `.l00prite/events/` entries
      automatically).
- [ ] CI failure capture as events.
- [ ] CI workflow for this repo that runs `node scripts/validate-l00prite.js` on every PR —
      the human-review-only rule has no automated backstop yet.
- [ ] Cross-agent compatibility tests, including a mid-execution boundary stop resumed by a
      different vendor's agent.
- [ ] Richer, filled-in examples (a real resolved PR review, a real Execution Mode run
      ledger with a boundary stop and resume).
- [ ] Ledger growth management (archival/rotation conventions).
- [ ] Stack-specific skeleton packs.
- [ ] Release packaging so setup isn't fully manual.

## v1.2 gated batch (maintainer review required — review together, do not start piecemeal)

The 2026-07-04 gap pass (doctor, failure/anti-pattern catalogs, Autonomous-Edit Denylist,
no-progress telemetry) deliberately touched **zero** review-gated files. The following work
is genuinely valuable but *requires* editing `.claude/commands/build-loop.md` and/or
`scripts/validate-l00prite.js`, so it is quarantined here as one coherent batch for the
maintainer to review as a unit — so nobody is tempted to "just quickly" touch a gated file.

- [ ] **Formal resource-guard boundaries** — promote no-progress + budget from telemetry to
      real run boundaries: add `no_progress_detected` and `budget_exceeded` (nine → eleven).
      Budget must be **wall-clock-first** (`time_budget_seconds` + `started_at` — the only
      cost axis a file can honestly check); any token figure is labelled an estimate, never
      an enforcement input. Touches: `execute-loop.md` boundary list (all 7 mirrors),
      `heartbeat.json` `run_boundaries` (3 copies) + budget/time fields, **both** hardcoded
      arrays in the gated validator (`RUN_BOUNDARIES` and `RUN_BOUNDARY_IDS`), the gated
      `build-loop.md` "nine run boundaries" line, and a "nine → eleven" prose sweep
      (README, HANDOFF, CLAUDE, `.claude/README.md`, blueprint).
- [ ] **Machine-parseable run-log** — `templates/l00prite/run-log.jsonl` (one JSON object per
      run: `run_id`, `started_at`, `duration_s`, `iterations`, `items`, `actions`,
      `escalations`, `outcome`, `tokens_estimate` marked estimated) + a dependency-free
      `scripts/l00prite-run-log.js` appender with size-capped rotation + a persist-step
      sentence in `execute-loop.md` + gated scaffold emission from `build-loop.md`. The
      wall-clock substrate the budget boundary reads.
- [ ] **Phased autonomy levels** — `execution.autonomy_level`
      (`report_only` | `assisted` | `unattended`) designed strictly as a **restriction
      ladder** (a level may only *remove* permissions vs today's confirmed Execution Mode;
      `unattended` is exactly today's behavior). Captured at pre-flight, shown in the
      display, ships `report_only`/null default. Touches `execute-loop.md`, the gated
      `build-loop --execute` handoff, and possibly a gated validator field check. Needs its
      own design review; must never weaken the single confirmed-pre-flight entry.
- [ ] **Independent verifier prompt** — a seventh canonical loop prompt, but only *after* the
      runtime harness exists, so the checker is a genuinely separate invocation, not the
      implementer narrating self-review. Touches `PROMPT_NAMES` in the gated validator, the
      gated `build-loop` copy list, all 7 mirror locations, adapters, and every "six loop
      prompts" mention.
- [ ] **Pattern library + `--pattern` scaffold flag** — a JSON (not YAML) pattern registry +
      per-pattern docs with disarmed defaults and mandatory human gates, plus a gated
      `build-loop --pattern` flag. Decide first whether a pattern marketplace belongs in a
      memory/execution protocol or as a layer on top.
- [ ] **Additive validator assertions** (gated) for the 2026-07-04 pass so its invariants are
      enforced, not just present: each `constraints.md` copy carries the Autonomous-Edit
      Denylist block; `failures.md` carries the seeded inherited catalog; `heartbeat.execution`
      has `iterations_since_progress` / `last_progress_iteration` / `no_progress_threshold`.

## Done
- [x] `/build-loop` slash command and Loop Engineering scaffolding — 2026-06-30.
- [x] Dogfood `/build-loop`, fix bugs found — 2026-06-30.
- [x] Codex prompt equivalents, Claude/Codex parity — 2026-07-01.
- [x] README repositioned as vendor-neutral loop memory protocol — 2026-07-01.
- [x] Protocol hardening: lock/lease convention, untrusted-content warnings, event ID
      format, ledger verification-evidence fields — 2026-07-01.
- [x] Branding: ASCII banner and SVG logo — 2026-07-01.
- [x] First public release (v1: scaffold, memory, event, and handoff layers; execution mode
      explicitly out of scope for that release) — 2026-07-01.
- [x] Universal agent layer: canonical prompts in `templates/l00prite/prompts/` with
      byte-identical mirrors (validator-enforced), `AGENTS.md.template`, fixed protocol
      section in `CLAUDE.md.template`, vendor adapters (Gemini CLI, Qwen Code, Copilot,
      Cursor, Windsurf, Aider) + `templates/vendors.json`, dogfooded at this repo's root —
      2026-07-02 (in review).
- [x] Opt-in Execution Mode: `execute-loop` prompts everywhere + `/execute-loop` command,
      `--execute` handoff on `build-loop`, pre-flight display + explicit in-session
      confirmation gate, nine run boundaries, resumable exits, schema v2
      `heartbeat.json`/`state.json` execution fields, self-modification guard — 2026-07-02
      (in review).
- [x] Loop-maturity gap pass (from analyzing loop-engineering), zero gated-file edits —
      2026-07-04:
  - [x] `scripts/l00prite-doctor.js` — read-only, dependency-free health check for a
        scaffolded project's `.l00prite/` (arming consistency, state↔heartbeat drift, stale
        arming, prompt self-parity, ledger evidence, pending-count, denylist/seeded-catalog
        presence, no-progress stall). Passes clean on this repo and the example.
  - [x] `docs/failure-modes.md`, `docs/anti-patterns.md`, `docs/concepts.md`, `docs/README.md`
        — l00prite-specific loop-wisdom catalogs (S1/S2/S3), each mapped to the boundary/lock/
        doctor/denylist that guards it; adapted from loop-engineering.
  - [x] Seeded `failures.md` (template + example + dogfood) with an inherited generic
        failure-mode catalog, clearly marked as not project history.
  - [x] Autonomous-Edit Denylist in `constraints.md` (template + example + dogfood):
        machine-readable protected-path globs enforced via the **existing**
        `destructive_operation_required` boundary — no new boundary, loop-immutable.
  - [x] No-progress telemetry: additive `execution.iterations_since_progress` /
        `last_progress_iteration` / `no_progress_threshold` (disarmed-neutral, 3 copies) +
        `execute-loop.md` persist-step maintenance mapped to the existing `human_review_gate`
        + doctor stall check. Formal `no_progress_detected` boundary deferred to the v1.2
        gated batch above.
