-- English was the source language by string comparison: listTargetLanguages()
-- filtered `code != 'en'` while every other query called listLanguages(). That
-- is why the instructions screen offered English a textarea whose contents
-- could never reach a prompt -- nothing translates *into* the source language.
--
-- The flag says it instead, so the queries can express the intent and the
-- language pages can show English a reduced page rather than four checks that
-- do not apply to it.
ALTER TABLE "language" ADD COLUMN "isSource" BOOLEAN NOT NULL DEFAULT false;

-- One source language today, addressed the way the old comparison did.
UPDATE "language" SET "isSource" = true WHERE "code" = 'en';
