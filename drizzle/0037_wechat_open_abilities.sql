CREATE TABLE "wanjiedaoyou_wechat_subscription_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "cultivator_id" uuid NOT NULL,
  "kind" varchar(32) NOT NULL,
  "template_id" varchar(128) NOT NULL,
  "target_at" timestamp NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp,
  "sent_at" timestamp,
  "failure_code" varchar(64),
  "failure_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_wechat_share_gifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sender_user_id" uuid NOT NULL,
  "sender_cultivator_id" uuid NOT NULL,
  "sender_name" varchar(100) NOT NULL,
  "kind" varchar(32) DEFAULT 'fate_blessing' NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "max_claims" integer DEFAULT 1 NOT NULL,
  "claimed_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_wechat_share_gift_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gift_id" uuid NOT NULL,
  "receiver_user_id" uuid NOT NULL,
  "receiver_cultivator_id" uuid NOT NULL,
  "reward_mail_id" uuid,
  "claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_wechat_subscription_intents" ADD CONSTRAINT "wanjiedaoyou_wechat_subscription_intents_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_wechat_share_gifts" ADD CONSTRAINT "wanjiedaoyou_wechat_share_gifts_sender_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("sender_cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_wechat_share_gift_claims" ADD CONSTRAINT "wanjiedaoyou_wechat_share_gift_claims_gift_id_wanjiedaoyou_wechat_share_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."wanjiedaoyou_wechat_share_gifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_wechat_share_gift_claims" ADD CONSTRAINT "wanjiedaoyou_wechat_share_gift_claims_receiver_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("receiver_cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_wechat_share_gift_claims" ADD CONSTRAINT "wanjiedaoyou_wechat_share_gift_claims_reward_mail_id_wanjiedaoyou_mails_id_fk" FOREIGN KEY ("reward_mail_id") REFERENCES "public"."wanjiedaoyou_mails"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "wechat_subscription_intents_due_idx" ON "wanjiedaoyou_wechat_subscription_intents" USING btree ("status","target_at");
--> statement-breakpoint
CREATE INDEX "wechat_subscription_intents_cultivator_idx" ON "wanjiedaoyou_wechat_subscription_intents" USING btree ("cultivator_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_subscription_intents_active_uidx" ON "wanjiedaoyou_wechat_subscription_intents" USING btree ("cultivator_id","kind") WHERE "status" IN ('pending', 'sending');
--> statement-breakpoint
CREATE INDEX "wechat_share_gifts_sender_created_idx" ON "wanjiedaoyou_wechat_share_gifts" USING btree ("sender_cultivator_id","created_at");
--> statement-breakpoint
CREATE INDEX "wechat_share_gifts_status_expires_idx" ON "wanjiedaoyou_wechat_share_gifts" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "wechat_share_gift_claims_gift_receiver_uidx" ON "wanjiedaoyou_wechat_share_gift_claims" USING btree ("gift_id","receiver_cultivator_id");
--> statement-breakpoint
CREATE INDEX "wechat_share_gift_claims_receiver_claimed_idx" ON "wanjiedaoyou_wechat_share_gift_claims" USING btree ("receiver_cultivator_id","claimed_at");
