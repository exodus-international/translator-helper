-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'AI_TRANSLATING';
ALTER TYPE "DocumentStatus" ADD VALUE 'AI_PREPARING_AUDIO';
ALTER TYPE "DocumentStatus" ADD VALUE 'AUDIO_REVIEW';

-- CreateEnum
CREATE TYPE "TranslationWorkflow" AS ENUM ('MANUAL', 'AI');

-- AlterTable
ALTER TABLE "language" ADD COLUMN     "workflow" "TranslationWorkflow" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "document_version" ADD COLUMN     "aiAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aiError" TEXT,
ADD COLUMN     "workflow" "TranslationWorkflow" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "review_approval" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_approval_documentVersionId_userId_key" ON "review_approval"("documentVersionId", "userId");

-- AddForeignKey
ALTER TABLE "review_approval" ADD CONSTRAINT "review_approval_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_approval" ADD CONSTRAINT "review_approval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The AI is the author of everything it writes: drafts, comments, the audio
-- text. It needs a user row for those to point at. It has no account and no
-- language membership, so it can never sign in or show up in a team.
INSERT INTO "user" ("id", "email", "name", "emailVerified", "role", "onboarded", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-00000000a1a1', 'ai-translator@translation-helper.invalid', 'AI Translator', false, 'USER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
