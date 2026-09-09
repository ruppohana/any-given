#!/usr/bin/env bash
# 🔴 TESTS GATE THE DEPLOY. Written 2026-09-09 after shipping through a red
# suite three times in one afternoon.
#
# The habit was `npm test | grep ... && wrangler deploy`, and grep SUCCEEDS when
# it finds the line "fail 1" - so the && chain read a failing suite as a reason
# to continue. The pipeline was reporting the failure and deploying anyway, which
# is worse than not running the tests at all: it produces the paperwork of having
# checked.
set -e
out="$(npm test 2>&1)"
fails="$(printf '%s' "$out" | grep -oE '^ℹ fail [0-9]+' | grep -oE '[0-9]+' || echo 0)"
printf '%s\n' "$out" | grep -E '^ℹ (tests|pass|fail)'
if [ "$fails" != "0" ]; then
  printf '%s\n' "$out" | grep -E '^✖' | head -5
  echo "REFUSING TO DEPLOY: $fails failing test(s)."
  exit 1
fi
node tools/build-static.mjs >/dev/null
npx wrangler deploy 2>&1 | tail -1
