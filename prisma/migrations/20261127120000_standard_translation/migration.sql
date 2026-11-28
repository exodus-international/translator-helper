-- CreateTable
CREATE TABLE "standard_translation" (
    "id" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "sourceProjectId" TEXT,
    "name" TEXT,
    "sourceText" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "fixedForm" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standard_translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "standard_translation_sourceProjectId_idx" ON "standard_translation"("sourceProjectId");

-- CreateIndex
-- NULLS NOT DISTINCT (Postgres 15+): a null sourceProjectId means "every
-- project in the language", so two general entries with the same source in
-- one language are duplicates. Prisma's schema can't say this; it is added
-- here by hand.
CREATE UNIQUE INDEX "standard_translation_languageId_sourceProjectId_sourceKey_key" ON "standard_translation"("languageId", "sourceProjectId", "sourceKey") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "standard_translation" ADD CONSTRAINT "standard_translation_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_translation" ADD CONSTRAINT "standard_translation_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "source_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_translation" ADD CONSTRAINT "standard_translation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_translation" ADD CONSTRAINT "standard_translation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

