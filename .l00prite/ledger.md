# Run Ledger

Append one entry per agent run. Do not overwrite prior runs.

## Entry Template

### Run YYYY-MM-DDTHH:MM:SSZ — <agent name>
- **Goal:** What this run attempted.
- **Triggering event:** Event id/type/source, or `none` for normal roadmap work.
- **Reviewer/comment reference:** PR, issue, CI run, reviewer, URL, file/line, or `none`.
- **Decision:** Valid, already fixed, unclear, unsafe, blocked, deferred, stale-lock-recovery, or normal work; include why.
- **Completed work:** What changed or was learned.
- **Fix implemented:** The smallest fix made for the event, or `none` with reason.
- **Changed files:** Files created, modified, deleted, or intentionally left untouched.
- **Tests run / Verification:** One entry per check run, each with `command`, `exit_code`,
  `summary`, `evidence_path` (optional), and `timestamp`. Do not write vague statements like
  "tests passed" without at least `command`, `exit_code`, and `summary`.
- **Response drafted/sent:** Reviewer, issue, or human response status and summary.
- **Event status:** Pending, processing, completed, blocked, deferred, or not applicable.
- **Failures:** Errors, blockers, failed approaches, or skipped checks.
- **Decisions:** Durable decisions made during the run.
- **Confidence:** Low/medium/high plus a short reason.
- **Next action:** The next smallest useful step.
- **Do-not-retry notes:** Failed approaches that should not be repeated unless conditions change.
- **Lock:** `lock_id` acquired/released this run, or `none` if no protected-path write occurred. Note stale-lock reclamation here if applicable.

## Runs

