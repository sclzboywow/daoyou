ALTER TABLE "wanjiedaoyou_sect_task_records"
  ADD COLUMN IF NOT EXISTS "attempt" integer NOT NULL DEFAULT 1;--> statement-breakpoint
DROP INDEX IF EXISTS "sect_task_membership_period_task_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sect_task_membership_period_task_attempt_unique"
  ON "wanjiedaoyou_sect_task_records" USING btree ("membership_id", "period_key", "task_id", "attempt");
