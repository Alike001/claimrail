ALTER TABLE "claim_transactions" DROP CONSTRAINT "claim_transactions_batch_nonnegative";--> statement-breakpoint
DROP INDEX "claim_transactions_status_idx";--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "claim_transactions_status_idx" ON "claim_transactions" USING btree ("deployment_key","status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD CONSTRAINT "claim_transactions_counters_valid" CHECK ("claim_transactions"."batch_index" >= 0 and "claim_transactions"."attempts" >= 0);