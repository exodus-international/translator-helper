#!/usr/bin/env bash
# Clone the production database into staging, then make staging safe to click
# around in.
#
#   PROD_URL=postgres://…/prod STAGING_URL=postgres://…/staging ./scripts/clone-prod-to-staging.sh
#
# Run this BEFORE deploying a branch with a new migration. The dump carries
# production's _prisma_migrations table, so staging lands at production's exact
# migration state and the next deploy runs the new migration against
# production-shaped data. That is the rehearsal. Deploying first and cloning
# after would undo it.
#
# Production is only ever read (pg_dump). Staging is dropped and recreated.
set -euo pipefail

: "${PROD_URL:?set PROD_URL to the production connection string (read only)}"
: "${STAGING_URL:?set STAGING_URL to the staging connection string (WILL BE ERASED)}"

if [ "$PROD_URL" = "$STAGING_URL" ]; then
  echo "error: PROD_URL and STAGING_URL are the same. Refusing." >&2
  exit 1
fi

# Cheap guard against a swapped pair. Adjust the pattern to your hostnames.
if printf '%s' "$STAGING_URL" | grep -qiE 'prod|production'; then
  echo "error: STAGING_URL looks like production: ${STAGING_URL%%\?*}" >&2
  echo "       This script ERASES the target. Refusing." >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "error: pg_dump not found" >&2; exit 1; }

dump=$(mktemp -t prod-dump-XXXXXX.sql)
trap 'rm -f "$dump"' EXIT

echo "==> Dumping production (read only)"
pg_dump --clean --if-exists --no-owner --no-privileges "$PROD_URL" > "$dump"
echo "    $(wc -l < "$dump") lines, $(du -h "$dump" | cut -f1)"

echo "==> Restoring into staging"
psql --quiet --set ON_ERROR_STOP=1 "$STAGING_URL" < "$dump"

echo "==> Making staging safe"
psql --quiet --set ON_ERROR_STOP=1 "$STAGING_URL" <<'SQL'
-- A deploy resolves its target branch from language.branchName in the DATABASE,
-- while the repository comes from env. With production's rows restored, a
-- deploy from staging would commit to the real translation branches. Clearing
-- these makes deployDocument throw "does not have a branchName configured"
-- instead, which is the failure you want here.
UPDATE "language" SET "branchName" = NULL WHERE "branchName" IS NOT NULL;

-- Sessions and one-shot tokens should not survive a copy into a less protected
-- environment. Everyone signs in again on staging.
TRUNCATE "session";
TRUNCATE "verification";

-- Outstanding invitation tokens would otherwise be redeemable against staging.
DELETE FROM "invitation" WHERE "status" = 'PENDING';

SELECT 'languages with a branch (want 0): ' || count(*) FROM "language" WHERE "branchName" IS NOT NULL;
SELECT 'sessions (want 0): ' || count(*) FROM "session";
SELECT 'projects: ' || count(*) FROM "source_project";
SELECT 'documents: ' || count(*) FROM "document";
SQL

cat <<'EOF'

==> Done. Before deploying the migration, confirm on staging:

  * AUDIO_S3_KEY_PREFIX differs from production, or audio generated on
    staging will overwrite production objects that share a key.
  * NEXT_PUBLIC_APP_URL is the staging origin.
  * Production password hashes came across with the user table, so a
    production password signs in on staging. Restrict access accordingly.

Then deploy the branch and check what the migration made of the identifiers:

  SELECT name, identifier FROM "source_project" ORDER BY identifier;

Every identifier becomes a URL segment, so anything surprising there is
worth fixing before it reaches production.
EOF
