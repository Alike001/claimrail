import type {
  BinaryMarket,
  MarketOnchain,
  MarketStatusUpdate,
  OnchainResolutionPrice,
} from "@somnia-chain/markets-sdk";
import type { Hex } from "viem";
import finalizedJson from "../../../../fixtures/dreamdex/live/shannon-50312/finalized-market.json" with { type: "json" };
import type { FinalizationEvent, IndexedResolution, MarketReadBundle } from "../chain/types.js";

export const FINALIZED_MARKET_ID =
  "0x0000000000000000000000000000000000000000000000000000000000012222" as const;

interface StringMarketOnchain extends Omit<
  MarketOnchain,
  "yesId" | "noId" | "nonce" | "backing" | "expiry"
> {
  readonly yesId: string;
  readonly noId: string;
  readonly nonce: string;
  readonly backing: string;
  readonly expiry: string;
}

interface StringSettlement {
  readonly collateralToken: `0x${string}`;
  readonly backing: string;
  readonly finalized: boolean;
  readonly voided: boolean;
  readonly settlementFeeBpsTimes1k: string;
  readonly feeRecipient: `0x${string}`;
  readonly pool: `0x${string}`;
  readonly nonce: string;
  readonly payoutNumerators: readonly string[];
}

interface StringFinalizationEvent {
  readonly args: {
    readonly marketKey: string;
    readonly pool: `0x${string}`;
    readonly nonce: string;
    readonly collateralToken: `0x${string}`;
    readonly netBacking: string;
    readonly voided: boolean;
    readonly payoutNumerators: readonly string[];
  };
  readonly transactionHash: Hex;
  readonly blockNumber: string;
}

interface FinalizedFixtureEntry {
  readonly indexed: BinaryMarket;
  readonly onchain: StringMarketOnchain;
  readonly rawMarket: { readonly value: { readonly payoutNumerators: readonly string[] } };
  readonly settlementRecord: { readonly value: StringSettlement };
  readonly resolution: { readonly value: IndexedResolution };
  readonly statusHistory: { readonly value: readonly MarketStatusUpdate[] };
  readonly onchainResolutionPrice: { readonly value: OnchainResolutionPrice | null };
  readonly events: {
    readonly settlement: {
      readonly MarketFinalized: { readonly value: readonly StringFinalizationEvent[] };
    };
  };
}

const maybeEntry = (finalizedJson as unknown as Record<string, FinalizedFixtureEntry>)[
  FINALIZED_MARKET_ID
];
if (maybeEntry === undefined) throw new Error("finalized fixture entry is missing");
const entry: FinalizedFixtureEntry = maybeEntry;

function onchainFrom(value: StringMarketOnchain): MarketOnchain {
  return {
    ...value,
    yesId: BigInt(value.yesId),
    noId: BigInt(value.noId),
    nonce: BigInt(value.nonce),
    backing: BigInt(value.backing),
    expiry: BigInt(value.expiry),
  };
}

function finalizationFrom(value: StringFinalizationEvent): FinalizationEvent {
  return {
    marketKey: BigInt(value.args.marketKey),
    pool: value.args.pool,
    nonce: BigInt(value.args.nonce),
    collateralToken: value.args.collateralToken,
    netBacking: BigInt(value.args.netBacking),
    voided: value.args.voided,
    payoutNumerators: value.args.payoutNumerators.map(BigInt),
    transactionHash: value.transactionHash,
    blockNumber: BigInt(value.blockNumber),
  };
}

export function finalizedMarketBundle(): MarketReadBundle {
  const settlement = entry.settlementRecord.value;
  const finalization = entry.events.settlement.MarketFinalized.value[0];
  if (finalization === undefined) throw new Error("finalization event is missing");
  return {
    indexed: entry.indexed,
    onchain: onchainFrom(entry.onchain),
    directPayoutNumerators: entry.rawMarket.value.payoutNumerators.map(BigInt),
    settlement: {
      ...settlement,
      backing: BigInt(settlement.backing),
      settlementFeeBpsTimes1k: BigInt(settlement.settlementFeeBpsTimes1k),
      nonce: BigInt(settlement.nonce),
      payoutNumerators: settlement.payoutNumerators.map(BigInt),
    },
    resolution: entry.resolution.value,
    statusHistory: entry.statusHistory.value,
    fees: null,
    onchainResolutionPrice: entry.onchainResolutionPrice.value,
    finalizationEvent: finalizationFrom(finalization),
    head: { blockNumber: 478_579_104n, timestamp: 1_788_431_003n },
  };
}
