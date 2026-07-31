ALTER TABLE "better_auth"."session" ADD COLUMN "impersonatedBy" text;--> statement-breakpoint
ALTER TABLE "better_auth"."user" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "better_auth"."user" ADD COLUMN "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "better_auth"."user" ADD COLUMN "banReason" text;--> statement-breakpoint
ALTER TABLE "better_auth"."user" ADD COLUMN "banExpires" timestamp with time zone;