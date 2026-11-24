-- Bible search matches words anywhere in a verse (LIKE '% word%'); without a
-- trigram index every search reads every verse of the translation.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "bible_verse_searchText_idx" ON "bible_verse" USING GIN ("searchText" gin_trgm_ops);
