import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asChainId,
  asMarketId,
  asTimestampMs,
  asTokenId,
  asTransactionHash,
  type MarketRecord,
  type SettlementExplanationInput,
} from "@claimrail/core";

const observedAt = asTimestampMs(Date.parse("2026-09-03T16:00:00.000Z"));
const source = { name: "fixture", observedAt, blockNumber: asBlockNumber(42_918_631n) };
const marketId = asMarketId(`0x${"12".repeat(32)}`);
const binaryModule = asAddress("0x3ecc694cef705358864a646142ac17a90e29e388");
const finalizationTx = asTransactionHash(`0x${"b7".repeat(32)}`);

export const fixtureMarket: MarketRecord = {
  identity: { chainId: asChainId(50312), binaryModule, marketId },
  display: {
    asset: "ETH",
    question: "Will ETH close above its opening price?",
    interval: "15m",
    collateralSymbol: "USDso",
    collateralDecimals: 6,
  },
  contractStatus: "resolved",
  settlementFinalized: true,
  lifecycle: "finalized",
  wiring: {
    status: "verified",
    source,
    value: {
      marketAddress: asAddress("0x1e66d219ed22cc650e513f47111e0848cb497714"),
      pool: asAddress("0x383c5fc76e6b022fe28fabb3c95d186ad9b19ec5"),
      marketNonce: 490n,
      outcomeToken: asAddress("0xb52c5934113af5c0bb20eb3c72290c8215f755b9"),
      collateral: asAddress("0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e"),
      tokenIds: [asTokenId(100n), asTokenId(101n)],
    },
  },
  settlement: {
    isResolved: true,
    isVoided: false,
    finalized: true,
    payoutVector: {
      status: "verified",
      source,
      value: {
        numerators: [asBaseUnit(10_000_000n), asBaseUnit(0n)],
        denominator: asBaseUnit(10_000_000n),
      },
    },
    backing: { status: "verified", source, value: asBaseUnit(3_670_000_000n) },
    settlementFeeBpsTimes1k: { status: "verified", source, value: asBaseUnit(0n) },
    oracle: {
      status: "verified",
      source,
      value: {
        questionId: `0x${"ab".repeat(32)}`,
        openingValue: asBaseUnit(241_180n),
        closingValue: asBaseUnit(240_612n),
        valueDecimals: 2,
      },
    },
    finalizationTransaction: { status: "verified", source, value: finalizationTx },
    deployedEventSelector: { status: "verified", source, value: `0x${"cd".repeat(32)}` },
  },
  evidence: {
    version: "claimrail-dreamdex-reconciliation/v1",
    freshness: "fresh",
    observedAt,
    verifiedBlock: asBlockNumber(42_918_631n),
    conflicts: [],
  },
};

export const fixtureExplanation: SettlementExplanationInput = {
  marketQuestion: fixtureMarket.display.question,
  rule: "Down wins when the closing oracle price is below the opening price.",
  contractStatus: "resolved",
  settlementFinalized: true,
  openingValue: { status: "verified", source, value: asBaseUnit(241_180n) },
  closingValue: { status: "verified", source, value: asBaseUnit(240_612n) },
  valueDecimals: 2,
  winningOutcome: { status: "verified", source, value: 1 },
  voidReason: { status: "missing", reason: "market was not voided" },
  payoutVector: fixtureMarket.settlement.payoutVector,
  oracleQuestionId: { status: "verified", source, value: `0x${"ab".repeat(32)}` },
  resolutionTransaction: {
    status: "verified",
    source,
    value: asTransactionHash(`0x${"8f".repeat(32)}`),
  },
  finalizationTransaction: fixtureMarket.settlement.finalizationTransaction,
};
