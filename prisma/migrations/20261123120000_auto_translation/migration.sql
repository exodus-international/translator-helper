-- CreateEnum
CREATE TYPE "AutoTranslationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AUTO_TRANSLATION_FINISHED';

-- AlterTable
ALTER TABLE "translation_project" ADD COLUMN     "autoTranslate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoTranslateChangedAt" TIMESTAMP(3),
ADD COLUMN     "autoTranslateChangedById" TEXT,
ADD COLUMN     "autoTranslateNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "auto_translation" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "translationProjectId" TEXT NOT NULL,
    "status" "AutoTranslationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "error" TEXT,
    "machineContent" TEXT,
    "model" TEXT,
    "requestedById" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_translation_documentVersionId_key" ON "auto_translation"("documentVersionId");

-- CreateIndex
CREATE INDEX "auto_translation_status_nextAttemptAt_idx" ON "auto_translation"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "auto_translation_translationProjectId_status_idx" ON "auto_translation"("translationProjectId", "status");

-- AddForeignKey
ALTER TABLE "translation_project" ADD CONSTRAINT "translation_project_autoTranslateChangedById_fkey" FOREIGN KEY ("autoTranslateChangedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_translation" ADD CONSTRAINT "auto_translation_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_translation" ADD CONSTRAINT "auto_translation_translationProjectId_fkey" FOREIGN KEY ("translationProjectId") REFERENCES "translation_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_translation" ADD CONSTRAINT "auto_translation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

