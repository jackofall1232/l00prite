#!/usr/bin/env bash
# verify-all.sh — one-shot green-check for the l00prite repo.
#
# Scope: l00prite repo development (Part B of the l00prite-diagnostics-and-tooling skill).
# Runs, in order: the validator (scripts/validate-l00prite.js), the doctor against this repo's
# own .l00prite/ (scripts/l00prite-doctor.js .), and `go test ./...` from cli-os/. Prints one
# verdict line per tool plus an overall verdict. Read-only: it runs no mutating commands (no
# git, no file writes) — go test may write to the Go build cache, which is normal and outside
# this repo.
#
# Usage:
#   bash verify-all.sh              # validator + doctor + go test
#   bash verify-all.sh --skip-go    # validator + doctor only (e.g. no Go toolchain available)
#
# Exit code: 0 only if every tool that ran exited 0. Non-zero otherwise — see the printed
# verdict lines for which tool failed and the fix pointer (l00prite-debugging-playbook covers
# triage for validator/doctor/go-test failures in depth).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$ROOT" || { echo "error: could not resolve repo root from $SCRIPT_DIR" >&2; exit 2; }

if [[ ! -f "scripts/validate-l00prite.js" ]]; then
  echo "error: scripts/validate-l00prite.js not found under $ROOT" >&2
  echo "This script only runs inside a checkout of the l00prite repo itself." >&2
  exit 2
fi

SKIP_GO=0
for arg in "$@"; do
  case "$arg" in
    --skip-go) SKIP_GO=1 ;;
    *) echo "unknown flag: $arg (supported: --skip-go)" >&2; exit 2 ;;
  esac
done

overall=0

echo "== validator: node scripts/validate-l00prite.js =="
val_out="$(node scripts/validate-l00prite.js 2>&1)"
val_exit=$?
val_pass=$(printf '%s\n' "$val_out" | grep -c '^PASS ')
val_fail=$(printf '%s\n' "$val_out" | grep -c '^FAIL ')
if [[ "$val_exit" -eq 0 ]]; then
  echo "validator: PASS  ($val_pass PASS, $val_fail FAIL, exit $val_exit)"
else
  echo "validator: FAIL  ($val_pass PASS, $val_fail FAIL, exit $val_exit)"
  printf '%s\n' "$val_out" | grep '^FAIL '
  overall=1
fi
echo

echo "== doctor: node scripts/l00prite-doctor.js . =="
doc_out="$(node scripts/l00prite-doctor.js . 2>&1)"
doc_exit=$?
doc_verdict="$(printf '%s\n' "$doc_out" | tail -1)"
if [[ "$doc_exit" -eq 0 ]]; then
  echo "doctor: PASS  ($doc_verdict)"
else
  echo "doctor: FAIL  ($doc_verdict)"
  printf '%s\n' "$doc_out" | grep '^FAIL'
  overall=1
fi
echo

if [[ "$SKIP_GO" -eq 1 ]]; then
  echo "== go test ./... : skipped (--skip-go) =="
else
  echo "== go test ./... (cd cli-os) =="
  if [[ ! -d "cli-os" ]]; then
    echo "go test: SKIPPED (no cli-os/ directory found)"
  else
    go_out="$(cd cli-os && go test ./... 2>&1)"
    go_exit=$?
    if [[ "$go_exit" -eq 0 ]]; then
      echo "go test: PASS  (exit $go_exit)"
    else
      echo "go test: FAIL  (exit $go_exit)"
      # A compile/build error produces no '--- FAIL'/'FAIL ' lines — fall back to the full
      # output so the cause is never hidden.
      if ! printf '%s\n' "$go_out" | grep -E '^(--- FAIL|FAIL[[:space:]])'; then
        printf '%s\n' "$go_out"
      fi
      overall=1
    fi
  fi
fi
echo

if [[ "$overall" -eq 0 ]]; then
  echo "VERDICT: all checks green"
else
  echo "VERDICT: at least one check failed — see above. For triage, load the"
  echo "l00prite-debugging-playbook skill (Part B covers validator/doctor/go-test failures)."
fi
exit "$overall"
