import type {
  CanonicalEventType,
  ContractStatus,
  MarketLifecycle,
  ScanCompleteness,
  WalletPositionState,
} from "@claimrail/core";

export interface DeploymentWrite {
  readonly key: string;
  readonly chainId: number;
  readonly adapterVersion: string;
  readonly name: string;
  readonly binaryModule: string;
  readonly binarySettlement: string;
  readonly configuration: Record<string, unknown>;
}

export interface MarketWrite {
  readonly identity: string;
  readonly marketId: string;
  readonly binaryModule: string;
  readonly pool: string;
  readonly marketNonce: bigint;
  readonly marketAddress: string;
  readonly outcomeToken: string;
  readonly collateral: string;
  readonly contractStatus: ContractStatus;
  readonly settlementFinalized: boolean;
  readonly lifecycle: MarketLifecycle;
  readonly evidenceVersion: string;
  readonly canonical: Record<string, unknown>;
  readonly verifiedBlock?: bigint;
  readonly observedAt: Date;
  readonly observation: {
    readonly source: string;
    readonly sourceId: string;
    readonly transactionHash?: string;
    readonly payload: Record<string, unknown>;
  };
  readonly settlement: {
    readonly status: "missing" | "pending" | "verified" | "conflicting";
    readonly finalized: boolean;
    readonly voided: boolean;
    readonly backing: bigint;
    readonly settlementFeeBpsTimes1k: bigint;
    readonly payoutNumerators: readonly string[];
    readonly payoutDenominator: bigint;
    readonly finalizationTransaction?: string;
    readonly evidence: Record<string, unknown>;
  };
}

export interface PositionWrite {
  readonly identity: string;
  readonly outcomeIndex: 0 | 1;
  readonly tokenId: bigint;
  readonly verifiedBalance: bigint;
  readonly state: WalletPositionState;
  readonly expectedPayout: bigint;
  readonly evidenceVersion: string;
  readonly evidence: Record<string, unknown>;
  readonly verifiedBlock?: bigint;
  readonly observedAt: Date;
  readonly observation: {
    readonly source: string;
    readonly sourceId: string;
    readonly payload: Record<string, unknown>;
  };
}

export interface ScanWrite {
  readonly sourceRunId: string;
  readonly completeness: ScanCompleteness;
  readonly source: string;
  readonly pageCount: number;
  readonly rowCount: number;
  readonly uniquePositionCount: number;
  readonly nextOffset?: number;
  readonly failureDetails: readonly unknown[];
  readonly startedAt: Date;
  readonly completedAt: Date;
}

export interface CanonicalTransitionWrite {
  readonly eventId: string;
  readonly eventType: CanonicalEventType;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly schemaVersion: string;
  readonly payload: Record<string, unknown>;
  readonly sourceTransactionHash?: string;
  readonly sourceLogIndex?: number;
  readonly blockNumber?: bigint;
  readonly occurredAt: Date;
  readonly outboxTopic: string;
  readonly outboxMaxAttempts?: number;
}

export interface PersistWalletTransitionInput {
  readonly deployment: DeploymentWrite;
  readonly walletAddress: string;
  readonly scan: ScanWrite;
  readonly market: MarketWrite;
  readonly position: PositionWrite;
  readonly transition: CanonicalTransitionWrite;
}
