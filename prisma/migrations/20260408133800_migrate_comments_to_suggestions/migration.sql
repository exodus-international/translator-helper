-- Migrate all comments to general (unanchored) suggestions
INSERT INTO "suggestion" (
  "id",
  "documentVersionId",
  "userId",
  "comment",
  "startLine",
  "startColumn",
  "endLine",
  "endColumn",
  "type",
  "proposedText",
  "originalText",
  "status",
  "dismissedReason",
  "version",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  c."documentVersionId",
  c."userId",
  c."content",
  NULL,
  NULL,
  NULL,
  NULL,
  'COMMENT',
  NULL,
  NULL,
  'OPEN',
  NULL,
  dv."version",
  c."createdAt",
  c."updatedAt"
FROM "comment" c
JOIN "document_version" dv ON c."documentVersionId" = dv."id";
