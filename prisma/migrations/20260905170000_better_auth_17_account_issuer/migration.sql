-- better-auth 1.7 keys accounts on (issuer, accountId). Pre-1.7 rows have no
-- issuer, so it is added nullable, backfilled per the 1.7 upgrade guide's
-- provider-id strategy, then made NOT NULL with the compound unique index.
ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

UPDATE "account"
SET "issuer" = CASE
  WHEN "providerId" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "providerId"
END;

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");
