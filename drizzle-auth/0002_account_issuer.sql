-- Better Auth 1.7: account identity is scoped by (issuer, accountId).
ALTER TABLE "better_auth"."account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "better_auth"."account"
SET "issuer" = CASE
  WHEN "providerId" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || replace(replace(replace("providerId", '%', '%25'), '/', '%2F'), ':', '%3A')
END
WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "better_auth"."account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "better_auth"."account" USING btree ("issuer","accountId");
