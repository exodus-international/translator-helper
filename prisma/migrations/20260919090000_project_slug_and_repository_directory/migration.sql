-- `identifier` was two things at once: the URL segment every project is
-- addressed by, and the folder a project's documents are deployed into. They
-- are split here, so a project with no content repository can still have a URL.

-- The deploy half keeps the old column and its unique index, under a name that
-- says what it is. It becomes nullable: null means "not deployed to GitHub".
ALTER TABLE "source_project" RENAME COLUMN "identifier" TO "repositoryDirectory";
ALTER TABLE "source_project" ALTER COLUMN "repositoryDirectory" DROP NOT NULL;
ALTER INDEX "source_project_identifier_key" RENAME TO "source_project_repositoryDirectory_key";

-- The routing half is a new, always-present column. Existing projects keep the
-- URLs they already have, so links already shared stay valid; the name-derived
-- and id fallbacks only apply to rows that never had an identifier.
ALTER TABLE "source_project" ADD COLUMN "slug" TEXT;

UPDATE "source_project"
SET "slug" = COALESCE(
  "repositoryDirectory",
  NULLIF(trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''),
  "id"
);

ALTER TABLE "source_project" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "source_project_slug_key" ON "source_project"("slug");
