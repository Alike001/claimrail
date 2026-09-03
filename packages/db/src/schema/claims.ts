import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { claimReceiptStatusEnum, claimStatusEnum } from "./enums.js";
import { blockNumber, deployments, timestampTz, uint256 } from "./foundation.js";
import { positions } from "./markets.js";

export const claims = pgTable(
  "claims",
  {
    id: text("id").primaryKey(),
    deploymentKey: text("deployment_key")
      .notNull()
      .references(() => deployments.key, { onDelete: "restrict" }),
    owner: text("owner").notNull(),
    recipient: text("recipient").notNull(),
    status: claimStatusEnum("status").notNull(),
    planHash: text("plan_hash"),
    transactionHash: text("transaction_hash"),
    expectedPayout: uint256("expected_payout").notNull(),
    actualCollateral: uint256("actual_collateral"),
    submittedAt: timestampTz("submitted_at"),
    confirmedAt: timestampTz("confirmed_at"),
    blockNumber: blockNumber(),
    gasUsed: uint256("gas_used"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("claims_plan_hash_unique").on(table.planHash),
    unique("claims_transaction_hash_unique").on(table.deploymentKey, table.transactionHash),
    index("claims_owner_status_idx").on(table.deploymentKey, table.owner, table.status),
    check("claims_expected_payout_nonnegative", sql`${table.expectedPayout} >= 0`),
  ],
);

export const claimEntries = pgTable(
  "claim_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    positionIdentity: text("position_identity")
      .notNull()
      .references(() => positions.identity, { onDelete: "restrict" }),
    marketId: text("market_id").notNull(),
    outcomeIndex: integer("outcome_index").notNull(),
    tokenId: uint256("token_id").notNull(),
    amountBurned: uint256("amount_burned").notNull(),
    expectedPayout: uint256("expected_payout").notNull(),
    actualCollateral: uint256("actual_collateral"),
    entryIndex: integer("entry_index").notNull(),
  },
  (table) => [
    unique("claim_entries_claim_position_unique").on(table.claimId, table.positionIdentity),
    unique("claim_entries_claim_index_unique").on(table.claimId, table.entryIndex),
    check("claim_entries_outcome_binary", sql`${table.outcomeIndex} in (0, 1)`),
    check(
      "claim_entries_amounts_nonnegative",
      sql`${table.amountBurned} >= 0 and ${table.expectedPayout} >= 0`,
    ),
  ],
);

export const claimTransactions = pgTable(
  "claim_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    deploymentKey: text("deployment_key")
      .notNull()
      .references(() => deployments.key, { onDelete: "restrict" }),
    batchIndex: integer("batch_index").notNull(),
    nonce: uint256("nonce"),
    transactionHash: text("transaction_hash").notNull(),
    status: claimReceiptStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestampTz("next_attempt_at").defaultNow().notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestampTz("lease_expires_at"),
    lastError: text("last_error"),
    submittedAt: timestampTz("submitted_at").notNull(),
    confirmedAt: timestampTz("confirmed_at"),
    blockNumber: blockNumber(),
    gasUsed: uint256("gas_used"),
    actualCollateral: uint256("actual_collateral"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("claim_transactions_claim_batch_unique").on(table.claimId, table.batchIndex),
    unique("claim_transactions_hash_unique").on(table.deploymentKey, table.transactionHash),
    index("claim_transactions_status_idx").on(
      table.deploymentKey,
      table.status,
      table.nextAttemptAt,
    ),
    check(
      "claim_transactions_counters_valid",
      sql`${table.batchIndex} >= 0 and ${table.attempts} >= 0`,
    ),
  ],
);
