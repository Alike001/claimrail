import { describe, expect, it } from "vitest";
import { SHANNON_DREAMDEX } from "../config/deployments.js";
import { FINALIZED_MARKET_ID, finalizedMarketBundle } from "../test-support/finalized-fixture.js";
import { reconcileDreamDexMarket } from "./market.js";

describe("DreamDEX market reconciliation", () => {
  it("keeps a recycled-pool market attached to marketId and nonce", () => {
    const result = reconcileDreamDexMarket({
      deployment: SHANNON_DREAMDEX,
      bundle: finalizedMarketBundle(),
      observedAt: 1_788_431_003_000,
    });
    expect(result.market.identity.marketId).toBe(FINALIZED_MARKET_ID);
    expect(result.market.lifecycle).toBe("finalized");
    expect(result.market.wiring).toMatchObject({
      status: "verified",
      value: { marketNonce: 490n },
    });
    expect(result.market.settlement.payoutVector).toMatchObject({
      status: "verified",
      value: { numerators: [10_000_000n, 0n], denominator: 10_000_000n },
    });
    expect(result.market.evidence.conflicts).toEqual([]);
  });

  it("uses chain state for action gates while retaining indexer disagreement", () => {
    const bundle = finalizedMarketBundle();
    const conflicting = {
      ...bundle,
      indexed: {
        ...bundle.indexed,
        status: "Trading" as const,
        poolAddress: "0x1111111111111111111111111111111111111111" as const,
      },
    };
    const result = reconcileDreamDexMarket({
      deployment: SHANNON_DREAMDEX,
      bundle: conflicting,
      observedAt: 1_788_431_003_000,
    });
    expect(result.market.contractStatus).toBe("resolved");
    expect(result.market.settlementFinalized).toBe(true);
    expect(result.market.lifecycle).toBe("finalized");
    expect(result.market.evidence.conflicts.map(({ field }) => field)).toEqual(
      expect.arrayContaining(["pool", "lifecycle.indexedStatus"]),
    );
  });

  it("blocks clean evidence when the deployed finalization log is absent", () => {
    const bundle = { ...finalizedMarketBundle(), finalizationEvent: null };
    const result = reconcileDreamDexMarket({
      deployment: SHANNON_DREAMDEX,
      bundle,
      observedAt: 1_788_431_003_000,
    });
    expect(result.market.settlement.finalizationTransaction.status).toBe("missing");
    expect(result.market.evidence.conflicts[0]?.field).toBe("settlement.finalizationEvent");
  });
});
