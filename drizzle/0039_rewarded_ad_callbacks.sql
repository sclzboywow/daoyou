CREATE TABLE "wanjiedaoyou_rewarded_ad_callbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" varchar(160) NOT NULL,
	"callback_user_id" varchar(160) NOT NULL,
	"reward_kind" varchar(32) NOT NULL,
	"reward_amount" integer NOT NULL,
	"custom_data" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reservation_token" uuid,
	"claim_request_id" varchar(120),
	"reserved_at" timestamp,
	"consumed_at" timestamp,
	"consumer_user_id" uuid,
	"consumer_cultivator_id" uuid,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rewarded_ad_callbacks_transaction_uidx" ON "wanjiedaoyou_rewarded_ad_callbacks" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "rewarded_ad_callbacks_claim_idx" ON "wanjiedaoyou_rewarded_ad_callbacks" USING btree ("callback_user_id","reward_kind","status","received_at");--> statement-breakpoint
CREATE INDEX "rewarded_ad_callbacks_reservation_idx" ON "wanjiedaoyou_rewarded_ad_callbacks" USING btree ("status","reserved_at");--> statement-breakpoint
CREATE INDEX "rewarded_ad_callbacks_request_idx" ON "wanjiedaoyou_rewarded_ad_callbacks" USING btree ("consumer_cultivator_id","reward_kind","claim_request_id");