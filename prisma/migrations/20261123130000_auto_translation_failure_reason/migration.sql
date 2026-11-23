-- CreateEnum
CREATE TYPE "AutoTranslationFailure" AS ENUM ('REJECTED', 'SETUP', 'RATE_LIMITED', 'UNAVAILABLE', 'NO_SOURCE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "auto_translation" ADD COLUMN     "failureReason" "AutoTranslationFailure";
