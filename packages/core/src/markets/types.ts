import type { EvidenceSummary, EvidenceValue } from "../evidence/types.js";
import type {
  Address,
  BaseUnit,
  ChainId,
  MarketId,
  TokenId,
  TransactionHash,
} from "../identity/types.js";

export type ContractStatus = "listed" | "trading" | "locked" | "settling" | "resolved" | "voided";

export type MarketLifecycle = ContractStatus | "finalized";

export interface MarketIdentity {
  readonly chainId: ChainId;
  readonly binaryModule: Address;
  readonly marketId: MarketId;
}

export interface MarketDisplay {
  readonly asset: string;
  readonly question: string;
  readonly interval: string;
  readonly collateralSymbol: string;
  readonly collateralDecimals: number;
}

export interface MarketWiring {
  readonly marketAddress: Address;
  readonly pool: Address;
  readonly marketNonce: bigint;
  readonly outcomeToken: Address;
  readonly collateral: Address;
  readonly tokenIds: readonly [TokenId, TokenId];
}

export interface PayoutVectorRecord {
  readonly numerators: readonly BaseUnit[];
  readonly denominator: BaseUnit;
}

export interface OracleEvidence {
  readonly questionId: string;
  readonly openingValue?: BaseUnit;
  readonly closingValue?: BaseUnit;
  readonly valueDecimals?: number;
  readonly voidReason?: string;
  readonly explorerUrl?: string;
  readonly resolutionTransaction?: TransactionHash;
}

export interface SettlementEvidence {
  readonly isResolved: boolean;
  readonly isVoided: boolean;
  readonly finalized: boolean;
  readonly payoutVector: EvidenceValue<PayoutVectorRecord>;
  readonly backing: EvidenceValue<BaseUnit>;
  readonly settlementFeeBpsTimes1k: EvidenceValue<BaseUnit>;
  readonly oracle: EvidenceValue<OracleEvidence>;
  readonly finalizationTransaction: EvidenceValue<TransactionHash>;
  readonly deployedEventSelector: EvidenceValue<`0x${string}`>;
}

export interface MarketRecord {
  readonly identity: MarketIdentity;
  readonly display: MarketDisplay;
  readonly contractStatus: ContractStatus;
  readonly settlementFinalized: boolean;
  readonly lifecycle: MarketLifecycle;
  readonly wiring: EvidenceValue<MarketWiring>;
  readonly settlement: SettlementEvidence;
  readonly evidence: EvidenceSummary;
}
