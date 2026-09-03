ALTER TABLE "deliveries" DROP CONSTRAINT "deliveries_attempt_count_nonnegative";--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "max_attempts" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_attempts_valid" CHECK ("deliveries"."attempt_count" >= 0 and "deliveries"."max_attempts" > 0);