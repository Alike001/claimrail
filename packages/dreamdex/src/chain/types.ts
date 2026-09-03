import type {
  BinaryMarket,
  BinaryMarketFilter,
  FillRow,
  FillsOptions,
  MarketFees,
  MarketOnchain,
  MarketResolutionEvent,
  MarketStatusUpdate,
  OnchainResolutionPrice,
  OracleAnswer,
  RouterActionRecord,
  RouterActionsOptions,
} from "@somnia-chain/markets-sdk";
import type { Address, Hex } from "viem";

export interface IndexedResolution {
  readonly events: readonly MarketResolutionEvent[];
  readonly reference: {
    readonly id: string;
    readonly market: string;
    readonly oracleQuestionId: string;
    readonly pending: boolean;
  } | null;
  readonly closingAnswer: OracleAnswer | null;
  readonly openingAnswer: OracleAnswer | null;
}

export interface SettlementRecord {
  readonly collateralToken: Address;
  readonly backing: bigint;
  readonly finalized: boolean;
  readonly voided: boolean;
  readonly settlementFeeBpsTimes1k: bigint;
  readonly feeRecipient: Address;
  readonly pool: Address;
  readonly nonce: bigint;
  readonly payoutNumerators: readonly bigint[];
}

export interface FinalizationEvent {
  readonly marketKey: bigint;
  readonly pool: Address;
  readonly nonce: bigint;
  readonly collateralToken: Address;
  readonly netBacking: bigint;
  readonly voided: boolean;
  readonly payoutNumerators: readonly bigint[];
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
}

export interface ChainHead {
  readonly blockNumber: bigint;
  readonly timestamp: bigint;
}

export interface FinalizationEventQuery {
  readonly marketKey: bigint;
  readonly pool: Address;
  readonly fromBlock: bigint;
  readonly toBlock?: bigint;
}

/** The complete read-only seam ClaimRail needs from DreamDEX and Somnia. */
export interface DreamDexReadGateway {
  listBinaryMarkets(
    options?: BinaryMarketFilter & { limit?: number },
  ): Promise<readonly BinaryMarket[]>;
  getBinaryMarket(marketId: string): Promise<BinaryMarket | null>;
  getMarketOnchain(marketId: Hex): Promise<MarketOnchain>;
  getMarketResolution(marketId: string): Promise<IndexedResolution>;
  getMarketStatusHistory(marketId: string): Promise<readonly MarketStatusUpdate[]>;
  getMarketFees(marketId: string): Promise<MarketFees | null>;
  getOnchainResolutionPrice(marketId: Hex): Promise<OnchainResolutionPrice | null>;
  getPayoutNumerators(marketAddress: Address): Promise<readonly bigint[]>;
  getSettlement(marketKey: bigint): Promise<SettlementRecord>;
  getOutcomeBalance(outcomeToken: Address, account: Address, tokenId: bigint): Promise<bigint>;
  isOperator(outcomeToken: Address, owner: Address, operator: Address): Promise<boolean>;
  getFinalizationEvent(query: FinalizationEventQuery): Promise<FinalizationEvent | null>;
  getHead(): Promise<ChainHead>;
  getRouterActions(
    account: string,
    options?: RouterActionsOptions,
  ): Promise<readonly RouterActionRecord[]>;
  getFills(pool: string, options?: FillsOptions): Promise<readonly FillRow[]>;
  close?(): Promise<void>;
}

export interface MarketReadBundle {
  readonly indexed: BinaryMarket;
  readonly onchain: MarketOnchain;
  readonly directPayoutNumerators: readonly bigint[];
  readonly settlement: SettlementRecord;
  readonly resolution: IndexedResolution;
  readonly statusHistory: readonly MarketStatusUpdate[];
  readonly fees: MarketFees | null;
  readonly onchainResolutionPrice: OnchainResolutionPrice | null;
  readonly finalizationEvent: FinalizationEvent | null;
  readonly head: ChainHead;
}

export interface RedeemManyCall {
  readonly owner: Address;
  readonly operatorId: number;
  readonly venueId: Hex;
  readonly marketIds: readonly Hex[];
  readonly outcomeIndexes: readonly (0 | 1)[];
  readonly amounts: readonly bigint[];
}

export interface RedeemManySimulation {
  readonly gasEstimate: bigint;
  readonly verifiedBlock: bigint;
}

export interface DreamDexClaimGateway extends DreamDexReadGateway {
  simulateRedeemMany(call: RedeemManyCall): Promise<RedeemManySimulation>;
}

export interface TransactionReceiptLogSnapshot {
  readonly address: Address;
  readonly data: Hex;
  readonly topics: readonly Hex[];
  readonly logIndex: number;
}

export interface TransactionReceiptSnapshot {
  readonly status: "success" | "reverted";
  readonly blockNumber: bigint;
  readonly gasUsed: bigint;
  readonly logs: readonly TransactionReceiptLogSnapshot[];
}

export interface DreamDexReceiptGateway extends DreamDexReadGateway {
  getTransactionReceiptSnapshot(transactionHash: Hex): Promise<TransactionReceiptSnapshot | null>;
  getMissingTransactionStatus(
    transactionHash: Hex,
    owner: Address,
    nonce: bigint,
  ): Promise<"pending" | "superseded">;
  getOutcomeBalanceAtBlock(
    outcomeToken: Address,
    account: Address,
    tokenId: bigint,
    blockNumber: bigint,
  ): Promise<bigint>;
  getSettlementAtBlock(marketKey: bigint, blockNumber: bigint): Promise<SettlementRecord>;
  getBlockTimestamp(blockNumber: bigint): Promise<bigint>;
  getOwed(owner: Address, token: Address): Promise<bigint>;
}
