#!/usr/bin/env bash
# run-doctor.sh — portable wrapper for l00prite-doctor.js.
#
# Scope: any l00prite-managed project (Part A of the l00prite-diagnostics-and-tooling skill).
# Copy-ready: if this whole skill directory is copied into an adopter project's
# `.claude/skills/l00prite-diagnostics-and-tooling/`, this script still works there without
# assuming it is running inside the l00prite protocol repo.
#
# What it does: finds a copy of l00prite-doctor.js and runs it against a target project
# directory (default: current directory). l00prite-doctor.js is a read-only, dependency-free
# Node script — see its own header comment for exactly what it checks.
#
# It looks for l00prite-doctor.js in this order, using the FIRST one found:
#   1. $L00PRITE_DOCTOR_PATH          (explicit override — set this if you have your own copy)
#   2. <target-project>/scripts/l00prite-doctor.js   (a project that vendored its own copy)
#   3. the copy bundled next to this script          (l00prite-doctor.js, same directory)
#
# The bundled copy (option 3) is a VENDORED SNAPSHOT, dated 2026-07-06, from the l00prite
# repo's own scripts/l00prite-doctor.js (md5 2e9bb058a6e46c466a21487334abbf44 at that time). It
# is provided so this wrapper is useful immediately after the skill directory is copied
# somewhere with no network access back to the l00prite repo. It is NOT guaranteed to be the
# latest version — l00prite-doctor.js is a plain, dependency-free Node script with no version
# field of its own, so periodically re-fetch it from a fresh l00prite checkout
# (scripts/l00prite-doctor.js) and replace the bundled copy here if you want the latest checks.
#
# Usage:
#   bash run-doctor.sh [path-to-project]     # default: current directory
#
# Exit code: passed straight through from l00prite-doctor.js (0 = HEALTHY or OK WITH WARNINGS,
# non-zero = at least one FAIL-level finding, or 2 if the target has no .l00prite/ at all).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-.}"

DOCTOR=""
SOURCE_DESC=""

if [[ -n "${L00PRITE_DOCTOR_PATH:-}" && -f "${L00PRITE_DOCTOR_PATH:-}" ]]; then
  DOCTOR="$L00PRITE_DOCTOR_PATH"
  SOURCE_DESC="explicit override (\$L00PRITE_DOCTOR_PATH)"
elif [[ -f "$TARGET/scripts/l00prite-doctor.js" ]]; then
  DOCTOR="$TARGET/scripts/l00prite-doctor.js"
  SOURCE_DESC="project's own vendored copy ($TARGET/scripts/l00prite-doctor.js)"
elif [[ -f "$SCRIPT_DIR/l00prite-doctor.js" ]]; then
  DOCTOR="$SCRIPT_DIR/l00prite-doctor.js"
  SOURCE_DESC="bundled snapshot (dated 2026-07-06 — see this script's header) at $SCRIPT_DIR/l00prite-doctor.js"
else
  echo "error: could not find l00prite-doctor.js anywhere." >&2
  echo "Set \$L00PRITE_DOCTOR_PATH, or place a copy at $TARGET/scripts/l00prite-doctor.js," >&2
  echo "or restore the bundled copy at $SCRIPT_DIR/l00prite-doctor.js." >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is not on PATH — l00prite-doctor.js needs a Node.js runtime (no other deps)." >&2
  exit 2
fi

echo "running: node \"$DOCTOR\" \"$TARGET\"   (doctor source: $SOURCE_DESC)" >&2
echo >&2
exec node "$DOCTOR" "$TARGET"
