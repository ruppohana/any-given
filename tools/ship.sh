#!/usr/bin/env bash
# 🔴 TESTS GATE THE DEPLOY. Written 2026-09-09 after shipping through a red
# suite three times in one afternoon.
#
# The habit was `npm test | grep ... && wrangler deploy`, and grep SUCCEEDS when
# it finds the line "fail 1" - so the && chain read a failing suite as a reason
# to continue. The pipeline was reporting the failure and deploying anyway, which
# is worse than not running the tests at all: it produces the paperwork of having
# checked.
#
# 🔴 A CHECKOUT BEHIND origin/main REFUSES TOO. Added 2026-09-13, after two
# sessions shipped from this repo in one evening. This script deploys the WORKING
# TREE, not a commit - so a checkout that has not pulled puts its old files back
# over whatever the other session pushed. One had pushed af7b9e7 (info button
# removed, live as Worker b6c59dca); the other was still at d7e4391 with
# uncommitted work, and its ship.sh would have put the old p2-slate back live
# without a word. Caught only because the first session sent a message.
#
# So before the tests: fetch origin/main and refuse unless HEAD contains it. If
# the fetch fails (no network, or Git Credential Manager wanting a terminal in
# Git Bash) it says so and checks the last-fetched origin/main instead. Uncommitted
# changes only warn - the deploy will then match no commit.
#
# Escape hatch: `SHIP_ALLOW_BEHIND=1 tools/ship.sh` deploys anyway. Only after
# reading the missing commits it lists, and meaning to overwrite them.
set -e
ref=refs/remotes/origin/main
fetch_err="$(GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git fetch --quiet origin main 2>&1)" \
  || echo "WARNING: git fetch origin main failed ($(printf '%s' "$fetch_err" | tail -1)) - checking against the last-fetched origin/main."
behind=
if ! git rev-parse --verify --quiet "$ref" >/dev/null; then
  behind="(no origin/main has ever been fetched)"
elif ! git merge-base --is-ancestor "$ref" HEAD; then
  behind="$(git log --oneline "HEAD..$ref" 2>&1)" || true
  behind="${behind:-(could not list them)}"
fi
if [ -n "$behind" ]; then
  echo "HEAD does not contain origin/main. Missing:"
  printf '%s\n' "$behind"
  if [ "${SHIP_ALLOW_BEHIND:-}" != "1" ]; then
    echo "REFUSING TO DEPLOY: this would put older code back live. Commit your work, then: git pull --rebase origin main"
    exit 1
  fi
  echo "SHIP_ALLOW_BEHIND=1 - deploying anyway, over the commits above."
fi
[ -z "$(git status --porcelain)" ] || echo "WARNING: uncommitted changes - this deploy will not match any commit."
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
