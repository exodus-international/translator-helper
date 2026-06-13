-- CreateEnum
CREATE TYPE "TShirtSize" AS ENUM ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "shippingAddress" TEXT,
ADD COLUMN "tShirtSize" "TShirtSize",
ADD COLUMN "exodus90AppId" TEXT,
ADD COLUMN "onboarded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "invitation_language" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,

    CONSTRAINT "invitation_language_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_language_invitationId_languageId_key" ON "invitation_language"("invitationId", "languageId");

-- AddForeignKey
ALTER TABLE "invitation_language" ADD CONSTRAINT "invitation_language_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_language" ADD CONSTRAINT "invitation_language_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "language"("id") ON DELETE CASCADE ON UPDATE CASCADE;
