ALTER TABLE "wanjiedaoyou_battle_records" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_battle_records_v2" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_cultivator_state_versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_player_state_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "wanjiedaoyou_battle_records" CASCADE;--> statement-breakpoint
DROP TABLE "wanjiedaoyou_battle_records_v2" CASCADE;--> statement-breakpoint
DROP TABLE "wanjiedaoyou_cultivator_state_versions" CASCADE;--> statement-breakpoint
DROP TABLE "wanjiedaoyou_player_state_events" CASCADE;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_bet_battles" DROP CONSTRAINT "wanjiedaoyou_bet_battles_battle_record_id_wanjiedaoyou_battle_records_id_fk";
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_bet_battles" DROP CONSTRAINT "wanjiedaoyou_bet_battles_battle_record_v2_id_wanjiedaoyou_battle_records_v2_id_fk";
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_bet_battles" DROP COLUMN "battle_record_id";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_bet_battles" DROP COLUMN "battle_record_v2_id";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_cultivators" DROP COLUMN "wisdom";