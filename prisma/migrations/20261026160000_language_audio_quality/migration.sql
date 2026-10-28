-- CreateEnum
CREATE TYPE "AudioQuality" AS ENUM ('STANDARD', 'HIGH');

-- AlterTable
ALTER TABLE "language" ADD COLUMN     "audioQuality" "AudioQuality";
