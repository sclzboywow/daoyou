CREATE TABLE "wanjiedaoyou_battle_records_v3" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cultivator_id" uuid NOT NULL,
	"opponent_cultivator_id" uuid,
	"battle_type" varchar(20) DEFAULT 'normal' NOT NULL,
	"battle_result" jsonb NOT NULL,
	"share_code" uuid,
	"shared_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_bet_battles" ADD COLUMN "battle_record_v3_id" uuid;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_battle_records_v3" ADD CONSTRAINT "wanjiedaoyou_battle_records_v3_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_battle_records_v3" ADD CONSTRAINT "wanjiedaoyou_battle_records_v3_opponent_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("opponent_cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_records_v3_cultivator_created_idx" ON "wanjiedaoyou_battle_records_v3" USING btree ("cultivator_id","created_at");--> statement-breakpoint
CREATE INDEX "battle_records_v3_opponent_created_idx" ON "wanjiedaoyou_battle_records_v3" USING btree ("opponent_cultivator_id","created_at");--> statement-breakpoint
CREATE INDEX "battle_records_v3_user_created_idx" ON "wanjiedaoyou_battle_records_v3" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_records_v3_share_code_uidx" ON "wanjiedaoyou_battle_records_v3" USING btree ("share_code");--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_bet_battles" ADD CONSTRAINT "wanjiedaoyou_bet_battles_battle_record_v3_id_wanjiedaoyou_battle_records_v3_id_fk" FOREIGN KEY ("battle_record_v3_id") REFERENCES "public"."wanjiedaoyou_battle_records_v3"("id") ON DELETE set null ON UPDATE no action;