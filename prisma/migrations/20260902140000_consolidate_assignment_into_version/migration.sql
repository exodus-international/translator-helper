-- Consolidate DocumentAssignment into DocumentVersion. Assignment (translator,
-- deadline, who assigned it and when) now lives on the version alongside the
-- reviewer, so the two can no longer drift apart.
--
-- A document_assignment row is keyed by (documentId, translationProjectId), and a
-- translation project pins one language, so each assignment maps onto exactly one
-- (documentId, languageId) version.

-- AlterTable
ALTER TABLE "document_version"
  ADD COLUMN "deadline"     TIMESTAMP(3),
  ADD COLUMN "assignedById" TEXT,
  ADD COLUMN "assignedAt"   TIMESTAMP(3);

-- Back-fill versions for assignments that never got one. These are the rows
-- behind the broken UI this consolidation fixes: assigned documents with nothing
-- to render.
INSERT INTO "document_version" (
  "id", "documentId", "languageId", "content", "status", "version",
  "userId", "reviewerId", "deadline", "assignedById", "assignedAt",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  da."documentId",
  tp."languageId",
  '',
  'PENDING_TRANSLATION',
  1,
  da."userId",
  NULL,
  da."deadline",
  da."assignedById",
  da."assignedAt",
  da."createdAt",
  CURRENT_TIMESTAMP
FROM "document_assignment" da
JOIN "translation_project" tp ON tp."id" = da."translationProjectId"
WHERE NOT EXISTS (
  SELECT 1 FROM "document_version" dv
  WHERE dv."documentId" = da."documentId"
    AND dv."languageId" = tp."languageId"
);

-- Copy assignment data onto the versions that already existed. The translator is
-- only filled in where the version has none, so an in-progress translator is
-- never overwritten by a stale assignment.
UPDATE "document_version" dv
SET "deadline"     = da."deadline",
    "assignedById" = da."assignedById",
    "assignedAt"   = da."assignedAt",
    "userId"       = COALESCE(dv."userId", da."userId")
FROM "document_assignment" da
JOIN "translation_project" tp ON tp."id" = da."translationProjectId"
WHERE dv."documentId" = da."documentId"
  AND dv."languageId" = tp."languageId";

-- AddForeignKey
ALTER TABLE "document_version"
  ADD CONSTRAINT "document_version_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable
DROP TABLE "document_assignment";
