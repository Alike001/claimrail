import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  contractStatusEnum,
  evidenceStatusEnum,
  marketLifecycleEnum,
  positionStateEnum,
} from "./enums.js";
import {
  blockNumber,
  deployments,
  scanRuns,
  timestampTz,
  uint256,
  watchedWallets,
} from "./foundation.js";

export const markets = pgTable(
  "markets",
  {
    identity: text("identity").primaryKey(),
    deploymentKey: text("deployment_key")
      .notNull()
      .references(() => deployments.key, { onDelete: "cascade" }),
    marketId: text("market_id").notNull(),
    binaryModule: text("binary_module").notNull(),
    pool: text("pool").notNull(),
    marketNonce: uint256("market_nonce").notNull(),
    marketAddress: text("market_address").notNull(),
    outcomeToken: text("outcome_token").notNull(),
    collateral: text("collateral").notNull(),
    contractStatus: contractStatusEnum("contract_status").notNull(),
    settlementFinalized: boolean("settlement_finalized").notNull(),
    lifecycle: marketLifecycleEnum("lifecycle").notNull(),
    evidenceVersion: text("evidence_version").notNull(),
    canonical: jsonb("canonical").$type<Record<string, unknown>>().notNull(),
    verifiedBlock: blockNumber(),
    observedAt: timestampTz("observed_at").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("markets_deployment_market_unique").on(table.deploymentKey, table.marketId),
    unique("markets_deployment_pool_nonce_unique").on(
      table.deploymentKey,
      table.pool,
      table.marketNonce,
    ),
    index("markets_lifecycle_idx").on(table.deploymentKey, table.lifecycle),
  ],
);

export const marketObservations = pgTable(
  "market_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketIdentity: text("market_identity")
      .notNull()
      .references(() => markets.identity, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    blockNumber: blockNumber(),
    transactionHash: text("transaction_hash"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    observedAt: timestampTz("observed_at").notNull(),
  },
  (table) => [
    unique("market_observations_source_unique").on(table.source, table.sourceId),
    index("market_observations_market_block_idx").on(table.marketIdentity, table.blockNumber),
  ],
);

export const settlementEvidence = pgTable(
  "settlement_evidence",
  {
    marketIdentity: text("market_identity")
      .primaryKey()
      .references(() => markets.identity, { onDelete: "cascade" }),
    status: evidenceStatusEnum("status").notNull(),
    finalized: boolean("finalized").notNull(),
    voided: boolean("voided").notNull(),
    backing: uint256("backing").notNull(),
    settlementFeeBpsTimes1k: uint256("settlement_fee_bps_times_1k").notNull(),
    payoutNumerators: jsonb("payout_numerators").$type<readonly string[]>().notNull(),
    payoutDenominator: uint256("payout_denominator").notNull(),
    finalizationTransaction: text("finalization_transaction"),
    verifiedBlock: blockNumber(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    observedAt: timestampTz("observed_at").notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("settlement_backing_nonnegative", sql`${table.backing} >= 0`),
    check("settlement_payout_denominator_positive", sql`${table.payoutDenominator} > 0`),
  ],
);

export const positions = pgTable(
  "positions",
  {
    identity: text("identity").primaryKey(),
    walletId: text("wallet_id")
      .notNull()
      .references(() => watchedWallets.id, { onDelete: "cascade" }),
    marketIdentity: text("market_identity")
      .notNull()
      .references(() => markets.identity, { onDelete: "cascade" }),
    outcomeIndex: integer("outcome_index").notNull(),
    tokenId: uint256("token_id").notNull(),
    verifiedBalance: uint256("verified_balance").notNull(),
    state: positionStateEnum("state").notNull(),
    expectedPayout: uint256("expected_payout").notNull(),
    evidenceVersion: text("evidence_version").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    verifiedBlock: blockNumber(),
    observedAt: timestampTz("observed_at").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("positions_wallet_market_outcome_unique").on(
      table.walletId,
      table.marketIdentity,
      table.outcomeIndex,
    ),
    index("positions_wallet_state_idx").on(table.walletId, table.state),
    check("positions_outcome_binary", sql`${table.outcomeIndex} in (0, 1)`),
    check(
      "positions_amounts_nonnegative",
      sql`${table.verifiedBalance} >= 0 and ${table.expectedPayout} >= 0`,
    ),
  ],
);

export const positionObservations = pgTable(
  "position_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    positionIdentity: text("position_identity")
      .notNull()
      .references(() => positions.identity, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    balance: uint256("balance").notNull(),
    expectedPayout: uint256("expected_payout").notNull(),
    blockNumber: blockNumber(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    observedAt: timestampTz("observed_at").notNull(),
  },
  (table) => [
    unique("position_observations_source_unique").on(table.source, table.sourceId),
    index("position_observations_position_block_idx").on(table.positionIdentity, table.blockNumber),
  ],
);

export const positionScanMembers = pgTable(
  "position_scan_members",
  {
    scanRunId: uuid("scan_run_id")
      .notNull()
      .references(() => scanRuns.id, { onDelete: "cascade" }),
    positionIdentity: text("position_identity")
      .notNull()
      .references(() => positions.identity, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.scanRunId, table.positionIdentity] })],
);
