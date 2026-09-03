import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { scanCompletenessEnum } from "./enums.js";

export const uint256 = (name: string) => numeric(name, { precision: 78, scale: 0, mode: "bigint" });
export const blockNumber = (name = "block_number") =>
  numeric(name, { precision: 78, scale: 0, mode: "bigint" });
export const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const deployments = pgTable(
  "deployments",
  {
    key: text("key").primaryKey(),
    chainId: integer("chain_id").notNull(),
    adapterVersion: text("adapter_version").notNull(),
    name: text("name").notNull(),
    binaryModule: text("binary_module").notNull(),
    binarySettlement: text("binary_settlement").notNull(),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("deployments_chain_adapter_unique").on(table.chainId, table.adapterVersion),
    check("deployments_chain_positive", sql`${table.chainId} > 0`),
  ],
);

export const watchedWallets = pgTable(
  "watched_wallets",
  {
    id: text("id").primaryKey(),
    deploymentKey: text("deployment_key")
      .notNull()
      .references(() => deployments.key, { onDelete: "cascade" }),
    address: text("address").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastCompleteScanAt: timestampTz("last_complete_scan_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("watched_wallets_deployment_address_unique").on(table.deploymentKey, table.address),
    index("watched_wallets_enabled_idx").on(table.enabled),
  ],
);

export const scanRuns = pgTable(
  "scan_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: text("wallet_id")
      .notNull()
      .references(() => watchedWallets.id, { onDelete: "cascade" }),
    sourceRunId: text("source_run_id").notNull(),
    completeness: scanCompletenessEnum("completeness").notNull(),
    source: text("source").notNull(),
    pageCount: integer("page_count").notNull(),
    rowCount: integer("row_count").notNull(),
    uniquePositionCount: integer("unique_position_count").notNull(),
    nextOffset: integer("next_offset"),
    failureDetails: jsonb("failure_details").$type<readonly unknown[]>().notNull().default([]),
    startedAt: timestampTz("started_at").notNull(),
    completedAt: timestampTz("completed_at").notNull(),
  },
  (table) => [
    unique("scan_runs_wallet_source_unique").on(table.walletId, table.sourceRunId),
    index("scan_runs_wallet_started_idx").on(table.walletId, table.startedAt),
    check(
      "scan_runs_counts_nonnegative",
      sql`${table.pageCount} >= 0 and ${table.rowCount} >= 0 and ${table.uniquePositionCount} >= 0`,
    ),
  ],
);

export const auditRecords = pgTable(
  "audit_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestampTz("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_records_subject_idx").on(table.subjectType, table.subjectId, table.occurredAt),
  ],
);
