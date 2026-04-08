-- DropForeignKey
ALTER TABLE "document_version" DROP CONSTRAINT "document_version_userId_fkey";

-- AlterTable
ALTER TABLE "document_version" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
