import { z } from "zod";
import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asChainId,
  asIntegrityHash,
  asMarketId,
  asTimestampMs,
  asTokenId,
  asVenueId,
  type ClaimEntry,
  type ClaimPlan,
} from "@claimrail/core";

export const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 20-byte EVM address");
export const marketIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte market ID");
export const decimalIntegerSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const transactionHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte transaction hash");
export const integrityHashSchema = transactionHashSchema;
export const completenessSchema = z.enum(["complete", "partial", "failed"]);
export const lifecycleSchema = z.enum([
  "listed",
  "trading",
  "locked",
  "settling",
  "resolved",
  "voided",
  "finalized",
]);

export const apiErrorSchema = z.object({
  schemaVersion: z.literal("1"),
  error: z.object({ code: z.string(), message: z.string() }),
});

export const walletPositionsResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  address: evmAddressSchema,
  completeness: completenessSchema,
  observedAt: z.iso.datetime(),
  verifiedBlock: decimalIntegerSchema.nullable(),
  pageCount: z.number().int().nonnegative(),
  rowCount: z.number().int().nonnegative(),
  positions: z.array(z.record(z.string(), z.unknown())),
  failures: z.array(z.record(z.string(), z.unknown())),
});

export const marketSettlementResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  marketId: marketIdSchema,
  lifecycle: lifecycleSchema,
  observedAt: z.iso.datetime(),
  market: z.record(z.string(), z.unknown()),
  explanation: z.record(z.string(), z.unknown()),
});

export const claimEntrySchema = z.object({
  positionIdentity: z.string().min(1),
  marketId: marketIdSchema,
  outcomeIndex: z.union([z.literal(0), z.literal(1)]),
  tokenId: decimalIntegerSchema,
  amount: decimalIntegerSchema,
  verifiedBalance: decimalIntegerSchema,
  pool: evmAddressSchema,
  marketNonce: decimalIntegerSchema,
  collateral: evmAddressSchema,
  settlementBacking: decimalIntegerSchema,
  payoutNumerator: decimalIntegerSchema,
  payoutDenominator: decimalIntegerSchema,
  settlementFeeBpsTimes1k: decimalIntegerSchema,
  expectedPayout: decimalIntegerSchema,
  evidenceVersion: z.string().min(1),
  candidateIds: z.array(z.string().min(1)).min(1),
});

export const claimExclusionSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1),
  positionIdentity: z.string().min(1).optional(),
  marketId: marketIdSchema,
  outcomeIndex: z.union([z.literal(0), z.literal(1)]),
  reason: z.enum([
    "identity_mismatch",
    "already_redeemed",
    "stale_evidence",
    "evidence_conflict",
    "non_terminal",
    "non_finalized",
    "zero_balance",
    "zero_amount",
    "invalid_payout_vector",
    "zero_payout",
    "insufficient_backing",
    "duplicate_over_balance",
  ]),
  detail: z.string().min(1),
});

const claimBatchSchema = z.object({
  index: z.number().int().nonnegative(),
  entries: z.array(claimEntrySchema).min(1),
  expectedPayout: decimalIntegerSchema,
});

const claimPlanDraftSchema = z.object({
  schemaVersion: z.literal("1"),
  chainId: z.number().int().positive(),
  binaryModule: evmAddressSchema,
  outcomeToken: evmAddressSchema,
  venueId: marketIdSchema,
  operatorId: z.number().int().nonnegative(),
  owner: evmAddressSchema,
  recipient: evmAddressSchema,
  approval: z.object({
    required: z.boolean(),
    scope: z.literal("module-wide"),
    operator: evmAddressSchema,
  }),
  entries: z.array(claimEntrySchema).min(1),
  batches: z.array(claimBatchSchema).min(1),
  exclusions: z.array(claimExclusionSchema),
  expectedPayout: decimalIntegerSchema,
  discoveryCompleteness: completenessSchema,
  verifiedBlock: decimalIntegerSchema,
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  batchPolicy: z.object({
    maxEntries: z.number().int().positive(),
    name: z.string().min(1),
    evidenceReference: z.string().min(1),
  }),
});

export const claimPlanSchema = claimPlanDraftSchema.extend({
  simulations: z.array(
    z.discriminatedUnion("status", [
      z.object({
        status: z.literal("passed"),
        batchIndex: z.number().int().nonnegative(),
        gasEstimate: decimalIntegerSchema,
        verifiedBlock: decimalIntegerSchema,
      }),
      z.object({
        status: z.literal("failed"),
        batchIndex: z.number().int().nonnegative(),
        reason: z.string().min(1),
        verifiedBlock: decimalIntegerSchema,
      }),
    ]),
  ),
  integrityHash: integrityHashSchema,
});

export const claimPrepareRequestSchema = z.object({ owner: evmAddressSchema }).strict();
export const claimPrepareResponseSchema = z.discriminatedUnion("status", [
  z.object({
    schemaVersion: z.literal("1"),
    status: z.literal("approval_required"),
    plan: claimPlanDraftSchema,
  }),
  z.object({
    schemaVersion: z.literal("1"),
    status: z.literal("ready"),
    plan: claimPlanSchema,
  }),
]);

