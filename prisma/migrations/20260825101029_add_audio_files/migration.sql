-- CreateEnum
CREATE TYPE "AudioProvider" AS ENUM ('AZURE_SPEECH');

-- CreateEnum
CREATE TYPE "AudioStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "language" ADD COLUMN     "audioProvider" "AudioProvider",
ADD COLUMN     "audioVoice" TEXT;

-- AlterTable
ALTER TABLE "source_project" ADD COLUMN     "audioDocumentTypes" "DocumentType"[] DEFAULT ARRAY['DAY', 'DAILY_CONTENT']::"DocumentType"[];

-- CreateTable
CREATE TABLE "audio_file" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "status" "AudioStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "AudioProvider" NOT NULL,
    "voice" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "providerJobId" TEXT,
    "objectKey" TEXT,
    "url" TEXT,
    "durationMs" INTEGER,
    "sizeBytes" INTEGER,
    "billedCharacters" INTEGER,
    "errorMessage" TEXT,
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audio_file_documentVersionId_createdAt_idx" ON "audio_file"("documentVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "audio_file_status_updatedAt_idx" ON "audio_file"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "audio_file" ADD CONSTRAINT "audio_file_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_file" ADD CONSTRAINT "audio_file_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
