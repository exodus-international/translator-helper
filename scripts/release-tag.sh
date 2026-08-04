#!/usr/bin/env bash
#
# release-tag.sh — tag a release on `production` after the release PR is merged.
#
# Usage: pnpm release:tag <vX.Y.Z>
#
# Tags the current tip of origin/production with the given version and creates a
# GitHub Release whose notes are the matching section of CHANGELOG.md. Run this
# once Coolify has deployed the merged release PR (see docs/RELEASE.md).

set -euo pipefail

VERSION="${1:-}"
PROD_BRANCH="production"

if [[ -z "$VERSION" ]]; then
  echo "Usage: pnpm release:tag <vX.Y.Z>" >&2
  exit 1
fi

# Normalise: accept both "1.2.3" and "v1.2.3", always tag as "vX.Y.Z".
VERSION="v${VERSION#v}"

if ! [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "✗ '$VERSION' is not a valid semver tag (expected vX.Y.Z)." >&2
  exit 1
fi

echo "→ Fetching origin/$PROD_BRANCH …"
git fetch origin "$PROD_BRANCH" --quiet

target_sha="$(git rev-parse "origin/$PROD_BRANCH")"

# If the promote was a plain merge, tag its develop-side parent instead: the
# trees are identical, and only a tag reachable from develop lets
# conventional-changelog find "the previous release" on the next
# release:prepare run — a tag on the production-only merge commit is invisible
# there, and the generated section silently balloons to the whole history.
if dev_parent="$(git rev-parse --verify --quiet "$target_sha^2")" &&
  [[ "$(git rev-parse "$target_sha^{tree}")" == "$(git rev-parse "$dev_parent^{tree}")" ]]; then
  target_sha="$dev_parent"
fi

if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "✗ Tag $VERSION already exists." >&2
  exit 1
fi

echo "→ Tagging $VERSION at origin/$PROD_BRANCH ($target_sha) …"
git tag -a "$VERSION" "$target_sha" -m "Release $VERSION"
git push origin "$VERSION"

# Create a GitHub Release if the `gh` CLI is available. Notes come from the
# CHANGELOG section for this version when extractable, otherwise auto-generated.
if command -v gh >/dev/null 2>&1; then
  notes_file="$(mktemp)"
  # Extract the "[X.Y.Z]" (or "X.Y.Z") section from CHANGELOG.md. The heading
  # level varies: conventional-changelog's angular preset writes minor/major
  # releases as "# " and patches as "## ", so match any run of "#".
  # Stop at the next *version* heading — a heading is only a version heading if
  # a digit (or "[") follows, so "### Bug Fixes" stays part of the section.
  awk -v ver="${VERSION#v}" '
    $0 ~ "^#+ \\[?" ver "\\]?" {capture=1; next}
    capture && /^#+ \[?[0-9]+\.[0-9]+\.[0-9]+/ {exit}
    capture {print}
  ' CHANGELOG.md > "$notes_file" || true

  # -s alone passes on whitespace-only extractions; require actual content.
  if grep -q '[^[:space:]]' "$notes_file"; then
    gh release create "$VERSION" --target "$target_sha" --title "$VERSION" --notes-file "$notes_file"
  else
    gh release create "$VERSION" --target "$target_sha" --title "$VERSION" --generate-notes
  fi
  rm -f "$notes_file"
  echo "✓ Created GitHub Release $VERSION."
else
  echo "ℹ gh CLI not found — tag pushed, but no GitHub Release created."
fi

echo "✓ Tagged $VERSION."
