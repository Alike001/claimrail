import { describe, expect, it, vi } from "vitest";
import type { DreamDexClaimGateway } from "../chain/types.js";
import { SHANNON_DREAMDEX } from "../config/deployments.js";
import { finalizedMarketBundle } from "../test-support/finalized-fixture.js";
import type { OutcomeBalanceRow } from "../indexer/outcome-balances.js";
import { ClaimRailReadService } from "./claimrail.js";
import { ClaimRailClaimService } from "../claims/service.js";

const WALLET = "0xe1DA3bdD4189FDEfB2eF8A73bd37A4083F284477" as const;

function readGateway(
  balance: bigint,
  options: { readonly operatorApproved?: boolean; readonly gasEstimate?: bigint } = {},
): DreamDexClaimGateway {
  const bundle = finalizedMarketBundle();
  return {
    listBinaryMarkets: vi.fn(() => Promise.resolve([bundle.indexed])),
    getBinaryMarket: vi.fn(() => Promise.resolve(bundle.indexed)),
    getMarketOnchain: vi.fn(() => Promise.resolve(bundle.onchain)),
    getMarketResolution: vi.fn(() => Promise.resolve(bundle.resolution)),
    getMarketStatusHistory: vi.fn(() => Promise.resolve(bundle.statusHistory)),
    getMarketFees: vi.fn(() => Promise.resolve(bundle.fees)),
    getOnchainResolutionPrice: vi.fn(() => Promise.resolve(bundle.onchainResolutionPrice)),
    getPayoutNumerators: vi.fn(() => Promise.resolve(bundle.directPayoutNumerators)),
    getSettlement: vi.fn(() => Promise.resolve(bundle.settlement)),
    getOutcomeBalance: vi.fn(() => Promise.resolve(balance)),
    isOperator: vi.fn(() => Promise.resolve(options.operatorApproved ?? true)),
    simulateRedeemMany: vi.fn(() =>
      Promise.resolve({
        gasEstimate: options.gasEstimate ?? 650_000n,
        verifiedBlock: bundle.head.blockNumber,
      }),
    ),
    getFinalizationEvent: vi.fn(() => Promise.resolve(bundle.finalizationEvent)),
    getHead: vi.fn(() => Promise.resolve(bundle.head)),
    getRouterActions: vi.fn(() => Promise.resolve([])),
    getFills: vi.fn(() => Promise.resolve([])),
  };
}

function winnerRow(balance = "1000000"): OutcomeBalanceRow {
  const market = finalizedMarketBundle().indexed;
  return {
    id: `${market.marketId}_0_${WALLET.toLowerCase()}`,
    account: WALLET,
    outcomeIndex: 0,
    tokenId: market.yesTokenId,
    balance,
    market: {
      id: market.marketId,
      marketAddress: market.marketAddress,
      poolAddress: market.poolAddress,
      asset: market.asset,
      question: market.question,
      clobStatus: market.status,
      expiry: market.expiry,
      winningOutcome: market.winningOutcome,
      voided: market.voided,
      quoteDecimals: market.quoteDecimals,
      intervalSec: market.intervalSec ?? null,
    },
  };
}

function loserRow(balance = "250000"): OutcomeBalanceRow {
  const winner = winnerRow(balance);
  const market = finalizedMarketBundle().indexed;
  return {
    ...winner,
    id: `${market.marketId}_1_${WALLET.toLowerCase()}`,
    outcomeIndex: 1,
    tokenId: market.noTokenId,
  };
}

