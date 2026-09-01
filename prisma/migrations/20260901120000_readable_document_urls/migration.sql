-- Readable document URLs: /documents/{project}/{slug}/{lang}
--
-- The project identifier becomes a URL segment, so it has to exist and be
-- unique. Document slugs only have to be unique inside their project now that
-- the project sits in front of them.
--
-- Existing slugs are deliberately left alone. A document with no
-- originalFilename deploys to `{slug}.md` and its audio key is built from the
-- slug, so renaming one would orphan a committed file and a stored audio
-- object. New documents can simply drop the project prefix.

-- 1. Backfill identifiers from the project name: "Exodus90 2026" -> "exodus90-2026".
UPDATE "source_project"
SET "identifier" = NULLIF(trim(both '-' FROM lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))), '')
WHERE "identifier" IS NULL OR trim("identifier") = '';

-- 2. Last resort for a name that slugified to nothing at all.
UPDATE "source_project"
SET "identifier" = 'project-' || left("id", 8)
WHERE "identifier" IS NULL;

-- 3. Break ties before the unique index goes on.
WITH ranked AS (
  SELECT "id",
         "identifier" AS ident,
         row_number() OVER (PARTITION BY "identifier" ORDER BY "createdAt", "id") AS n
  FROM "source_project"
)
UPDATE "source_project" sp
SET "identifier" = ranked.ident || '-' || ranked.n
FROM ranked
WHERE sp."id" = ranked."id" AND ranked.n > 1;

ALTER TABLE "source_project" ALTER COLUMN "identifier" SET NOT NULL;
CREATE UNIQUE INDEX "source_project_identifier_key" ON "source_project"("identifier");

-- 4. Scope slug uniqueness to the project. This only widens what is allowed,
--    so every existing row still satisfies it.
DROP INDEX "document_slug_key";
CREATE UNIQUE INDEX "document_sourceProjectId_slug_key" ON "document"("sourceProjectId", "slug");
