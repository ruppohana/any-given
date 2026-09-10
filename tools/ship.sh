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
# 🔴 `|| true` IS LOAD-BEARING. With `set -e` above and a bare assignment, a
# failing suite kills the script AT THIS LINE - so the gate refuses to deploy
# (right) and prints nothing at all (useless). Every line below, including the
# REFUSING message and the list of failures, was unreachable in exactly the case
# it was written for. Found 2026-09-09: a red suite produced an empty log and a
# bare exit 1.
out="$(npm test 2>&1)" || true
fails="$(printf '%s' "$out" | grep -oE '^ℹ fail [0-9]+' | grep -oE '[0-9]+' || echo 0)"
printf '%s\n' "$out" | grep -E '^ℹ (tests|pass|fail)'
if [ "$fails" != "0" ]; then
  printf '%s\n' "$out" | grep -E '^✖' | head -5
  echo "REFUSING TO DEPLOY: $fails failing test(s)."
  exit 1
fi
node tools/build-static.mjs >/dev/null
npx wrangler deploy 2>&1 | tail -1
