CREATE TABLE "wanjiedaoyou_message_consumptions" (
	"consumer_name" varchar(96) NOT NULL,
	"message_id" uuid NOT NULL,
	"message_key" varchar(128) NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wanjiedaoyou_message_consumptions_consumer_name_message_id_pk" PRIMARY KEY("consumer_name","message_id")
);
--> statement-breakpoint
CREATE TABLE "wanjiedaoyou_transactional_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_key" varchar(128) NOT NULL,
	"destination" varchar(160) NOT NULL,
	"payload" jsonb NOT NULL,
	"deduplication_key" varchar(256),
	"published_at" timestamp,
	"publish_attempts" integer DEFAULT 0 NOT NULL,
	"last_publish_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "message_consumptions_processed_idx" ON "wanjiedaoyou_message_consumptions" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactional_messages_dedupe_unique" ON "wanjiedaoyou_transactional_messages" USING btree ("message_key","deduplication_key") WHERE "wanjiedaoyou_transactional_messages"."deduplication_key" is not null;--> statement-breakpoint
CREATE INDEX "transactional_messages_pending_idx" ON "wanjiedaoyou_transactional_messages" USING btree ("created_at") WHERE "wanjiedaoyou_transactional_messages"."published_at" is null;