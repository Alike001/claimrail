import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asChainId,
  asMarketId,
  asTimestampMs,
  asTokenId,
  type MarketRecord,
  type PositionScan,
  type WalletPosition,
} from "@claimrail/core";
import { describe, expect, it } from "vitest";
import { buildInboxViewModel } from "./view-model.js";

const address = asAddress(`0x${"11".repeat(20)}`);
const binaryModule = asAddress(`0x${"22".repeat(20)}`);
const marketId = asMarketId(`0x${"33".repeat(32)}`);
const observedAt = asTimestampMs(Date.parse("2026-09-03T16:00:00.000Z"));
const source = { name: "test", observedAt, blockNumber: asBlockNumber(42_918_631n) };
const evidence = {
  version: "test/v1",
  freshness: "fresh",
  observedAt,
  verifiedBlock: asBlockNumber(42_918_631n),
  conflicts: [],
} as const;
const market: MarketRecord = {
  identity: { chainId: asChainId(50_312), binaryModule, marketId },
  display: {
    asset: "ETH",
    question: "Up or down?",
    interval: "15m",
    collateralSymbol: "USDso",
    collateralDecimals: 6,
  },
  contractStatus: "resolved",
  settlementFinalized: true,
  lifecycle: "finalized",
  wiring: { status: "missing", reason: "not needed by view model" },
  settlement: {
    isResolved: true,
    isVoided: false,
    finalized: true,
    payoutVector: {
      status: "verified",
      source,
      value: {
        numerators: [asBaseUnit(0n), asBaseUnit(10_000_000n)],
        denominator: asBaseUnit(10_000_000n),
      },
    },
    backing: { status: "verified", source, value: asBaseUnit(3_670_000_000n) },
    settlementFeeBpsTimes1k: { status: "verified", source, value: asBaseUnit(0n) },
    oracle: {
      status: "verified",
      source,
      value: {
        questionId: `0x${"44".repeat(32)}`,
        openingValue: asBaseUnit(241_180n),
        closingValue: asBaseUnit(240_612n),
        valueDecimals: 2,
      },
    },
    finalizationTransaction: { status: "missing", reason: "not needed" },
    deployedEventSelector: { status: "missing", reason: "not needed" },
  },
  evidence,
};

function position(state: WalletPosition["state"], payout: bigint): WalletPosition {
  return {
    identity: `${state}:position`,
    wallet: address,
    market: market.identity,
    marketId,
    outcomeIndex: 1,
    side: "down",
    tokenId: asTokenId(1n),
    verifiedBalance: asBaseUnit(2_970_000_000n),
    state,
    expectedPayout: asBaseUnit(payout),
    evidence,
  };
}

function scan(positions: readonly WalletPosition[]): PositionScan<WalletPosition> {
  return {
    completeness: "complete",
    source: "test",
    pageCount: 1,
    rowCount: positions.length,
    uniquePositionCount: positions.length,
    startedAt: observedAt,
    completedAt: observedAt,
    evidence,
    positions,
    failures: [],
  };
}

describe("settlement inbox view model", () => {
  it("formats integer amounts and oracle decimals without floating point", () => {
    const view = buildInboxViewModel({
      address,
      scan: scan([position("claimable", 2_970_000_000n)]),
      markets: [market],
    });
    expect(view.claimable).toBe("2,970.00 USDso");
    expect(view.rows[0]?.reason).toBe("2,406.12 < open 2,411.80");
    expect(view.rows[0]?.position).toBe("DOWN · 2,970.00");
  });

  it("keeps ready and resolved station counts separate", () => {
    const view = buildInboxViewModel({
      address,
      scan: scan([position("claimable", 2_970_000_000n), position("losing", 0n)]),
      markets: [market],
    });
    expect(view.counts).toEqual({ open: 0, locked: 0, resolved: 1, ready: 1 });
    expect(view.rows[0]?.filter).toContain("claimable");
    expect(view.rows[1]?.returnTone).toBe("loss");
  });
});