export const claimSubmissionRequestSchema = z
  .object({
    planHash: integrityHashSchema,
    owner: evmAddressSchema,
    chainId: z.number().int().positive(),
    batchIndex: z.number().int().nonnegative(),
    transactionHash: transactionHashSchema,
  })
  .strict();

export const claimSubmissionResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  status: z.literal("pending"),
  claimId: z.string().min(1),
  planHash: integrityHashSchema,
  transactionHash: transactionHashSchema,
  batchIndex: z.number().int().nonnegative(),
  duplicate: z.boolean(),
});

export const claimIdSchema = z.string().regex(/^claim:0x[0-9a-fA-F]{64}$/);
export const claimReceiptResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  claimId: claimIdSchema,
  planHash: integrityHashSchema,
  chainId: z.number().int().positive(),
  owner: evmAddressSchema,
  recipient: evmAddressSchema,
  status: z.enum(["draft", "ready", "submitted", "confirmed", "failed", "superseded"]),
  expectedPayout: decimalIntegerSchema,
  actualCollateral: decimalIntegerSchema.nullable(),
  gasUsed: decimalIntegerSchema.nullable(),
  submittedAt: z.iso.datetime().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  blockNumber: decimalIntegerSchema.nullable(),
  transactions: z.array(
    z.object({
      batchIndex: z.number().int().nonnegative(),
      nonce: decimalIntegerSchema.nullable(),
      transactionHash: transactionHashSchema,
      status: z.enum(["pending", "confirmed", "failed", "superseded"]),
      attempts: z.number().int().nonnegative(),
      submittedAt: z.iso.datetime(),
      confirmedAt: z.iso.datetime().nullable(),
      blockNumber: decimalIntegerSchema.nullable(),
      gasUsed: decimalIntegerSchema.nullable(),
      actualCollateral: decimalIntegerSchema.nullable(),
      fallbackOwed: decimalIntegerSchema,
      receipt: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});

function decodeClaimEntry(entry: z.infer<typeof claimEntrySchema>): ClaimEntry {
  return {
    ...entry,
    marketId: asMarketId(entry.marketId),
    tokenId: asTokenId(entry.tokenId),
    amount: asBaseUnit(entry.amount),
    verifiedBalance: asBaseUnit(entry.verifiedBalance),
    pool: asAddress(entry.pool),
    marketNonce: BigInt(entry.marketNonce),
    collateral: asAddress(entry.collateral),
    settlementBacking: asBaseUnit(entry.settlementBacking),
    payoutNumerator: asBaseUnit(entry.payoutNumerator),
    payoutDenominator: asBaseUnit(entry.payoutDenominator),
    settlementFeeBpsTimes1k: asBaseUnit(entry.settlementFeeBpsTimes1k),
    expectedPayout: asBaseUnit(entry.expectedPayout),
  };
}

/** Validates the JSON representation and restores its lossless domain types. */
export function decodeClaimPlan(value: unknown): ClaimPlan {
  const plan = claimPlanSchema.parse(value);
  const entries = plan.entries.map(decodeClaimEntry);
  return {
    ...plan,
    chainId: asChainId(plan.chainId),
    binaryModule: asAddress(plan.binaryModule),
    outcomeToken: asAddress(plan.outcomeToken),
    venueId: asVenueId(plan.venueId),
    owner: asAddress(plan.owner),
    recipient: asAddress(plan.recipient),
    approval: { ...plan.approval, operator: asAddress(plan.approval.operator) },
    entries,
    batches: plan.batches.map((batch) => ({
      ...batch,
      entries: batch.entries.map(decodeClaimEntry),
      expectedPayout: asBaseUnit(batch.expectedPayout),
    })),
    exclusions: plan.exclusions.map((exclusion) => ({
      candidateIds: exclusion.candidateIds,
      outcomeIndex: exclusion.outcomeIndex,
      reason: exclusion.reason,
      detail: exclusion.detail,
      ...(exclusion.positionIdentity === undefined
        ? {}
        : { positionIdentity: exclusion.positionIdentity }),
      marketId: asMarketId(exclusion.marketId),
    })),
    expectedPayout: asBaseUnit(plan.expectedPayout),
    verifiedBlock: asBlockNumber(plan.verifiedBlock),
    createdAt: asTimestampMs(plan.createdAt),
    expiresAt: asTimestampMs(plan.expiresAt),
    simulations: plan.simulations.map((simulation) =>
      simulation.status === "passed"
        ? {
            ...simulation,
            gasEstimate: BigInt(simulation.gasEstimate),
            verifiedBlock: asBlockNumber(simulation.verifiedBlock),
          }
        : { ...simulation, verifiedBlock: asBlockNumber(simulation.verifiedBlock) },
    ),
    integrityHash: asIntegrityHash(plan.integrityHash),
  };
}

export type WalletPositionsResponse = z.infer<typeof walletPositionsResponseSchema>;
export type MarketSettlementResponse = z.infer<typeof marketSettlementResponseSchema>;
export type ClaimPrepareResponse = z.infer<typeof claimPrepareResponseSchema>;
export type ClaimSubmissionResponse = z.infer<typeof claimSubmissionResponseSchema>;
export type ClaimReceiptResponse = z.infer<typeof claimReceiptResponseSchema>;
