-- Reverts migration 20260905170000, which added a NOT NULL "issuer" column on
-- the assumption that better-auth 1.7 keys accounts on (issuer, accountId).
-- It does not: @better-auth/core 1.7.3 defines the account table with exactly
-- accountId, providerId, userId, the token columns, scope, password and the
-- timestamps -- there is no issuer field and no `account.identityStrategy`
-- option to produce one. Nothing in the library ever writes the column, so
-- every account insert (registration, admin "create user", the seed) failed
-- Prisma validation with `Argument \`issuer\` is missing`.
--
-- Dropping it restores the shape better-auth 1.7.3 actually writes. If a later
-- version does introduce issuer, re-add it there with that version's own
-- backfill rather than reinstating this one.
DROP INDEX IF EXISTS "account_issuer_accountId_key";

ALTER TABLE "account" DROP COLUMN IF EXISTS "issuer";
