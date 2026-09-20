CREATE TABLE "wanjiedaoyou_account_link_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"responded_at" timestamp,
	"primary_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_link_requests_requester_status_idx" ON "wanjiedaoyou_account_link_requests" USING btree ("requester_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "account_link_requests_target_status_idx" ON "wanjiedaoyou_account_link_requests" USING btree ("target_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "account_link_requests_expires_idx" ON "wanjiedaoyou_account_link_requests" USING btree ("status","expires_at");