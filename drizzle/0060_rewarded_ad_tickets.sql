CREATE TABLE "wanjiedaoyou_rewarded_ad_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cultivator_id" uuid NOT NULL,
	"placement" varchar(16) NOT NULL,
	"target_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"verified_at" timestamp,
	"transaction_id" text,
	CONSTRAINT "rewarded_ad_placement_check" CHECK ("wanjiedaoyou_rewarded_ad_tickets"."placement" in ('yield','recovery'))
);
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_rewarded_ad_tickets" ADD CONSTRAINT "wanjiedaoyou_rewarded_ad_tickets_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rewarded_ad_transaction_uidx" ON "wanjiedaoyou_rewarded_ad_tickets" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rewarded_ad_target_uidx" ON "wanjiedaoyou_rewarded_ad_tickets" USING btree ("cultivator_id","placement","target_key");