-- Hand-edited SSML for one document version, sent to the speech provider in
-- place of the script derived from its Markdown.
--
-- Nullable, and null is the state every existing row starts in: a version
-- without an override derives its SSML exactly as before, so the previously
-- deployed code and this migration can run side by side.
ALTER TABLE "document_version" ADD COLUMN "audioSsml" TEXT;
