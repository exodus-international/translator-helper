-- CreateEnum
CREATE TYPE "SourceProjectStatus" AS ENUM ('ACTIVE', 'COMPLETE');

-- AlterTable
ALTER TABLE "source_project" ADD COLUMN     "status" "SourceProjectStatus" NOT NULL DEFAULT 'ACTIVE';
