# Known Failures

Record failed approaches and why they should not be retried unless conditions change.

## Failed Approaches
- Documenting `status: "expired"` as a valid `lock.json` state without a rule permitting its
  acquisition/reclamation (fixed — see `LOCKING.md` rules 2 and 4, and `memory.md`).
- Telling an agent to stop on *any* active, unexpired lock, including one it already owns —
  this made an agent updating several protected files in one run block on its own first
  write. Fixed by scoping the "respect an active lock" rule to locks owned by a different
  agent/session (`LOCKING.md` rule 3).
- Maintaining the loop prompts as four hand-synchronized copies with keyword-only
  validation — copies drifted in spirit (a hardcoded `.codex/prompts/` path shipped inside
  even the Claude mirrors) and one PR had to fix the same bug in 13 places. Do not add a
  prompt copy without adding it to the validator's byte-parity mirror list.
- Execution-mode designs rejected during the 2026-07-02 adversarial design review — do not
  retry these shapes:
  - `--execute` writing `execution.enabled: true` at scaffold time ("pre-arming"): the
    confirmation would predate the code it covers, and the repo would sit armed on disk for
    any later agent to discover.
  - Treating a persisted `preflight_confirmed: true` as authorization for a new run: the
    field lives in agent-writable `heartbeat.json`, so it is forgeable and transferable
    across sessions — audit record only.
  - Bare-pointer vendor adapters ("read AGENTS.md"): they deliver nothing on Copilot
    surfaces that can't open files, and Zed's first-match priority list would let
    `.github/copilot-instructions.md` shadow `AGENTS.md` entirely.
  - Shipping `.aider.conf.yml` (or any auto-loaded vendor config) into target repos: Aider
    merges config per-key with repo-root winning, silently overriding user settings, and
    the conventional `.aider*` gitignore pattern swallows the file anyway.
  - Naming the execution boundary list `stop_conditions`: heartbeat.json already has a
    top-level `stop_conditions` with different semantics; the collision made governance
    ambiguous. It is `run_boundaries`.

## Blockers
- None currently active.
