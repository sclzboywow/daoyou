ALTER TABLE "wanjiedaoyou_local_transaction_messages" RENAME TO "wanjiedaoyou_local_transaction_messages_legacy_20260804";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_contribution_ledger" RENAME TO "wanjiedaoyou_sect_contribution_ledger_legacy_20260804";--> statement-breakpoint
ALTER TABLE "wanjiedaoyou_sect_daily_commissions" RENAME TO "wanjiedaoyou_sect_daily_commissions_legacy_20260804";--> statement-breakpoint
CREATE INDEX "sect_stipend_claimed_idx" ON "wanjiedaoyou_sect_stipend_claims" USING btree ("claimed_at");
