#!/usr/bin/env bash
# check-parity.sh — read-only byte-parity check for l00prite's canonical loop prompts.
#
# Scope: l00prite repo development (Part B of the l00prite-diagnostics-and-tooling skill).
# This script only makes sense inside a checkout of the l00prite repo itself — it hardcodes
# paths that exist only there (templates/l00prite/prompts/, the .claude/.codex mirrors, the
# examples/vendor-neutral-output copy). It does not apply to a project that merely USES
# l00prite; that project's own prompt self-parity is what l00prite-doctor.js's "prompt mirrors
# are byte-identical" check covers instead.
#
# What it does: compares each of the six canonical loop prompts under
# templates/l00prite/prompts/<name>.md against its mirrors, plus the two parity-checked
# non-prompt documents (prompts/README.md, LOCKING.md). Never writes anything.
#
# The MIRROR_DIRS list below is a hardcoded COPY of the MIRROR_DIRS array in
# scripts/validate-l00prite.js (verified against that file as of 2026-07-06). If the
# validator's list ever changes, update this copy to match — this script does not (and should
# not) `require()` or parse the validator to derive it, since scripts/validate-l00prite.js is
# a review-gated file this skill must never edit and should not silently depend on the shape of.
#
# Usage:
#   bash check-parity.sh              # run from anywhere; resolves the repo root itself
#
# Exit 0: every checked file is byte-identical to its canonical source.
# Exit 1: at least one file has drifted — the report below names the exact `diff` command to
#         inspect it, and the fix (edit the canonical file, then re-copy — see
#         sync-prompt-mirrors.sh and the l00prite-change-control skill's byte-parity procedure).

set -uo pipefail

# Resolve the l00prite repo root. This script lives at
# .claude/skills/l00prite-diagnostics-and-tooling/scripts/check-parity.sh, four levels under
# the repo root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$ROOT" || { echo "error: could not resolve repo root from $SCRIPT_DIR" >&2; exit 2; }

if [[ ! -d "templates/l00prite/prompts" ]]; then
  echo "error: templates/l00prite/prompts/ not found under $ROOT" >&2
  echo "This script only runs inside a checkout of the l00prite repo itself." >&2
  exit 2
fi

PROMPT_NAMES=(resume-loop heartbeat event-loop respond-to-review handoff-summary execute-loop)

# Hardcoded copy of scripts/validate-l00prite.js's MIRROR_DIRS (verified 2026-07-06).
MIRROR_DIRS=(
  ".claude/prompts"
  ".codex/prompts"
  "templates/claude/prompts"
  "templates/codex/prompts"
  ".l00prite/prompts"
  "examples/vendor-neutral-output/.l00prite/prompts"
)

CANONICAL_DIR="templates/l00prite/prompts"
drift=0
checked=0
declare -a drift_lines=()

compare() {
  local canonical="$1" mirror="$2"
  if [[ -f "$canonical" && -f "$mirror" ]]; then
    checked=$((checked + 1))
    if ! cmp -s "$canonical" "$mirror"; then
      drift=$((drift + 1))
      drift_lines+=("$mirror  (differs from $canonical — inspect with: diff \"$canonical\" \"$mirror\")")
    fi
  fi
}

for name in "${PROMPT_NAMES[@]}"; do
  canonical="$CANONICAL_DIR/$name.md"
  if [[ ! -f "$canonical" ]]; then
    echo "SKIP  $canonical does not exist — cannot check its mirrors"
    continue
  fi
  for dir in "${MIRROR_DIRS[@]}"; do
    compare "$canonical" "$dir/$name.md"
  done
done

# README.md and LOCKING.md: one document, mirrored into the two live-memory copies only — the
# .claude/prompts and .codex/prompts directories never carried a README.md or LOCKING.md (they
# hold only the six loop-prompt .md files).
compare "templates/l00prite/prompts/README.md" ".l00prite/prompts/README.md"
compare "templates/l00prite/prompts/README.md" "examples/vendor-neutral-output/.l00prite/prompts/README.md"
compare "templates/l00prite/LOCKING.md" ".l00prite/LOCKING.md"
compare "templates/l00prite/LOCKING.md" "examples/vendor-neutral-output/.l00prite/LOCKING.md"

echo "Checked $checked file(s) against their canonical source."
if [[ "$drift" -eq 0 ]]; then
  echo "PARITY OK — 0 drifted"
  exit 0
else
  echo
  echo "PARITY FAIL — $drift of $checked file(s) drifted from canonical:"
  for line in "${drift_lines[@]}"; do
    echo "  DRIFT $line"
  done
  echo
  echo "Fix: edit the canonical file under templates/l00prite/prompts/ (or LOCKING.md), then"
  echo "re-copy it to every mirror (see sync-prompt-mirrors.sh --apply), then re-run:"
  echo "  node scripts/validate-l00prite.js 2>&1 | grep -i fail"
  exit 1
fi
