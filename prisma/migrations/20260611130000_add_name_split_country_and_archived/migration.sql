-- AlterTable
ALTER TABLE "user" ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "shippingCountry" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Populate firstName/lastName from existing name
UPDATE "user" SET
  "firstName" = split_part("name", ' ', 1),
  "lastName" = CASE
    WHEN position(' ' in "name") > 0 THEN substring("name" from position(' ' in "name") + 1)
    ELSE NULL
  END;
