import type { EvidenceFreshness, ScanCompleteness } from "../evidence/types.js";
import type {
  Address,
  BaseUnit,
  BlockNumber,
  ChainId,
  IntegrityHash,
  MarketId,
  TimestampMs,
  TokenId,
  TransactionHash,
  VenueId,
} from "../identity/types.js";
import type { ContractStatus, MarketIdentity, PayoutVectorRecord } from "../markets/types.js";
import type { OutcomeIndex } from "../positions/types.js";

export type ClaimExclusionReason =
  | "identity_mismatch"
  | "already_redeemed"
  | "stale_evidence"
  | "evidence_conflict"
  | "non_terminal"
  | "non_finalized"
  | "zero_balance"
  | "zero_amount"
  | "invalid_payout_vector"
  | "zero_payout"
  | "insufficient_backing"
  | "duplicate_over_balance";

export interface ClaimCandidate {
  readonly candidateId: string;
  readonly market: MarketIdentity;
  readonly owner: Address;
  readonly venueId: VenueId;
  readonly operatorId: number;
  readonly outcomeIndex: OutcomeIndex;
  readonly tokenId: TokenId;
  readonly outcomeToken: Address;
  readonly amount: BaseUnit;
  readonly verifiedBalance: BaseUnit;
  readonly pool: Address;
  readonly marketNonce: bigint;
  readonly collateral: Address;
  readonly contractStatus: ContractStatus;
  readonly isResolved: boolean;
  readonly isVoided: boolean;
  readonly settlementFinalized: boolean;
  readonly settlementBacking: BaseUnit;
  readonly payoutVector: PayoutVectorRecord;
  readonly settlementFeeBpsTimes1k: BaseUnit;
  readonly alreadyRedeemed: boolean;
  readonly freshness: EvidenceFreshness;
  readonly conflicts: readonly string[];
  readonly evidenceVersion: string;
}

export interface ClaimEntry {
  readonly positionIdentity: string;
  readonly marketId: MarketId;
  readonly outcomeIndex: OutcomeIndex;
  readonly tokenId: TokenId;
  readonly amount: BaseUnit;
  readonly verifiedBalance: BaseUnit;
  readonly pool: Address;
  readonly marketNonce: bigint;
  readonly collateral: Address;
  readonly settlementBacking: BaseUnit;
  readonly payoutNumerator: BaseUnit;
  readonly payoutDenominator: BaseUnit;
  readonly settlementFeeBpsTimes1k: BaseUnit;
  readonly expectedPayout: BaseUnit;
  readonly evidenceVersion: string;
  readonly candidateIds: readonly string[];
}

export interface ClaimExclusion {
  readonly candidateIds: readonly string[];
  readonly positionIdentity?: string;
  readonly marketId: MarketId;
  readonly outcomeIndex: OutcomeIndex;
  readonly reason: ClaimExclusionReason;
  readonly detail: string;
}

export interface ClaimBatchPolicy {
  readonly maxEntries: number;
  readonly name: string;
  readonly evidenceReference: string;
}

export interface ClaimBatch {
  readonly index: number;
  readonly entries: readonly ClaimEntry[];
  readonly expectedPayout: BaseUnit;
}

export interface ClaimPlanDraft {
  readonly schemaVersion: "1";
  readonly chainId: ChainId;
  readonly binaryModule: Address;
  readonly outcomeToken: Address;
  readonly venueId: VenueId;
  readonly operatorId: number;
  readonly owner: Address;
  readonly recipient: Address;
  readonly approval: {
    readonly required: boolean;
    readonly scope: "module-wide";
    readonly operator: Address;
  };
  readonly entries: readonly ClaimEntry[];
  readonly batches: readonly ClaimBatch[];
  readonly exclusions: readonly ClaimExclusion[];
  readonly expectedPayout: BaseUnit;
  readonly discoveryCompleteness: ScanCompleteness;
  readonly verifiedBlock: BlockNumber;
  readonly createdAt: TimestampMs;
  readonly expiresAt: TimestampMs;
  readonly batchPolicy: ClaimBatchPolicy;
}

export type ClaimSimulation =
  | {
      readonly status: "passed";
      readonly batchIndex: number;
      readonly gasEstimate: bigint;
      readonly verifiedBlock: BlockNumber;
    }
  | {
      readonly status: "failed";
      readonly batchIndex: number;
      readonly reason: string;
      readonly verifiedBlock: BlockNumber;
    };

export interface ClaimPlan extends ClaimPlanDraft {
  readonly simulations: readonly ClaimSimulation[];
  readonly integrityHash: IntegrityHash;
}

export type ClaimReceiptStatus = "pending" | "confirmed" | "failed" | "superseded";

export interface ClaimReceiptEntry {
  readonly marketId: MarketId;
  readonly outcomeIndex: OutcomeIndex;
  readonly tokenId: TokenId;
  readonly amountBurned: BaseUnit;
  readonly expectedPayout: BaseUnit;
  readonly actualCollateral: BaseUnit;
}

export interface ClaimReceipt {
  readonly schemaVersion: "1";
  readonly planHash: IntegrityHash;
  readonly chainId: ChainId;
  readonly binaryModule: Address;
  readonly owner: Address;
  readonly recipient: Address;
  readonly transactionHash: TransactionHash;
  readonly status: ClaimReceiptStatus;
  readonly submittedAt: TimestampMs;
  readonly confirmedAt?: TimestampMs;
  readonly blockNumber?: BlockNumber;
  readonly gasUsed?: bigint;
  readonly expectedPayout: BaseUnit;
  readonly actualCollateral?: BaseUnit;
  readonly entries: readonly ClaimReceiptEntry[];
  readonly evidenceLinks: readonly string[];
}

export interface PrepareClaimPlanInput {
  readonly chainId: ChainId;
  readonly binaryModule: Address;
  readonly outcomeToken: Address;
  readonly venueId: VenueId;
  readonly operatorId: number;
  readonly owner: Address;
  readonly recipient: Address;
  readonly operatorApproved: boolean;
  readonly candidates: readonly ClaimCandidate[];
  readonly discoveryCompleteness: ScanCompleteness;
  readonly verifiedBlock: BlockNumber;
  readonly now: TimestampMs;
  readonly ttlMs: number;
  readonly batchPolicy: ClaimBatchPolicy;
}

export interface FinalizeClaimPlanInput {
  readonly draft: ClaimPlanDraft;
  readonly simulations: readonly ClaimSimulation[];
}

export interface ClaimPlanValidationInput {
  readonly plan: ClaimPlan;
  readonly now: TimestampMs;
  readonly connectedWallet: Address;
  readonly minimumVerifiedBlock?: BlockNumber;
}

export interface ClaimPlanValidation {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}