describe("ClaimRail DreamDEX read service", () => {
  it("turns one public address into verified positions and claim candidates", async () => {
    const gateway = readGateway(1_000_000n);
    const row = winnerRow();
    const service = new ClaimRailReadService({
      deployment: SHANNON_DREAMDEX,
      gateway,
      fetchPage: ({ offset }) => Promise.resolve(offset === 0 ? [row] : []),
      readBundle: () => Promise.resolve(finalizedMarketBundle()),
      now: () => 1_788_431_003_000,
    });
    const result = await service.readWallet(WALLET);
    expect(result.positions.completeness).toBe("complete");
    expect(result.positions.positions).toHaveLength(1);
    expect(result.positions.positions[0]).toMatchObject({
      state: "claimable",
      expectedPayout: 1_000_000n,
      outcomeIndex: 0,
    });
    expect(result.claimCandidates).toHaveLength(1);
    expect(result.claimAssessments).toHaveLength(1);
    expect(result.claimCandidates[0]).toMatchObject({
      amount: 1_000_000n,
      outcomeToken: finalizedMarketBundle().onchain.outcomeToken.toLowerCase(),
      settlementFinalized: true,
      conflicts: [],
    });
    expect(result.operatorApproved).toBe(true);
  });

  it("returns the exact module-wide approval before attempting a redemption simulation", async () => {
    const gateway = readGateway(1_000_000n, { operatorApproved: false });
    const readService = new ClaimRailReadService({
      deployment: SHANNON_DREAMDEX,
      gateway,
      fetchPage: ({ offset }) => Promise.resolve(offset === 0 ? [winnerRow()] : []),
      readBundle: () => Promise.resolve(finalizedMarketBundle()),
      now: () => 1_788_431_003_000,
    });
    const result = await new ClaimRailClaimService({
      deployment: SHANNON_DREAMDEX,
      gateway,
      readService,
      now: () => 1_788_431_003_000,
    }).prepare(WALLET);
    expect(result).toMatchObject({
      status: "approval_required",
      draft: {
        approval: {
          required: true,
          scope: "module-wide",
          operator: SHANNON_DREAMDEX.addresses.binaryModule.toLowerCase(),
        },
        outcomeToken: finalizedMarketBundle().onchain.outcomeToken.toLowerCase(),
      },
    });
    expect(gateway.simulateRedeemMany).not.toHaveBeenCalled();
  });

  it("simulates every exact batch and hashes a ready owner-only plan", async () => {
    const gateway = readGateway(1_000_000n);
    const readService = new ClaimRailReadService({
      deployment: SHANNON_DREAMDEX,
      gateway,
      fetchPage: ({ offset }) => Promise.resolve(offset === 0 ? [winnerRow()] : []),
      readBundle: () => Promise.resolve(finalizedMarketBundle()),
      now: () => 1_788_431_003_000,
    });
    const result = await new ClaimRailClaimService({
      deployment: SHANNON_DREAMDEX,
      gateway,
      readService,
      now: () => 1_788_431_003_000,
    }).prepare(WALLET);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected a ready plan");
    expect(result.plan).toMatchObject({
      owner: WALLET.toLowerCase(),
      recipient: WALLET.toLowerCase(),
      expectedPayout: 1_000_000n,
      simulations: [{ status: "passed", batchIndex: 0, gasEstimate: 650_000n }],
    });
    expect(result.plan.integrityHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(gateway.simulateRedeemMany).toHaveBeenCalledWith({
      owner: WALLET,
      operatorId: result.plan.operatorId,
      venueId: result.plan.venueId,
      marketIds: [result.plan.entries[0]?.marketId],
      outcomeIndexes: [0],
      amounts: [1_000_000n],
    });
  });

  it("keeps a finalized loser in plan exclusions but out of claimable events and calldata", async () => {
    const gateway = readGateway(1_000_000n);
    const readService = new ClaimRailReadService({
      deployment: SHANNON_DREAMDEX,
      gateway,
      fetchPage: ({ offset }) =>
        Promise.resolve(offset === 0 ? [winnerRow(), loserRow("1000000")] : []),
      readBundle: () => Promise.resolve(finalizedMarketBundle()),
      now: () => 1_788_431_003_000,
    });
    const wallet = await readService.readWallet(WALLET);
    expect(wallet.claimAssessments).toHaveLength(2);
    expect(wallet.claimCandidates).toHaveLength(1);

    const result = await new ClaimRailClaimService({
      deployment: SHANNON_DREAMDEX,
      gateway,
      readService,
      now: () => 1_788_431_003_000,
    }).prepare(WALLET);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected a ready plan");
    expect(result.plan.entries).toHaveLength(1);
    expect(result.plan.exclusions).toMatchObject([{ outcomeIndex: 1, reason: "zero_payout" }]);
    expect(gateway.simulateRedeemMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcomeIndexes: [0], amounts: [1_000_000n] }),
    );
  });

  it("keeps a mismatched indexed balance visible but out of verified claim candidates", async () => {
    const service = new ClaimRailReadService({
      deployment: SHANNON_DREAMDEX,
      gateway: readGateway(900_000n),
      fetchPage: () => Promise.resolve([winnerRow("1000000")]),
      readBundle: () => Promise.resolve(finalizedMarketBundle()),
      now: () => 1_788_431_003_000,
    });
    const result = await service.readWallet(WALLET);
    expect(result.positions.positions[0]?.verifiedBalance).toBe(900_000n);
    expect(result.positions.positions[0]?.evidence.conflicts[0]?.reason).toContain(
      "indexed balance",
    );
    expect(result.claimCandidates).toEqual([]);
  });

  it("builds a plain-language settlement explanation from verified inputs", async () => {
    const service = new ClaimRailReadService({
      deployment: SHANNON_DREAMDEX,
      gateway: readGateway(1_000_000n),
      fetchPage: () => Promise.resolve([]),
      readBundle: () => Promise.resolve(finalizedMarketBundle()),
      now: () => 1_788_431_003_000,
    });
    const result = await service.explainSettlement(finalizedMarketBundle().indexed.marketId);
    expect(result.market.lifecycle).toBe("finalized");
    expect(result.explanation.rule).toContain("closing oracle value");
    expect(result.explanation.winningOutcome).toMatchObject({ status: "verified", value: 0 });
    expect(result.explanation.finalizationTransaction.status).toBe("verified");
  });
});
