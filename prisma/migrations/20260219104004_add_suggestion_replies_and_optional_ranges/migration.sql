-- AlterTable
ALTER TABLE "suggestion" ALTER COLUMN "startLine" DROP NOT NULL,
ALTER COLUMN "startColumn" DROP NOT NULL,
ALTER COLUMN "endLine" DROP NOT NULL,
ALTER COLUMN "endColumn" DROP NOT NULL;

-- CreateTable
CREATE TABLE "suggestion_reply" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestion_reply_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "suggestion_reply" ADD CONSTRAINT "suggestion_reply_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_reply" ADD CONSTRAINT "suggestion_reply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
