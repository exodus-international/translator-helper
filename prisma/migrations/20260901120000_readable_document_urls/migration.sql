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
--
--    The suffix has to be checked, not just appended: projects named "Exodus",
--    "Exodus" and "Exodus 2" slugify to exodus, exodus and exodus-2, so naively
--    renaming the duplicate to exodus-2 collides with the third row and aborts
--    CREATE UNIQUE INDEX mid-deploy. This walks until it finds a free one.
DO $$
DECLARE
  dup RECORD;
  candidate TEXT;
  n INT;
BEGIN
  FOR dup IN
    SELECT "id", "identifier"
    FROM (
      SELECT "id", "identifier",
             row_number() OVER (PARTITION BY "identifier" ORDER BY "createdAt", "id") AS rn
      FROM "source_project"
    ) ranked
    WHERE rn > 1
  LOOP
    n := 2;
    LOOP
      candidate := dup."identifier" || '-' || n;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "source_project" WHERE "identifier" = candidate);
      n := n + 1;
    END LOOP;
    UPDATE "source_project" SET "identifier" = candidate WHERE "id" = dup."id";
  END LOOP;
END $$;

ALTER TABLE "source_project" ALTER COLUMN "identifier" SET NOT NULL;
CREATE UNIQUE INDEX "source_project_identifier_key" ON "source_project"("identifier");

-- 4. Scope slug uniqueness to the project. This only widens what is allowed,
--    so every existing row still satisfies it.
DROP INDEX "document_slug_key";
CREATE UNIQUE INDEX "document_sourceProjectId_slug_key" ON "document"("sourceProjectId", "slug");
