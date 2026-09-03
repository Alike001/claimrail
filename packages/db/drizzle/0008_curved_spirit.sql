CREATE TABLE "access_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_address" text NOT NULL,
	"purpose" text NOT NULL,
	"message_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_address" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"provider_message_id" text,
	"error" text,
	"signature_version" text,
	"request_timestamp" integer,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "delivery_attempts_delivery_number_unique" UNIQUE("delivery_id","attempt_number"),
	CONSTRAINT "delivery_attempts_number_positive" CHECK ("delivery_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_challenges_owner_created_idx" ON "access_challenges" USING btree ("owner_address","created_at");--> statement-breakpoint
CREATE INDEX "access_tokens_owner_expires_idx" ON "access_tokens" USING btree ("owner_address","expires_at");--> statement-breakpoint
CREATE INDEX "delivery_attempts_delivery_started_idx" ON "delivery_attempts" USING btree ("delivery_id","started_at");