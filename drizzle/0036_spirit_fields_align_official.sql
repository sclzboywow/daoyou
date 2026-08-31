-- Align production spirit_fields with official schema (drop unused level/proficiency).
ALTER TABLE "wanjiedaoyou_spirit_fields" DROP COLUMN IF EXISTS "level";
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_spirit_fields" DROP COLUMN IF EXISTS "proficiency";
