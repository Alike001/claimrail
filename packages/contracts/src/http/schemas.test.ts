import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  claimPrepareResponseSchema,
  evmAddressSchema,
  marketIdSchema,
  walletPositionsResponseSchema,
} from "./schemas.js";

describe("public HTTP schemas", () => {
  it("accepts exact EVM identities and rejects lookalikes", () => {
    expect(evmAddressSchema.safeParse(`0x${"ab".repeat(20)}`).success).toBe(true);
    expect(evmAddressSchema.safeParse(`0x${"ab".repeat(19)}`).success).toBe(false);
    expect(marketIdSchema.safeParse(`0x${"cd".repeat(32)}`).success).toBe(true);
    expect(marketIdSchema.safeParse(`0x${"cd".repeat(31)}`).success).toBe(false);
  });

  it("keeps amounts and blocks as lossless decimal strings", () => {
    const parsed = walletPositionsResponseSchema.parse({
      schemaVersion: "1",
      address: `0x${"ab".repeat(20)}`,
      completeness: "complete",
      observedAt: "2026-09-03T16:00:00.000Z",
      verifiedBlock: "42918631",
      pageCount: 1,
      rowCount: 1,
      positions: [{ expectedPayout: "3670000000" }],
      failures: [],
    });
    expect(parsed.positions[0]?.expectedPayout).toBe("3670000000");
  });

  it("requires the stable error envelope version", () => {
    expect(
      apiErrorSchema.safeParse({
        schemaVersion: "1",
        error: { code: "invalid_address", message: "Invalid EVM address" },
      }).success,
    ).toBe(true);
    expect(
      apiErrorSchema.safeParse({
        schemaVersion: "2",
        error: { code: "invalid_address", message: "Invalid EVM address" },
      }).success,
    ).toBe(false);
  });

  it("rejects a ready claim plan when a financial amount is not a decimal string", () => {
    const address = `0x${"ab".repeat(20)}`;
    const marketId = `0x${"cd".repeat(32)}`;
    const entry = {
      positionIdentity: "position:1",
      marketId,
      outcomeIndex: 0,
      tokenId: "2",
      amount: 1_000_000,
      verifiedBalance: "1000000",
      pool: address,
      marketNonce: "1",
      collateral: address,
      settlementBacking: "1000000",
      payoutNumerator: "10000000",
      payoutDenominator: "10000000",
      settlementFeeBpsTimes1k: "0",
      expectedPayout: "1000000",
      evidenceVersion: "test-v1",
      candidateIds: ["candidate-1"],
    };
    expect(
      claimPrepareResponseSchema.safeParse({
        schemaVersion: "1",
        status: "ready",
        plan: {
          schemaVersion: "1",
          chainId: 50_312,
          binaryModule: address,
          outcomeToken: address,
          venueId: marketId,
          operatorId: 4,
          owner: address,
          recipient: address,
          approval: { required: false, scope: "module-wide", operator: address },
          entries: [entry],
          batches: [{ index: 0, entries: [entry], expectedPayout: "1000000" }],
          exclusions: [],
          expectedPayout: "1000000",
          discoveryCompleteness: "complete",
          verifiedBlock: "123",
          createdAt: 1,
          expiresAt: 2,
          batchPolicy: { maxEntries: 100, name: "test", evidenceReference: "fixture:test" },
          simulations: [
            { status: "passed", batchIndex: 0, gasEstimate: "650000", verifiedBlock: "123" },
          ],
          integrityHash: marketId,
        },
      }).success,
    ).toBe(false);
  });
});
