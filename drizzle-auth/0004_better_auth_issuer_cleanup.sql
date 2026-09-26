-- Better Auth >= 1.7.3 returned account identity to (providerId, accountId).
-- 1.7.0-1.7.2 temporarily required account.issuer; 1.7.4 no longer writes it.
-- Keep this forward-only cleanup because 0002 may already have run in an environment.
DROP INDEX IF EXISTS "better_auth"."account_issuer_accountId_uidx";
--> statement-breakpoint
ALTER TABLE "better_auth"."account" DROP COLUMN IF EXISTS "issuer";
