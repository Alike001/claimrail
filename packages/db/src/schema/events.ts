import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  bindingStatusEnum,
  canonicalEventTypeEnum,
  deliveryStatusEnum,
  jobStatusEnum,
  subscriptionKindEnum,
} from "./enums.js";
import { blockNumber, timestampTz } from "./foundation.js";

export const canonicalEvents = pgTable(
  "canonical_events",
  {
    id: text("id").primaryKey(),
    type: canonicalEventTypeEnum("type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    schemaVersion: text("schema_version").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    sourceTransactionHash: text("source_transaction_hash"),
    sourceLogIndex: integer("source_log_index"),
    blockNumber: blockNumber(),
    occurredAt: timestampTz("occurred_at").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("canonical_events_source_unique").on(
      table.sourceTransactionHash,
      table.sourceLogIndex,
      table.type,
    ),
    index("canonical_events_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
      table.occurredAt,
    ),
  ],
);

export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => canonicalEvents.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: jobStatusEnum("status").default("pending").notNull(),
    availableAt: timestampTz("available_at").defaultNow().notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestampTz("lease_expires_at"),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(8).notNull(),
    lastError: text("last_error"),
    completedAt: timestampTz("completed_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("outbox_jobs_event_topic_unique").on(table.eventId, table.topic),
    index("outbox_jobs_ready_idx")
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.status} in ('pending', 'leased')`),
    check("outbox_jobs_attempts_valid", sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerAddress: text("owner_address").notNull(),
    kind: subscriptionKindEnum("kind").notNull(),
    destination: text("destination").notNull(),
    eventTypes: jsonb("event_types").$type<readonly string[]>().notNull().default([]),
    secretHash: text("secret_hash"),
    secretCiphertext: text("secret_ciphertext"),
    active: boolean("active").default(true).notNull(),
    verifiedAt: timestampTz("verified_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("subscriptions_owner_kind_destination_unique").on(
      table.ownerAddress,
      table.kind,
      table.destination,
    ),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => canonicalEvents.id, { onDelete: "cascade" }),
    outboxJobId: uuid("outbox_job_id").references(() => outboxJobs.id, {
      onDelete: "set null",
    }),
    status: deliveryStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(8).notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestampTz("lease_expires_at"),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    nextAttemptAt: timestampTz("next_attempt_at"),
    deliveredAt: timestampTz("delivered_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("deliveries_subscription_event_unique").on(table.subscriptionId, table.eventId),
    index("deliveries_status_next_idx").on(table.status, table.nextAttemptAt),
    check(
      "deliveries_attempts_valid",
      sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0`,
    ),
  ],
);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    signatureVersion: text("signature_version"),
    requestTimestamp: integer("request_timestamp"),
    startedAt: timestampTz("started_at").notNull(),
    finishedAt: timestampTz("finished_at"),
  },
  (table) => [
    unique("delivery_attempts_delivery_number_unique").on(table.deliveryId, table.attemptNumber),
    index("delivery_attempts_delivery_started_idx").on(table.deliveryId, table.startedAt),
    check("delivery_attempts_number_positive", sql`${table.attemptNumber} > 0`),
  ],
);

export const accessChallenges = pgTable(
  "access_challenges",
  {
    id: uuid("id").primaryKey(),
    ownerAddress: text("owner_address").notNull(),
    purpose: text("purpose").notNull(),
    messageHash: text("message_hash").notNull(),
    expiresAt: timestampTz("expires_at").notNull(),
    usedAt: timestampTz("used_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [index("access_challenges_owner_created_idx").on(table.ownerAddress, table.createdAt)],
);

export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerAddress: text("owner_address").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: jsonb("scopes").$type<readonly string[]>().notNull(),
    expiresAt: timestampTz("expires_at").notNull(),
    revokedAt: timestampTz("revoked_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [index("access_tokens_owner_expires_idx").on(table.ownerAddress, table.expiresAt)],
);

export const notificationBindings = pgTable(
  "notification_bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerAddress: text("owner_address").notNull(),
    channel: subscriptionKindEnum("channel").notNull(),
    externalId: text("external_id").notNull(),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    status: bindingStatusEnum("status").default("pending").notNull(),
    challengeHash: text("challenge_hash"),
    challengeExpiresAt: timestampTz("challenge_expires_at"),
    verifiedAt: timestampTz("verified_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_bindings_owner_channel_unique")
      .on(table.ownerAddress, table.channel)
      .where(sql`${table.status} <> 'revoked'`),
  ],
);
