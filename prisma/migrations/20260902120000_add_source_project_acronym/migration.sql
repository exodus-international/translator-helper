-- Short prefix used when auto-naming uploaded DAY documents, e.g. "SML" in
-- "SML - DAY 03 - Prayer and Fasting". Nullable: projects without one fall
-- back to an unprefixed "DAY 03 - ..." title.
ALTER TABLE "source_project" ADD COLUMN "acronym" TEXT;
