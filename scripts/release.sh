#!/usr/bin/env bash
#
# release.sh — prepare a release.
#
# Usage: pnpm release:prepare <patch|minor|major>
#
# `develop` is a protected branch, so we cannot commit to it directly. This
# script creates a `release/vX.Y.Z` branch off the latest origin/develop, bumps
# the version in package.json, regenerates CHANGELOG.md from the Conventional
# Commit history, commits, pushes, and opens a PR into `develop`.
#
# It does NOT tag — the tag is created on `production` after the promote PR is
# merged (see scripts/release-tag.sh and docs/RELEASE.md).

set -euo pipefail

BUMP="${1:-}"
BASE_BRANCH="develop"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: pnpm release:prepare <patch|minor|major>" >&2
  exit 1
fi

# --- Preconditions -----------------------------------------------------------

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree is not clean. Commit or stash your changes first." >&2
  exit 1
fi

echo "→ Fetching origin/$BASE_BRANCH …"
git fetch origin "$BASE_BRANCH" --quiet

# --- Branch off the latest develop -------------------------------------------

# Work on a temporary branch first so we can discover the bumped version, then
# rename to release/vX.Y.Z.
git checkout -B release/_prepare "origin/$BASE_BRANCH" --quiet

# --- Bump version ------------------------------------------------------------

echo "→ Bumping $BUMP version …"
new_version="$(pnpm version "$BUMP" --no-git-tag-version | tail -n 1)"   # e.g. v1.1.0
release_branch="release/${new_version}"
echo "  new version: $new_version"

git branch -m "$release_branch"

# --- Regenerate changelog ----------------------------------------------------

echo "→ Regenerating CHANGELOG.md …"
pnpm run --silent changelog

# --- Commit & push -----------------------------------------------------------

git add package.json CHANGELOG.md
git commit --quiet -m "chore(release): ${new_version}"
git push --quiet -u origin "$release_branch"

# --- Open the PR into develop ------------------------------------------------

pr_opened=false
if command -v gh >/dev/null 2>&1; then
  if gh pr create --base "$BASE_BRANCH" --head "$release_branch" \
       --title "chore(release): ${new_version}" \
       --body "Version bump and changelog for ${new_version}. Merge into \`${BASE_BRANCH}\`, then open the promote PR \`${BASE_BRANCH} → production\`."; then
    pr_opened=true
  fi
fi

cat <<EOF

✓ Prepared release ${new_version} on branch ${release_branch}.

Next steps:
EOF

if [[ "$pr_opened" == true ]]; then
  echo "  1. Review & merge the release PR into ${BASE_BRANCH} (opened above)."
else
  echo "  1. Open a PR ${release_branch} → ${BASE_BRANCH} and merge it:"
  echo "       gh pr create --base ${BASE_BRANCH} --head ${release_branch} --title \"chore(release): ${new_version}\" --fill"
fi

cat <<EOF
  2. Open the promote PR ${BASE_BRANCH} → production:
       gh pr create --base production --head ${BASE_BRANCH} --title "release: ${new_version}" --fill
  3. Merge it → Coolify auto-deploys production.
  4. Tag the release:
       pnpm release:tag ${new_version}
EOF
