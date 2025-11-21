-- Add translation instructions column per language
ALTER TABLE "language"
ADD COLUMN IF NOT EXISTS "translationInstructions" TEXT;


