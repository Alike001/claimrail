ALTER TABLE "claim_transactions" ADD COLUMN "gas_used" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD COLUMN "actual_collateral" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "gas_used" numeric(78, 0);