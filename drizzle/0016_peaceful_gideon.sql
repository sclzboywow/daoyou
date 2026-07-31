CREATE TABLE "wanjiedaoyou_local_transaction_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_key" varchar(96) NOT NULL,
	"payload" jsonb NOT NULL,
	"deduplication_key" varchar(256),
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "wanjiedaoyou_sect_construction_projects" CASCADE;--> statement-breakpoint
DROP TABLE "wanjiedaoyou_sect_donation_ledger" CASCADE;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_facilities" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "local_transaction_messages_dedupe_unique" ON "wanjiedaoyou_local_transaction_messages" USING btree ("message_key","deduplication_key") WHERE "wanjiedaoyou_local_transaction_messages"."deduplication_key" is not null;--> statement-breakpoint
CREATE INDEX "local_transaction_messages_pending_idx" ON "wanjiedaoyou_local_transaction_messages" USING btree ("created_at") WHERE "wanjiedaoyou_local_transaction_messages"."completed_at" is null;