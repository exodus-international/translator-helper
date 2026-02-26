-- AlterTable
ALTER TABLE "document_version" ADD COLUMN     "reviewerId" TEXT;

-- AddForeignKey
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
