-- Replace shippingAddress/shippingCountry with granular address fields
ALTER TABLE "user" ADD COLUMN "streetAddress" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "zipCode" TEXT;

-- Rename shippingCountry to country
ALTER TABLE "user" RENAME COLUMN "shippingCountry" TO "country";

-- Migrate existing shippingAddress data to streetAddress
UPDATE "user" SET "streetAddress" = "shippingAddress" WHERE "shippingAddress" IS NOT NULL;

-- Drop old column
ALTER TABLE "user" DROP COLUMN "shippingAddress";
