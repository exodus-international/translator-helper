-- CreateEnum
CREATE TYPE "BibleTranslationRole" AS ENUM ('SOURCE', 'TARGET');

-- CreateTable
CREATE TABLE "bible_translation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "languageName" TEXT NOT NULL,
    "role" "BibleTranslationRole" NOT NULL DEFAULT 'TARGET',
    "isLanguageDefault" BOOLEAN NOT NULL DEFAULT false,
    "bookCount" INTEGER NOT NULL DEFAULT 0,
    "verseCount" INTEGER NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bible_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_book" (
    "id" TEXT NOT NULL,
    "translationId" TEXT NOT NULL,
    "usfm" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "testament" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "chapterCount" INTEGER NOT NULL,
    "verseCount" INTEGER NOT NULL,
    "chapterVerseCounts" INTEGER[],

    CONSTRAINT "bible_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_verse" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "numberEnd" INTEGER,
    "text" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,

    CONSTRAINT "bible_verse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_section_header" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "beforeVerse" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "bible_section_header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_versification_book" (
    "id" TEXT NOT NULL,
    "translationId" TEXT NOT NULL,
    "usfm" TEXT NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "bible_versification_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_verse_mapping" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "srcChapter" INTEGER NOT NULL,
    "srcVerseFrom" INTEGER,
    "srcVerseTo" INTEGER,
    "dstChapter" INTEGER NOT NULL,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "unmappable" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bible_verse_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bible_translation_code_key" ON "bible_translation"("code");

-- CreateIndex
CREATE INDEX "bible_translation_languageCode_idx" ON "bible_translation"("languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "bible_book_translationId_usfm_key" ON "bible_book"("translationId", "usfm");

-- CreateIndex
CREATE UNIQUE INDEX "bible_verse_bookId_chapter_number_key" ON "bible_verse"("bookId", "chapter", "number");

-- CreateIndex
CREATE INDEX "bible_section_header_bookId_chapter_idx" ON "bible_section_header"("bookId", "chapter");

-- CreateIndex
CREATE UNIQUE INDEX "bible_versification_book_translationId_usfm_key" ON "bible_versification_book"("translationId", "usfm");

-- CreateIndex
CREATE INDEX "bible_verse_mapping_bookId_idx" ON "bible_verse_mapping"("bookId");

-- AddForeignKey
ALTER TABLE "bible_translation" ADD CONSTRAINT "bible_translation_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_book" ADD CONSTRAINT "bible_book_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "bible_translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse" ADD CONSTRAINT "bible_verse_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "bible_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_section_header" ADD CONSTRAINT "bible_section_header_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "bible_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_versification_book" ADD CONSTRAINT "bible_versification_book_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "bible_translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verse_mapping" ADD CONSTRAINT "bible_verse_mapping_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "bible_versification_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

