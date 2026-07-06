#!/usr/bin/env bash
# sync-prompt-mirrors.sh — copy ONE canonical loop prompt to its six mirror locations.
#
# Scope: l00prite repo development (Part B of the l00prite-diagnostics-and-tooling skill).
# This is the mechanical half of the byte-parity edit procedure. It does NOT tell you what to
# change — edit templates/l00prite/prompts/<name>.md YOURSELF first (that edit is the actual
# protocol change and, per l00prite-change-control, may need its own review/ledger treatment);
# only then run this script to propagate the byte-identical copy everywhere else.
#
# DEFAULT IS DRY RUN. This script writes real files OUTSIDE .claude/skills/ when run with
# --apply — that is expected (its whole job is to update the seven prompt mirrors), but it
# means an agent session bound to "write only inside my skill directory" must never pass
# --apply itself; only a human or a session explicitly authorized to edit the wider repo should
# do that, and only after editing the canonical file.
#
# Usage:
#   bash sync-prompt-mirrors.sh <prompt-name>              # dry run (default)
#   bash sync-prompt-mirrors.sh <prompt-name> --dry-run    # dry run (explicit)
#   bash sync-prompt-mirrors.sh <prompt-name> --apply      # actually copy, then self-verify
#
# <prompt-name> is one of: resume-loop, heartbeat, event-loop, respond-to-review,
# handoff-summary, execute-loop
#
# On --apply, this script re-runs check-parity.sh at the end so a successful exit means the
# copy actually landed byte-identical everywhere — but it does NOT run
# node scripts/validate-l00prite.js for you; do that next (see the l00prite-change-control
# skill's byte-parity procedure for the full expected-PASS-count check).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$ROOT" || { echo "error: could not resolve repo root from $SCRIPT_DIR" >&2; exit 2; }

if [[ ! -d "templates/l00prite/prompts" ]]; then
  echo "error: templates/l00prite/prompts/ not found under $ROOT" >&2
  echo "This script only runs inside a checkout of the l00prite repo itself." >&2
  exit 2
fi

VALID_NAMES=(resume-loop heartbeat event-loop respond-to-review handoff-summary execute-loop)

# Hardcoded copy of the same 6-location mirror list scripts/validate-l00prite.js and
# check-parity.sh use (verified 2026-07-06). Keep all three lists in sync by hand.
MIRROR_DIRS=(
  ".claude/prompts"
  ".codex/prompts"
  "templates/claude/prompts"
  "templates/codex/prompts"
  ".l00prite/prompts"
  "examples/vendor-neutral-output/.l00prite/prompts"
)

name="${1:-}"
mode="${2:---dry-run}"

if [[ -z "$name" ]]; then
  echo "usage: $0 <prompt-name> [--dry-run|--apply]" >&2
  echo "prompt-name must be one of: ${VALID_NAMES[*]}" >&2
  exit 2
fi

valid=0
for n in "${VALID_NAMES[@]}"; do
  [[ "$n" == "$name" ]] && valid=1
done
if [[ "$valid" -eq 0 ]]; then
  echo "error: unknown prompt name '$name' — must be one of: ${VALID_NAMES[*]}" >&2
  exit 2
fi

apply=0
case "$mode" in
  --apply) apply=1 ;;
  --dry-run) apply=0 ;;
  *) echo "error: unknown mode '$mode' — must be --dry-run or --apply" >&2; exit 2 ;;
esac

canonical="templates/l00prite/prompts/$name.md"
if [[ ! -f "$canonical" ]]; then
  echo "error: canonical file $canonical does not exist" >&2
  exit 2
fi

if [[ "$apply" -eq 0 ]]; then
  echo "DRY RUN — no files will be written. Pass --apply to actually copy."
  echo
fi

for dir in "${MIRROR_DIRS[@]}"; do
  target="$dir/$name.md"
  if [[ "$apply" -eq 1 ]]; then
    mkdir -p "$dir"
    cp "$canonical" "$target"
    echo "wrote      $target"
  else
    echo "would copy $canonical -> $target"
  fi
done

echo
if [[ "$apply" -eq 1 ]]; then
  echo "running check-parity.sh to confirm the copy landed byte-identical..."
  bash "$SCRIPT_DIR/check-parity.sh"
  parity_exit=$?
  echo
  echo "Next: node scripts/validate-l00prite.js 2>&1 | grep -i fail   (expect 0 FAIL lines)"
  exit "$parity_exit"
else
  echo "(dry run only — re-run with --apply to write, which then auto-runs check-parity.sh)"
  exit 0
fi
