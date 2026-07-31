CREATE TABLE "wanjiedaoyou_resource_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_id" uuid NOT NULL,
	"scope_version" bigint NOT NULL,
	"resource_version" bigint NOT NULL,
	"resource_key" varchar(96) NOT NULL,
	"operation" varchar(24) NOT NULL,
	"event_type" varchar(96) NOT NULL,
	"payload" jsonb,
	"actor_cultivator_id" uuid,
	"actor_user_id" uuid,
	"source" varchar(96) NOT NULL,
	"request_id" varchar(128),
	"mutation_ordinal" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_resource_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_kind" varchar(24) NOT NULL,
	"scope_key" varchar(128) NOT NULL,
	"scope_version" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_resource_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_id" uuid NOT NULL,
	"resource_key" varchar(96) NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_resource_events" ADD CONSTRAINT "wanjiedaoyou_resource_events_scope_id_wanjiedaoyou_resource_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."wanjiedaoyou_resource_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_resource_events" ADD CONSTRAINT "wanjiedaoyou_resource_events_actor_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("actor_cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_resource_versions" ADD CONSTRAINT "wanjiedaoyou_resource_versions_scope_id_wanjiedaoyou_resource_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."wanjiedaoyou_resource_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_events_scope_version_ordinal_unique" ON "wanjiedaoyou_resource_events" USING btree ("scope_id","scope_version","mutation_ordinal");--> statement-breakpoint
CREATE INDEX "resource_events_scope_version_idx" ON "wanjiedaoyou_resource_events" USING btree ("scope_id","scope_version","mutation_ordinal");--> statement-breakpoint
CREATE INDEX "resource_events_replay_idx" ON "wanjiedaoyou_resource_events" USING btree ("actor_cultivator_id","source","request_id","mutation_ordinal");--> statement-breakpoint
CREATE INDEX "resource_events_created_idx" ON "wanjiedaoyou_resource_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_scopes_kind_key_unique" ON "wanjiedaoyou_resource_scopes" USING btree ("scope_kind","scope_key");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_versions_scope_key_unique" ON "wanjiedaoyou_resource_versions" USING btree ("scope_id","resource_key");--> statement-breakpoint
CREATE INDEX "resource_versions_resource_idx" ON "wanjiedaoyou_resource_versions" USING btree ("resource_key");