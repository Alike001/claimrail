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
import { describe, expect, it, vi } from "vitest";
import receiptJson from "../../../../fixtures/dreamdex/live/shannon-50312/redemption-receipts.json" with { type: "json" };
import type { DreamDexReceiptGateway, TransactionReceiptSnapshot } from "../chain/types.js";
import { SHANNON_DREAMDEX } from "../config/deployments.js";
import { reconcileClaimReceipt } from "./service.js";

const MARKET_ID = "0x00000000000000000000000000000000000000000000000000000000000121ed";
const OWNER = "0xa8059AAE0157BDfD1a05Fe1Ecabf7364a7893FB5";
const TRANSACTION = "0xa0eeb1bf54a449c92ccd5b0e847faf21e77dfcfecf5a17df113ee0e2e5f896fb";
const TOKEN_ID =
  4_874_552_181_458_820_275_566_616_024_331_342_572_547_006_279_496_190_115_371_908_761_519_360n;
const AMOUNT = 1_494_000_000n;

interface ReceiptFixture {
  readonly events: {
    readonly settlement: {
      readonly Redeemed: {
        readonly value: readonly {
          readonly address: string;
          readonly topics: readonly string[];
          readonly data: string;
          readonly logIndex: number;
        }[];
      };
    };
  };
}

const fixture = (receiptJson as unknown as Record<string, ReceiptFixture>)[MARKET_ID];
if (fixture === undefined) throw new Error("redemption receipt fixture is missing");
const redeemedLog = fixture.events.settlement.Redeemed.value[0];
if (redeemedLog === undefined) throw new Error("winner Redeemed fixture is missing");

const entry: ClaimEntry = {
  positionIdentity: "receipt-position-1",
  marketId: asMarketId(MARKET_ID),
  outcomeIndex: 0,
  tokenId: asTokenId(TOKEN_ID),
  amount: asBaseUnit(AMOUNT),
  verifiedBalance: asBaseUnit(AMOUNT),
  pool: asAddress("0xb4cea3f5cb827716c843c4b7db1b5a9abd8209d8"),
  marketNonce: 517n,
  collateral: asAddress("0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e"),
  settlementBacking: asBaseUnit(1_500_000_000n),
  payoutNumerator: asBaseUnit(10_000_000n),
  payoutDenominator: asBaseUnit(10_000_000n),
  settlementFeeBpsTimes1k: asBaseUnit(0n),
  expectedPayout: asBaseUnit(AMOUNT),
  evidenceVersion: "captured-receipt-v1",
  candidateIds: ["receipt-candidate-1"],
};

const plan: ClaimPlan = {
  schemaVersion: "1",
  chainId: asChainId(50_312),
  binaryModule: asAddress(SHANNON_DREAMDEX.addresses.binaryModule),
  outcomeToken: asAddress("0xb52c5934113af5c0bb20eb3c72290c8215f755b9"),
  venueId: asVenueId("0x1a1e6821cde7d0159c0d293177871e09677b4e42307c7db3ba94f8648a5a050f"),
  operatorId: 4,
  owner: asAddress(OWNER),
  recipient: asAddress(OWNER),
  approval: {
    required: false,
    scope: "module-wide",
    operator: asAddress(SHANNON_DREAMDEX.addresses.binaryModule),
  },
  entries: [entry],
  batches: [{ index: 0, entries: [entry], expectedPayout: asBaseUnit(AMOUNT) }],
  exclusions: [],
  expectedPayout: asBaseUnit(AMOUNT),
  discoveryCompleteness: "complete",
  verifiedBlock: asBlockNumber(478_571_073n),
  createdAt: asTimestampMs(1_788_430_200_000),
  expiresAt: asTimestampMs(1_788_430_290_000),
  batchPolicy: { maxEntries: 100, name: "test", evidenceReference: "captured receipt" },
  simulations: [
    {
      status: "passed",
      batchIndex: 0,
      gasEstimate: 1_500_000n,
      verifiedBlock: asBlockNumber(478_571_073n),
    },
  ],
  integrityHash: asIntegrityHash(`0x${"12".repeat(32)}`),
};

