-- Revert archiving (use betterAuth's built-in ban) and name split (use single name field)
ALTER TABLE "user" DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "user" DROP COLUMN IF EXISTS "firstName";
ALTER TABLE "user" DROP COLUMN IF EXISTS "lastName";
