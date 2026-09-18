-- Projects with no content repository don't need an identifier; a null
-- identifier now also means "skip GitHub deploy" for that project.
ALTER TABLE "source_project" ALTER COLUMN "identifier" DROP NOT NULL;
