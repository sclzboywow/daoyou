CREATE TABLE "wanjiedaoyou_activity_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"cultivator_id" uuid NOT NULL,
	"mail_id" uuid,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_admin_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"activity_type" varchar(40) NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_email" varchar(320) NOT NULL,
	"action" varchar(160) NOT NULL,
	"target_type" varchar(80),
	"target_id" varchar(180),
	"reason" text,
	"request_id" varchar(128),
	"ip_address" varchar(128),
	"status" varchar(20) NOT NULL,
	"request_summary" jsonb,
	"response_summary" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_admin_batch_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"target_key" varchar(320) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"result" jsonb,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_admin_batch_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_by_email" varchar(320) NOT NULL,
	"reason" text,
	"payload" jsonb NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_system_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" varchar(96) NOT NULL,
	"status" varchar(24) DEFAULT 'running' NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"reason" text,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_mails" ADD COLUMN "deduplication_key" varchar(180);--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_activity_claims" ADD CONSTRAINT "wanjiedaoyou_activity_claims_activity_id_wanjiedaoyou_admin_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."wanjiedaoyou_admin_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_activity_claims" ADD CONSTRAINT "wanjiedaoyou_activity_claims_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_activity_claims" ADD CONSTRAINT "wanjiedaoyou_activity_claims_mail_id_wanjiedaoyou_mails_id_fk" FOREIGN KEY ("mail_id") REFERENCES "public"."wanjiedaoyou_mails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_admin_batch_job_items" ADD CONSTRAINT "wanjiedaoyou_admin_batch_job_items_job_id_wanjiedaoyou_admin_batch_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."wanjiedaoyou_admin_batch_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_claims_activity_cultivator_unique" ON "wanjiedaoyou_activity_claims" USING btree ("activity_id","cultivator_id");--> statement-breakpoint
CREATE INDEX "activity_claims_cultivator_created_idx" ON "wanjiedaoyou_activity_claims" USING btree ("cultivator_id","claimed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_activities_code_unique" ON "wanjiedaoyou_admin_activities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "admin_activities_status_window_idx" ON "wanjiedaoyou_admin_activities" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "admin_activities_type_created_idx" ON "wanjiedaoyou_admin_activities" USING btree ("activity_type","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_actor_created_idx" ON "wanjiedaoyou_admin_audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_action_created_idx" ON "wanjiedaoyou_admin_audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_target_created_idx" ON "wanjiedaoyou_admin_audit_logs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_status_created_idx" ON "wanjiedaoyou_admin_audit_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_batch_job_items_target_unique" ON "wanjiedaoyou_admin_batch_job_items" USING btree ("job_id","target_key");--> statement-breakpoint
CREATE INDEX "admin_batch_job_items_status_idx" ON "wanjiedaoyou_admin_batch_job_items" USING btree ("job_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_batch_jobs_idempotency_unique" ON "wanjiedaoyou_admin_batch_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "admin_batch_jobs_status_created_idx" ON "wanjiedaoyou_admin_batch_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "admin_batch_jobs_type_created_idx" ON "wanjiedaoyou_admin_batch_jobs" USING btree ("job_type","created_at");--> statement-breakpoint
CREATE INDEX "system_job_runs_name_created_idx" ON "wanjiedaoyou_system_job_runs" USING btree ("job_name","created_at");--> statement-breakpoint
CREATE INDEX "system_job_runs_status_created_idx" ON "wanjiedaoyou_system_job_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mails_deduplication_key_unique" ON "wanjiedaoyou_mails" USING btree ("deduplication_key") WHERE "wanjiedaoyou_mails"."deduplication_key" is not null;