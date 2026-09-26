DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "better_auth"."account"
    WHERE "providerId" = 'wechat-mini-game'
    GROUP BY "accountId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate wechat-mini-game accountId rows exist; resolve them before migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "better_auth"."account"
    WHERE "providerId" = 'wechat-mini-game'
    GROUP BY "userId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'a Better Auth user is linked to multiple wechat-mini-game identities; resolve them before migration';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_wechat_identity_uidx"
ON "better_auth"."account" USING btree ("accountId")
WHERE "providerId" = 'wechat-mini-game';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_wechat_user_uidx"
ON "better_auth"."account" USING btree ("userId")
WHERE "providerId" = 'wechat-mini-game';