function gateway(
  receipt: TransactionReceiptSnapshot | null,
  overrides: { readonly balance?: bigint; readonly backing?: bigint; readonly owed?: bigint } = {},
) {
  return {
    getTransactionReceiptSnapshot: vi.fn(() => Promise.resolve(receipt)),
    getMissingTransactionStatus: vi.fn(() => Promise.resolve("pending" as const)),
    getOutcomeBalanceAtBlock: vi.fn(() => Promise.resolve(overrides.balance ?? 0n)),
    getSettlementAtBlock: vi.fn(() =>
      Promise.resolve({
        collateralToken: plan.entries[0]!.collateral,
        backing: overrides.backing ?? 6_000_000n,
        finalized: true,
        voided: false,
        settlementFeeBpsTimes1k: 0n,
        feeRecipient: asAddress(`0x${"34".repeat(20)}`),
        pool: plan.entries[0]!.pool,
        nonce: 517n,
        payoutNumerators: [10_000_000n, 0n],
      }),
    ),
    getOwed: vi.fn(() => Promise.resolve(overrides.owed ?? 0n)),
    getBlockTimestamp: vi.fn(() => Promise.resolve(1_788_430_400n)),
  } as unknown as DreamDexReceiptGateway;
}

const successfulReceipt: TransactionReceiptSnapshot = {
  status: "success",
  blockNumber: 478_572_322n,
  gasUsed: 1_420_000n,
  logs: [
    {
      address: asAddress(redeemedLog.address),
      data: redeemedLog.data as `0x${string}`,
      topics: redeemedLog.topics as readonly `0x${string}`[],
      logIndex: redeemedLog.logIndex,
    },
  ],
};

function input(receipt: TransactionReceiptSnapshot | null) {
  return {
    deployment: SHANNON_DREAMDEX,
    gateway: gateway(receipt),
    plan,
    batchIndex: 0,
    transactionHash: TRANSACTION as `0x${string}`,
    transactionNonce: 7n,
    submittedAt: 1_788_430_300_000,
  };
}

describe("DreamDEX claim receipt reconciliation", () => {
  it("keeps a missing receipt pending and a reverted receipt failed", async () => {
    await expect(reconcileClaimReceipt(input(null))).resolves.toMatchObject({ status: "pending" });
    await expect(
      reconcileClaimReceipt(
        input({ status: "reverted", blockNumber: 478_572_322n, gasUsed: 1n, logs: [] }),
      ),
    ).resolves.toMatchObject({ status: "failed", reason: "redeemMany transaction reverted" });
  });

  it("marks a missing hash superseded only after the sender nonce proves replacement", async () => {
    const pending = input(null);
    await expect(
      reconcileClaimReceipt({
        ...pending,
        gateway: {
          ...pending.gateway,
          getMissingTransactionStatus: vi.fn(() => Promise.resolve("superseded" as const)),
        },
      }),
    ).resolves.toMatchObject({ status: "superseded", reason: expect.stringContaining("nonce") });
  });

  it("confirms the captured winner only after event, balance, and backing agree", async () => {
    const result = await reconcileClaimReceipt(input(successfulReceipt));
    expect(result.status).toBe("confirmed");
    if (result.status !== "confirmed") throw new Error("expected confirmed reconciliation");
    expect(result.receipt).toMatchObject({
      transactionHash: TRANSACTION,
      expectedPayout: AMOUNT,
      actualCollateral: AMOUNT,
      blockNumber: 478_572_322n,
      entries: [{ outcomeIndex: 0, amountBurned: AMOUNT, actualCollateral: AMOUNT }],
    });
    expect(result.postBalances).toEqual([{ tokenId: TOKEN_ID, balance: 0n }]);
    expect(result.postSettlementBacking).toHaveLength(1);
  });

  it("refuses success when the post-balance does not show the burn", async () => {
    const mismatch = input(successfulReceipt);
    const result = await reconcileClaimReceipt({
      ...mismatch,
      gateway: gateway(successfulReceipt, { balance: 1n }),
    });
    expect(result).toMatchObject({
      status: "failed",
      reason: expect.stringContaining("post-claim balance"),
    });
  });
});
