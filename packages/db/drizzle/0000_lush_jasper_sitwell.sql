CREATE TYPE "public"."binding_status" AS ENUM('pending', 'verified', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."canonical_event_type" AS ENUM('market.locked', 'market.resolved', 'market.finalized', 'market.voided', 'wallet.claimable', 'wallet.payout_owed', 'claim.plan_created', 'claim.submitted', 'claim.confirmed', 'claim.failed');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('draft', 'ready', 'submitted', 'confirmed', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('listed', 'trading', 'locked', 'settling', 'resolved', 'voided');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'delivering', 'delivered', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('missing', 'pending', 'verified', 'conflicting');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'leased', 'completed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."market_lifecycle" AS ENUM('listed', 'trading', 'locked', 'settling', 'resolved', 'voided', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."position_state" AS ENUM('open', 'locked', 'winning_unfinalized', 'claimable', 'losing', 'void_refundable', 'claim_submitted', 'redeemed', 'payout_owed');--> statement-breakpoint
CREATE TYPE "public"."scan_completeness" AS ENUM('complete', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_kind" AS ENUM('webhook', 'browser', 'telegram');--> statement-breakpoint
CREATE TABLE "claim_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" text NOT NULL,
	"position_identity" text NOT NULL,
	"market_id" text NOT NULL,
	"outcome_index" integer NOT NULL,
	"token_id" numeric(78, 0) NOT NULL,
	"amount_burned" numeric(78, 0) NOT NULL,
	"expected_payout" numeric(78, 0) NOT NULL,
	"actual_collateral" numeric(78, 0),
	"entry_index" integer NOT NULL,
	CONSTRAINT "claim_entries_claim_position_unique" UNIQUE("claim_id","position_identity"),
	CONSTRAINT "claim_entries_claim_index_unique" UNIQUE("claim_id","entry_index"),
	CONSTRAINT "claim_entries_outcome_binary" CHECK ("claim_entries"."outcome_index" in (0, 1)),
	CONSTRAINT "claim_entries_amounts_nonnegative" CHECK ("claim_entries"."amount_burned" >= 0 and "claim_entries"."expected_payout" >= 0)
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"deployment_key" text NOT NULL,
	"owner" text NOT NULL,
	"recipient" text NOT NULL,
	"status" "claim_status" NOT NULL,
	"plan_hash" text,
	"transaction_hash" text,
	"expected_payout" numeric(78, 0) NOT NULL,
	"actual_collateral" numeric(78, 0),
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"block_number" numeric(78, 0),
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_plan_hash_unique" UNIQUE("plan_hash"),
	CONSTRAINT "claims_transaction_hash_unique" UNIQUE("deployment_key","transaction_hash"),
	CONSTRAINT "claims_expected_payout_nonnegative" CHECK ("claims"."expected_payout" >= 0)
);
--> statement-breakpoint
CREATE TABLE "canonical_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "canonical_event_type" NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_transaction_hash" text,
	"source_log_index" integer,
	"block_number" numeric(78, 0),
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_events_source_unique" UNIQUE("source_transaction_hash","source_log_index","type")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"outbox_job_id" uuid,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_subscription_event_unique" UNIQUE("subscription_id","event_id"),
	CONSTRAINT "deliveries_attempt_count_nonnegative" CHECK ("deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_address" text NOT NULL,
	"channel" "subscription_kind" NOT NULL,
	"external_id" text NOT NULL,
	"status" "binding_status" DEFAULT 'pending' NOT NULL,
	"challenge_hash" text,
	"challenge_expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_event_topic_unique" UNIQUE("event_id","topic"),
	CONSTRAINT "outbox_jobs_attempts_valid" CHECK ("outbox_jobs"."attempts" >= 0 and "outbox_jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_address" text NOT NULL,
	"kind" "subscription_kind" NOT NULL,
	"destination" text NOT NULL,
	"secret_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_owner_kind_destination_unique" UNIQUE("owner_address","kind","destination")
);
--> statement-breakpoint
CREATE TABLE "audit_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"details" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_records_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"key" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"adapter_version" text NOT NULL,
	"name" text NOT NULL,
	"binary_module" text NOT NULL,
	"binary_settlement" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployments_chain_adapter_unique" UNIQUE("chain_id","adapter_version"),
	CONSTRAINT "deployments_chain_positive" CHECK ("deployments"."chain_id" > 0)
);
--> statement-breakpoint
CREATE TABLE "scan_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" text NOT NULL,
	"source_run_id" text NOT NULL,
	"completeness" "scan_completeness" NOT NULL,
	"source" text NOT NULL,
	"page_count" integer NOT NULL,
	"row_count" integer NOT NULL,
	"unique_position_count" integer NOT NULL,
	"next_offset" integer,
	"failure_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scan_runs_wallet_source_unique" UNIQUE("wallet_id","source_run_id"),
	CONSTRAINT "scan_runs_counts_nonnegative" CHECK ("scan_runs"."page_count" >= 0 and "scan_runs"."row_count" >= 0 and "scan_runs"."unique_position_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "watched_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"deployment_key" text NOT NULL,
	"address" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_complete_scan_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watched_wallets_deployment_address_unique" UNIQUE("deployment_key","address")
);
--> statement-breakpoint
CREATE TABLE "market_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_identity" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"block_number" numeric(78, 0),
	"transaction_hash" text,
	"payload" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "market_observations_source_unique" UNIQUE("source","source_id")
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"identity" text PRIMARY KEY NOT NULL,
	"deployment_key" text NOT NULL,
	"market_id" text NOT NULL,
	"binary_module" text NOT NULL,
	"pool" text NOT NULL,
	"market_nonce" numeric(78, 0) NOT NULL,
	"market_address" text NOT NULL,
	"outcome_token" text NOT NULL,
	"collateral" text NOT NULL,
	"contract_status" "contract_status" NOT NULL,
	"settlement_finalized" boolean NOT NULL,
	"lifecycle" "market_lifecycle" NOT NULL,
	"evidence_version" text NOT NULL,
	"canonical" jsonb NOT NULL,
	"block_number" numeric(78, 0),
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markets_deployment_market_unique" UNIQUE("deployment_key","market_id"),
	CONSTRAINT "markets_deployment_pool_nonce_unique" UNIQUE("deployment_key","pool","market_nonce")
);
--> statement-breakpoint
CREATE TABLE "position_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_identity" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"balance" numeric(78, 0) NOT NULL,
	"expected_payout" numeric(78, 0) NOT NULL,
	"block_number" numeric(78, 0),
	"payload" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "position_observations_source_unique" UNIQUE("source","source_id")
);
--> statement-breakpoint
CREATE TABLE "position_scan_members" (
	"scan_run_id" uuid NOT NULL,
	"position_identity" text NOT NULL,
	CONSTRAINT "position_scan_members_scan_run_id_position_identity_pk" PRIMARY KEY("scan_run_id","position_identity")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"identity" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"market_identity" text NOT NULL,
	"outcome_index" integer NOT NULL,
	"token_id" numeric(78, 0) NOT NULL,
	"verified_balance" numeric(78, 0) NOT NULL,
	"state" "position_state" NOT NULL,
	"expected_payout" numeric(78, 0) NOT NULL,
	"evidence_version" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"block_number" numeric(78, 0),
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_wallet_market_outcome_unique" UNIQUE("wallet_id","market_identity","outcome_index"),
	CONSTRAINT "positions_outcome_binary" CHECK ("positions"."outcome_index" in (0, 1)),
	CONSTRAINT "positions_amounts_nonnegative" CHECK ("positions"."verified_balance" >= 0 and "positions"."expected_payout" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settlement_evidence" (
	"market_identity" text PRIMARY KEY NOT NULL,
	"status" "evidence_status" NOT NULL,
	"finalized" boolean NOT NULL,
	"voided" boolean NOT NULL,
	"backing" numeric(78, 0) NOT NULL,
	"settlement_fee_bps_times_1k" numeric(78, 0) NOT NULL,
	"payout_numerators" jsonb NOT NULL,
	"payout_denominator" numeric(78, 0) NOT NULL,
	"finalization_transaction" text,
	"block_number" numeric(78, 0),
	"evidence" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_backing_nonnegative" CHECK ("settlement_evidence"."backing" >= 0),
	CONSTRAINT "settlement_payout_denominator_positive" CHECK ("settlement_evidence"."payout_denominator" > 0)
);
--> statement-breakpoint
ALTER TABLE "claim_entries" ADD CONSTRAINT "claim_entries_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_entries" ADD CONSTRAINT "claim_entries_position_identity_positions_identity_fk" FOREIGN KEY ("position_identity") REFERENCES "public"."positions"("identity") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_deployment_key_deployments_key_fk" FOREIGN KEY ("deployment_key") REFERENCES "public"."deployments"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_event_id_canonical_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."canonical_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_outbox_job_id_outbox_jobs_id_fk" FOREIGN KEY ("outbox_job_id") REFERENCES "public"."outbox_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_event_id_canonical_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."canonical_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_runs" ADD CONSTRAINT "scan_runs_wallet_id_watched_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."watched_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_wallets" ADD CONSTRAINT "watched_wallets_deployment_key_deployments_key_fk" FOREIGN KEY ("deployment_key") REFERENCES "public"."deployments"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_observations" ADD CONSTRAINT "market_observations_market_identity_markets_identity_fk" FOREIGN KEY ("market_identity") REFERENCES "public"."markets"("identity") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_deployment_key_deployments_key_fk" FOREIGN KEY ("deployment_key") REFERENCES "public"."deployments"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_observations" ADD CONSTRAINT "position_observations_position_identity_positions_identity_fk" FOREIGN KEY ("position_identity") REFERENCES "public"."positions"("identity") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_scan_members" ADD CONSTRAINT "position_scan_members_scan_run_id_scan_runs_id_fk" FOREIGN KEY ("scan_run_id") REFERENCES "public"."scan_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_scan_members" ADD CONSTRAINT "position_scan_members_position_identity_positions_identity_fk" FOREIGN KEY ("position_identity") REFERENCES "public"."positions"("identity") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_wallet_id_watched_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."watched_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_identity_markets_identity_fk" FOREIGN KEY ("market_identity") REFERENCES "public"."markets"("identity") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_evidence" ADD CONSTRAINT "settlement_evidence_market_identity_markets_identity_fk" FOREIGN KEY ("market_identity") REFERENCES "public"."markets"("identity") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_owner_status_idx" ON "claims" USING btree ("deployment_key","owner","status");--> statement-breakpoint
CREATE INDEX "canonical_events_aggregate_idx" ON "canonical_events" USING btree ("aggregate_type","aggregate_id","occurred_at");--> statement-breakpoint
CREATE INDEX "deliveries_status_next_idx" ON "deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_bindings_owner_channel_unique" ON "notification_bindings" USING btree ("owner_address","channel") WHERE "notification_bindings"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "outbox_jobs_ready_idx" ON "outbox_jobs" USING btree ("available_at","created_at") WHERE "outbox_jobs"."status" in ('pending', 'leased');--> statement-breakpoint
CREATE INDEX "audit_records_subject_idx" ON "audit_records" USING btree ("subject_type","subject_id","occurred_at");--> statement-breakpoint
CREATE INDEX "scan_runs_wallet_started_idx" ON "scan_runs" USING btree ("wallet_id","started_at");--> statement-breakpoint
CREATE INDEX "watched_wallets_enabled_idx" ON "watched_wallets" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "market_observations_market_block_idx" ON "market_observations" USING btree ("market_identity","block_number");--> statement-breakpoint
CREATE INDEX "markets_lifecycle_idx" ON "markets" USING btree ("deployment_key","lifecycle");--> statement-breakpoint
CREATE INDEX "position_observations_position_block_idx" ON "position_observations" USING btree ("position_identity","block_number");--> statement-breakpoint
CREATE INDEX "positions_wallet_state_idx" ON "positions" USING btree ("wallet_id","state");