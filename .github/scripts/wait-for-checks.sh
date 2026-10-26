#!/usr/bin/env bash
#
# wait-for-checks.sh — block until every check on a PR has finished, and fail
# if any of them failed.
#
# Usage: .github/scripts/wait-for-checks.sh <pr-number>
#
# `gh pr checks --watch` exits at once with "no checks reported" when it runs
# before GitHub has queued the PR's workflows, so this waits for the first
# check to show up before watching.

set -euo pipefail

PR="${1:?Usage: wait-for-checks.sh <pr-number>}"

for attempt in $(seq 1 30); do
  if [[ "$(gh pr checks "$PR" --json name --jq length 2>/dev/null || echo 0)" -gt 0 ]]; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "::error::No checks appeared on PR #$PR within five minutes." >&2
    exit 1
  fi
  sleep 10
done

# Checks can still be queueing when the first one appears.
sleep 30

gh pr checks "$PR" --watch --fail-fast --interval 30
