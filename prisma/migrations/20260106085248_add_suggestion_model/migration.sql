-- CreateEnum
CREATE TYPE "SuggestionType" AS ENUM ('COMMENT', 'CHANGE');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'APPLIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "suggestion" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "startColumn" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "endColumn" INTEGER NOT NULL,
    "type" "SuggestionType" NOT NULL DEFAULT 'COMMENT',
    "comment" TEXT NOT NULL,
    "proposedText" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "dismissedReason" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
