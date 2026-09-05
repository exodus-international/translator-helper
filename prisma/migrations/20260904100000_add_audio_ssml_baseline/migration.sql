-- Fingerprint of the derived SSML at the moment a hand-edited one was saved.
--
-- Comparing it against a fresh derivation tells an edited transcript that the
-- spoken words changed underneath it. Nullable and additive: a row without one
-- is simply a transcript nobody has edited, which is every existing row.
ALTER TABLE "document_version" ADD COLUMN "audioSsmlBase" TEXT;
