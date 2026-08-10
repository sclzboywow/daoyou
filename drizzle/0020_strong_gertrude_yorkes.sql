ALTER TABLE "wanjiedaoyou_auction_listings" ADD COLUMN "initial_quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_auction_listings" ADD COLUMN "remaining_quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "wanjiedaoyou_auction_listings"
SET
  "initial_quantity" = CASE
    WHEN "item_snapshot"->>'quantity' ~ '^[0-9]+$'
      THEN GREATEST(("item_snapshot"->>'quantity')::integer, 1)
    ELSE 1
  END,
  "remaining_quantity" = CASE
    WHEN "item_snapshot"->>'quantity' ~ '^[0-9]+$'
      THEN GREATEST(("item_snapshot"->>'quantity')::integer, 1)
    ELSE 1
  END,
  "price" = GREATEST(
    1,
    "price" / CASE
      WHEN "item_snapshot"->>'quantity' ~ '^[0-9]+$'
        THEN GREATEST(("item_snapshot"->>'quantity')::integer, 1)
      ELSE 1
    END
  );