### Run 2026-07-04T02:00:00Z — Claude (Opus 4.8), branch claude/looprite-cli-os-jntwqi
- **Goal:** Implement l00prite CLI-OS v1.0.0 as a runnable, tested product ("make it ready to
  ship") — a real OpenAI-compatible gateway with provider adapters, repo memory, explainable
  routing, real cost tracking, a Policy Enforcement Point, security, a CLI control surface, the
  served dashboard, tests, and Docker/install packaging.
- **Triggering event:** none — direct maintainer instruction in-session ("go ahead and make this
  the full production release make it ready to ship").
- **Reviewer/comment reference:** none.
- **Decision:** Normal work, large build. The maintainer's "ship it" authorized proceeding on
  the recommended defaults; recorded the one transparent change (runtime = zero-dep Node instead
  of the recommended Go) because the build environment blocks module fetch + live-provider egress
  (Go not buildable/testable here) while Node runs natively, matches the existing validator, and
  gives real ACID via built-in node:sqlite. Decisions logged in `cli-os/docs/open-questions.md`
  and `cli-os/RELEASE.md`.
- **Completed work:** Built the full `cli-os/` runtime (~20 modules): OpenAI-compatible ingress
  (streaming + non-streaming, idempotency-aware retry), Anthropic native `/v1/messages`
  translator (SSE blocks → OpenAI chunks) + OpenAI-compatible passthrough + zero-key mock
  upstream, explainable router + circuit breaker, real-usage cost meter, Policy Enforcement Point
  (atomic $ caps reserve→commit/refund, leases) on node:sqlite WAL, AES-256-GCM key vault, opaque
  hashed tokens, `.l00prite/` memory retrieval + untrusted-injection, run ledger + audit, admin
  CLI (init/provider/token/repo/cap/route-explain/serve), served dashboard, Dockerfile + compose
  + install script + `.env.example`, and a `node:test` suite.
- **Fix implemented:** not applicable — new implementation. Incidental: switched ledger insert to
  positional binding; added a re-exec launcher so the node:sqlite ExperimentalWarning never
  reaches operators; added `LOOPRITE_ALLOW_INSECURE_BIND` explicit opt-in for container binds.
- **Changed files:** created `cli-os/{package.json,bin/,src/,test/,public/,install/,Dockerfile,
  docker-compose.yml,.env.example,.gitignore,.dockerignore,RELEASE.md}`; modified
  `cli-os/README.md`, `cli-os/docs/open-questions.md`, and this ledger. No existing protocol
  files, prompts, templates, `.claude/commands/build-loop.md`, or `scripts/validate-l00prite.js`
  touched.
- **Tests run / Verification:**
  - `command`: `npm test` (node:test — vault, tokens, PEP cap enforcement, meter, Anthropic
    request+SSE translation, memory, full e2e server run over the mock upstream)
  - `exit_code`: 0
  - `summary`: 12 pass, 0 fail. e2e covers auth 401, non-stream 200 + ledger, streaming SSE +
    [DONE], cost-cap 402, /healthz, /v1/models.
  - `evidence_path`: `cli-os/test/`
  - `timestamp`: 2026-07-04T02:00:00Z
  - `command`: `node scripts/validate-l00prite.js` (protocol regression guard)
  - `exit_code`: 0
  - `summary`: 0 FAIL — CLI-OS subtree does not affect the prompt-protocol invariants.
  - `timestamp`: 2026-07-04T02:00:00Z
  - `command`: manual smoke — init → provider add → repo register → token mint → serve → curl
    /v1/chat/completions (non-stream + stream), /healthz, dashboard, ledger; safe-bind refusal +
    opt-in
  - `exit_code`: 0
  - `summary`: full operator flow works; server refuses non-loopback bind without TLS and serves
    only under the explicit opt-in.
  - `timestamp`: 2026-07-04T02:00:00Z
- **Response drafted/sent:** implementation summary + honest ship caveats to the maintainer; no
  PR opened (not requested).
- **Event status:** not applicable.
- **Failures:** Live-provider round-trips could NOT be executed — the build environment blocks
  egress to provider domains (403). Adapter translation is unit-tested and the pipeline is
  e2e-tested against the mock upstream, but a real-key smoke test must run in a networked
  environment before production traffic. Provider pricing (except Anthropic) remains unconfirmed.
- **Decisions:** runtime = zero-dep Node; providers = framework + Anthropic native + OpenAI-compat
  + mock; quality = static config rank; `/v1/responses` deferred to v2; memory = naive v1;
  cost cap = hard-block. Recorded in `cli-os/RELEASE.md` and `docs/open-questions.md`.
- **Confidence:** High for the offline-provable surface (tests + validator + smoke). Medium for
  production-at-scale until a networked live-provider smoke test and first-party pricing pass run.
- **Next action:** Maintainer runs a live-provider smoke test with real keys in a networked env,
  confirms provider pricing (Q7), and decides on a PR / release tag. Optional follow-ups: wire the
  dashboard to live `/healthz`+ledger data; `/v1/responses`; embeddings.
- **Do-not-retry notes:** Do not claim live-provider readiness without an egress-enabled smoke
  test; do not backfill provider pricing from training-data memory (manifests keep unconfirmed
  prices null and cost is flagged estimated).
- **Lock:** none acquired. CLI-OS work is in the `cli-os/` subtree (not a lease-protected path);
  the only protected-path write was this `.l00prite/ledger.md` append in a single-agent session.

### Run 2026-07-04T00:00:00Z — Claude (Opus 4.8), branch claude/looprite-cli-os-jntwqi
- **Goal:** Design pass for l00prite CLI-OS — turn the scaffold-only memory protocol into a
  self-hostable coding gateway (OpenAI-compatible endpoint + repo memory + routing + cost
  tracking + safety policy). Deliver an architecture doc, module layout, scoped v1 plan, and
  open questions; verify provider API specs (especially "GLM 5.2") before building against
  them. Report back before writing implementation code beyond adapter-approach validation.
- **Triggering event:** none — direct maintainer build brief in-session (CLI-OS).
- **Reviewer/comment reference:** none.
- **Decision:** Normal work, design-only deliverable. Confirmed the repo is prompt-files +
  JSON + the dependency-free validator with no server/agent runtime, so CLI-OS is greenfield
  runtime code placed in a new non-interfering `cli-os/` subtree. Ran a fan-out research pass
  (Opus researchers; Fable 5 assigned adversarial-verify) to verify current provider specs
  from primary sources.
- **Completed work:** Wrote `cli-os/` docs — `architecture.md` (two-track Gateway/Memory
  design, request lifecycle, PEP enforcement, module boundaries), `interface-contract.md`
  (`MemoryQuery`/`MemoryContext`), `provider-adapters.md` (verified specs + caveats),
  `routing-rules-v1.md`, `security-model.md`, `v1-scope.md`, `open-questions.md`; `README.md`
  with the module tree; module stubs (`gateway/`, `memory/`, `policy/`); and verified example
  provider manifests (`anthropic.json`, `openai.json`, `zhipu.json`). Verified **GLM 5.2 is
  real** (`glm-5.2` in Zhipu's official SDK). Confirmed Anthropic needs a full native
  `/v1/messages` adapter (its OpenAI-compat endpoint is test/eval-only) and OpenAI's dual
  `/v1/chat/completions` vs `/v1/responses` surfaces.
- **Fix implemented:** not applicable — design deliverable, no triggering defect.
- **Changed files:** created `cli-os/**` (docs, README, module stubs, provider manifests);
  modified `.l00prite/ledger.md` (this entry) and `.l00prite/todos.md`. No existing protocol
  files, templates, prompts, `.claude/commands/build-loop.md`, or
  `scripts/validate-l00prite.js` were touched (human-review-gated files left untouched).
- **Tests run / Verification:**
  - `command`: `node scripts/validate-l00prite.js`
  - `exit_code`: 0
  - `summary`: still passes with zero FAIL — CLI-OS lives in a separate subtree the validator
    does not inspect, so the protocol's invariants are unaffected.
  - `evidence_path`: none (console output only).
  - `timestamp`: 2026-07-04T00:00:00Z
  - `command`: provider-spec verification (fan-out web research over vendor OpenAPI specs + SDKs)
  - `exit_code`: n/a
  - `summary`: API shapes high-confidence (from first-party OpenAPI/SDKs on GitHub); pricing for
    several providers third-party/unconfirmed because their first-party doc domains were
    egress-blocked and the proxy denials were respected, not routed around.
  - `evidence_path`: `cli-os/docs/provider-adapters.md` (verification caveats section).
  - `timestamp`: 2026-07-04T00:00:00Z
- **Response drafted/sent:** architecture summary + open questions returned to the maintainer;
  no PR opened (not requested).
- **Event status:** not applicable.
- **Failures:** Fable 5 adversarial-verify verdicts did not complete — the verifiers hit the
  same egress blocks and ran long; the pass was stopped and the researchers' own confidence
  self-assessments used instead. Provider pricing remains unconfirmed pending a first-party pass.
- **Decisions:** two-track (Gateway/Memory) with a typed latency-bounded interface as the
  seam; PEP enforces cost/retry/destructive gates outside the deciding process (dollars, not
  tokens); explainable non-ML routing v1; Anthropic full native adapter vs thin shims for
  OpenAI-compatible providers; CLI-OS supersedes the "no backend" constraint for the new
  subtree only (needs maintainer blessing — recorded as assumption A1).
- **Confidence:** High for architecture/module boundaries and for the GLM 5.2 existence
  finding (primary-source SDK). Medium on provider pricing (third-party, unconfirmed).
- **Next action:** Maintainer answers the open questions (esp. Q1 provider set, Q2 "quality"
  definition, Q3 runtime language) before implementation of the Gateway/Memory tracks begins.
- **Do-not-retry notes:** Do not hardcode provider pricing from training-data memory — the
  manifests deliberately leave unconfirmed prices null/flagged pending a first-party pass.
- **Lock:** none acquired. All CLI-OS work is in the new `cli-os/` subtree, which is not a
  lease-protected path. The only protected-path write was appending this `.l00prite/ledger.md`
  entry (and a `todos.md` line) in a single-agent session with no concurrent writer.

### Run 2026-07-02T00:00:00Z — Claude (Fable), branch claude/powerful-helper-agent-pfsyj1
- **Goal:** v1.1 — make l00prite the most powerful helper protocol for all AI models, per
  the maintainer's direction: evolve from scaffold-and-stop into a two-mode execution
  protocol ("an operating system for autonomous software engineering") with a universal
  vendor layer, while keeping the discipline inside the execution protocol itself.
- **Triggering event:** none — direct maintainer request in-session (initial request plus a
  mid-session direction message setting the execution-first vision).
- **Reviewer/comment reference:** none.
- **Decision:** Normal work, large scope, executed as one reviewed branch. The maintainer's
  direction message explicitly authorized touching the two review-gated files
  (`.claude/commands/build-loop.md`, `scripts/validate-l00prite.js`) on this branch;
  maintainer review before merge still applies. An adversarial three-critic design review
  ran before implementation; its blockers reshaped the design (see `failures.md` for the
  rejected shapes and `memory.md` for the decisions kept).
- **Completed work:** Canonical prompt layer (`templates/l00prite/prompts/`, 7 files) with
  byte-identical mirrors in six locations; new `execute-loop.md` (pre-flight gate, nine run
  boundaries, iteration protocol, resumable exits, self-modification guard) plus
  `/execute-loop` command; schema v2 (`execution` block in `heartbeat.json`,
  execution-run fields in `state.json`, all three copies each); `AGENTS.md.template` +
  fixed protocol section in `CLAUDE.md.template`; vendor adapters
  (Gemini/Qwen/Copilot/Cursor/Windsurf/Aider) + `templates/vendors.json`, dogfooded at repo
  root and mirrored in the example output; both build-loop variants reframed as Planning
  Mode with the `--execute` gate-only handoff (Codex variant strengthened to Claude
  parity); validator extended 209 → 519 checks (byte-parity, adapter integrity,
  execution invariants, both build-loops); README/AGENTS.md/CLAUDE.md/HANDOFF.md/RELEASE.md
  reframed around the two operating modes; `.l00prite/` memory updated (this entry,
  todos, memory, failures, blueprint, state, heartbeat).
- **Fix implemented:** not applicable — feature pass, no triggering defect. Incidental
  fixes: dangling bare-filename prompt references in `.l00prite/README.md` and
  `reviews/README.md`; hardcoded `.codex/prompts/` next-prompt paths inside all
  heartbeat.md copies.
- **Changed files:** see the branch's commit series (each commit carries its own
  verification note); summary in `HANDOFF.md`.
- **Tests run / Verification:**
  - `command`: `node scripts/validate-l00prite.js`
  - `exit_code`: 0
  - `summary`: 519 PASS, 0 FAIL (was 209 PASS before this pass; 498 before the post-review fix round).
  - `evidence_path`: none (console output only).
  - `timestamp`: 2026-07-02T00:00:00Z
  - `command`: `cmp` across all 6 mirror locations × 6 prompts (+ README × 3)
  - `exit_code`: 0
  - `summary`: all mirrors byte-identical to canonical.
  - `evidence_path`: none.
  - `timestamp`: 2026-07-02T00:00:00Z
  - `command`: negative tests — injected drift into a prompt mirror, an adapter dogfood
    copy, and `.l00prite/heartbeat.json` (`enabled: true`)
  - `exit_code`: 1 (expected) then 0 after restore
  - `summary`: byte-parity, adapter-parity, and disarmed-schema checks each FAIL on the
    injected drift and recover after restore.
  - `evidence_path`: none.
  - `timestamp`: 2026-07-02T00:00:00Z
- **Response drafted/sent:** session summary to the maintainer; no PR opened (not
  requested).
- **Event status:** not applicable.
- **Failures:** none in this run; rejected design shapes recorded in `failures.md` as
  do-not-retry.
- **Decisions:** two operating modes; per-run session-local pre-flight; `--execute` never
  pre-arms; `run_boundaries` naming; byte-parity as the parity mechanism; self-sufficient
  adapters; no vendor config shipped. Details in `memory.md`.
- **Confidence:** High for structural correctness (validator + negative tests + byte-parity
  verification); medium for prose-level consistency across the many rewritten docs — an
  adversarial review pass over the full diff runs before push.
- **Next action:** Maintainer reviews branch `claude/powerful-helper-agent-pfsyj1`
  (including the two review-gated files) and merges to `main` if satisfied.
- **Do-not-retry notes:** see `failures.md` (2026-07-02 entries).
- **Lock:** `lock-20260702-000000-claude-v1.1-memory-update` acquired for this
  memory-update phase and released at its end. Earlier writes in this run touched protocol
  files, templates, and docs — none of them lease-protected paths; the protected-path
  writes (`heartbeat.json`, `state.json` schema bumps and this memory update) happened in a
  single-agent session with no concurrent writer, under this lock where the LOCKING.md
  rules require it.

### Run 2026-07-01T00:00:00Z — Claude/Codex
- **Goal:** Pre-release polish pass — correct `CLAUDE.md` to describe the repo's actual
  state instead of an unbuilt execution-mode feature, update `HANDOFF.md`/`README.md`,
  scaffold a real `.l00prite/` for this repo, add `RELEASE.md`, and confirm the validator
  passes clean before this release is considered mergeable.
- **Triggering event:** none — normal pre-release roadmap work requested by the maintainer.
- **Reviewer/comment reference:** none.
- **Decision:** Normal work. `CLAUDE.md` was found to describe an execution-mode design
  (`--execute` flag, pre-flight confirmation, 8 stop conditions) as though it were this
  session's mission, but no corresponding files exist anywhere in the repo — the design was
  written directly into `CLAUDE.md`'s text in an earlier commit (`87384b4`) without any code
  following it. Corrected rather than left as-is, since an inaccurate `CLAUDE.md` would
  mislead the next agent into thinking execution mode already exists.
- **Completed work:** Rewrote `CLAUDE.md` Sections 1-4, 7, and 8 to describe the four
  protocol layers that actually exist (scaffold, memory, event, handoff) and moved
  execution mode to an explicitly-labeled "not yet built" design note. Appended a new update
  section to `HANDOFF.md` documenting the execution-mode design decision, the lock/lease
  `expired`-state gap Codex found and the Option 1 fix already applied, the ASCII banner
  update, and the new `.l00prite/`. Added execution mode to `README.md`'s roadmap and
  verified the ASCII banner fence and SVG logo line are intact. Scaffolded a real
  `.l00prite/` at repo root (previously only `templates/l00prite/` and
  `examples/vendor-neutral-output/.l00prite/` existed) with this repo's actual blueprint,
  constraints, memory, failures, heartbeat, state, todos, and this ledger entry. Added
  `RELEASE.md` describing v1 scope, what's excluded, getting-started steps, and feedback
  channel.
- **Fix implemented:** Documentation correction and `.l00prite/` scaffolding; no protocol
  code, validator, or prompt logic changed.
- **Changed files:** `CLAUDE.md`, `HANDOFF.md`, `README.md` (modified); `.l00prite/README.md`,
  `blueprint.md`, `constraints.md`, `failures.md`, `heartbeat.json`, `ledger.md`,
  `LOCKING.md`, `lock.json`, `memory.md`, `state.json`, `todos.md`,
  `events/README.md` + `pending/README.md` + `processing/README.md` + `completed/README.md`
  + `example-event.json`, `reviews/README.md` + `github/README.md`, `sessions/README.md`,
  `RELEASE.md` (created). `.claude/commands/build-loop.md` and
  `scripts/validate-l00prite.js` intentionally left untouched per the human-review gate.
- **Tests run / Verification:**
  - `command`: `node scripts/validate-l00prite.js`
  - `exit_code`: 0
  - `summary`: 209 PASS, 0 FAIL.
  - `evidence_path`: none (console output only).
  - `timestamp`: 2026-07-01T00:00:00Z
- **Response drafted/sent:** not applicable — no reviewer/PR event.
- **Event status:** not applicable.
- **Failures:** none.
- **Decisions:** Execution mode is the primary next milestone but out of scope for this
  release; recorded in `CLAUDE.md`, `HANDOFF.md`, and `todos.md` consistently.
- **Confidence:** High — validator passes clean, and all changes are documentation/memory,
  not protocol logic, so regression risk is low.
- **Next action:** Maintainer reviews this pass and the pending changes; if satisfied, merge
  to `main`. After merge, the next roadmap item is designing and building execution mode.
- **Do-not-retry notes:** none.
- **Lock:** none acquired — this run is the bootstrap that creates `.l00prite/lock.json`
  itself, so there was no lock file yet to check before the initial writes to `ledger.md`,
  `todos.md`, `state.json`, `heartbeat.json`, `memory.md`, and `failures.md` in this same
  run. Single-agent session, no concurrent writer to guard against. Lock/lease enforcement
  (check-before-write per `LOCKING.md`) applies starting with the next run, now that
  `lock.json` exists.
