-- Move project roles from ProjectMember (per translation project) onto UserLanguage
-- (per language). A UserLanguage row now grants its role on every translation
-- project in that language, and ProjectMember is dropped.

-- AlterTable: existing language assignments were display-only, so they become
-- translators — the lowest role — unless a ProjectMember below upgrades them.
ALTER TABLE "user_language" ADD COLUMN "role" "ProjectRole" NOT NULL DEFAULT 'TRANSLATOR';

-- Collapse each user's project memberships down to one role per language,
-- keeping the highest role they held anywhere in that language.
WITH member_language_role AS (
  SELECT
    pm."userId"        AS user_id,
    tp."languageId"    AS language_id,
    MAX(
      CASE pm."role"
        WHEN 'PROJECT_MANAGER' THEN 4
        WHEN 'EDITOR'          THEN 3
        WHEN 'REVIEWER'        THEN 2
        ELSE 1
      END
    )                  AS role_rank,
    MIN(pm."createdAt") AS created_at
  FROM "project_member" pm
  JOIN "translation_project" tp ON tp."id" = pm."translationProjectId"
  GROUP BY pm."userId", tp."languageId"
),
highest_role AS (
  SELECT
    user_id,
    language_id,
    created_at,
    (CASE role_rank
      WHEN 4 THEN 'PROJECT_MANAGER'
      WHEN 3 THEN 'EDITOR'
      WHEN 2 THEN 'REVIEWER'
      ELSE 'TRANSLATOR'
    END)::"ProjectRole" AS role
  FROM member_language_role
)
INSERT INTO "user_language" ("id", "userId", "languageId", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid(), hr.user_id, hr.language_id, hr.role, hr.created_at, CURRENT_TIMESTAMP
FROM highest_role hr
ON CONFLICT ("userId", "languageId") DO UPDATE
  SET "role" = EXCLUDED."role",
      "updatedAt" = CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "user_language_languageId_role_idx" ON "user_language"("languageId", "role");

-- DropTable
DROP TABLE "project_member";
