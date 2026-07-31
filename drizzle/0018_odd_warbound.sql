CREATE TABLE "wanjiedaoyou_sect_shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_library_item_id" varchar(120) NOT NULL,
	"price" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"per_user_limit" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" DROP CONSTRAINT "wanjiedaoyou_sect_shop_purchases_membership_id_wanjiedaoyou_sect_memberships_id_fk";
--> statement-breakpoint
DROP INDEX "sect_shop_member_week_item_idx";--> statement-breakpoint
DROP INDEX "sect_shop_member_request_unique";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ALTER COLUMN "membership_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ALTER COLUMN "quantity" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ADD COLUMN "shop_item_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ADD COLUMN "cultivator_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ADD COLUMN "item_library_item_id" varchar(120) NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ADD COLUMN "contribution_cost" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ADD COLUMN "purchase_week" varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_items" ADD CONSTRAINT "wanjiedaoyou_sect_shop_items_item_library_item_id_wanjiedaoyou_item_library_item_id_fk" FOREIGN KEY ("item_library_item_id") REFERENCES "public"."wanjiedaoyou_item_library"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sect_shop_item_library_item_uidx" ON "wanjiedaoyou_sect_shop_items" USING btree ("item_library_item_id");--> statement-breakpoint
CREATE INDEX "sect_shop_status_sort_idx" ON "wanjiedaoyou_sect_shop_items" USING btree ("status","sort_order","updated_at");--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ADD CONSTRAINT "wanjiedaoyou_sect_shop_purchases_shop_item_id_wanjiedaoyou_sect_shop_items_id_fk" FOREIGN KEY ("shop_item_id") REFERENCES "public"."wanjiedaoyou_sect_shop_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ADD CONSTRAINT "wanjiedaoyou_sect_shop_purchases_cultivator_id_wanjiedaoyou_cultivators_id_fk" FOREIGN KEY ("cultivator_id") REFERENCES "public"."wanjiedaoyou_cultivators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" ADD CONSTRAINT "wanjiedaoyou_sect_shop_purchases_membership_id_wanjiedaoyou_sect_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."wanjiedaoyou_sect_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sect_shop_purchases_cultivator_item_idx" ON "wanjiedaoyou_sect_shop_purchases" USING btree ("cultivator_id","shop_item_id");--> statement-breakpoint
CREATE INDEX "sect_shop_purchases_week_idx" ON "wanjiedaoyou_sect_shop_purchases" USING btree ("cultivator_id","shop_item_id","purchase_week");--> statement-breakpoint
CREATE INDEX "sect_shop_purchases_created_idx" ON "wanjiedaoyou_sect_shop_purchases" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" DROP COLUMN "week_key";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" DROP COLUMN "item_id";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" DROP COLUMN "request_id";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_shop_purchases" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_stipend_claims" DROP COLUMN "rewards";