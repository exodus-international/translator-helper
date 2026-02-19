-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DAY', 'FIELD_GUIDE', 'DAILY_CONTENT');

-- CreateEnum
CREATE TYPE "GitHubPRStatus" AS ENUM ('OPEN', 'MERGED', 'CLOSED');

-- AlterTable
ALTER TABLE "document" ADD COLUMN     "type" "DocumentType";

-- AlterTable
ALTER TABLE "language" ADD COLUMN     "branchName" TEXT;

-- AlterTable
ALTER TABLE "source_project" ADD COLUMN     "identifier" TEXT;

-- CreateTable
CREATE TABLE "github_commit" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "prNumber" INTEGER,
    "prUrl" TEXT,
    "prStatus" "GitHubPRStatus",
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_commit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "github_commit" ADD CONSTRAINT "github_commit_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
