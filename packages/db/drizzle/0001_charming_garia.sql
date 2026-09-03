CREATE TYPE "public"."claim_receipt_status" AS ENUM('pending', 'confirmed', 'failed', 'superseded');--> statement-breakpoint
CREATE TABLE "claim_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" text NOT NULL,
	"deployment_key" text NOT NULL,
	"batch_index" integer NOT NULL,
	"transaction_hash" text NOT NULL,
	"status" "claim_receipt_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"block_number" numeric(78, 0),
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_transactions_claim_batch_unique" UNIQUE("claim_id","batch_index"),
	CONSTRAINT "claim_transactions_hash_unique" UNIQUE("deployment_key","transaction_hash"),
	CONSTRAINT "claim_transactions_batch_nonnegative" CHECK ("claim_transactions"."batch_index" >= 0)
);
--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD CONSTRAINT "claim_transactions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_transactions" ADD CONSTRAINT "claim_transactions_deployment_key_deployments_key_fk" FOREIGN KEY ("deployment_key") REFERENCES "public"."deployments"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_transactions_status_idx" ON "claim_transactions" USING btree ("deployment_key","status","submitted_at");