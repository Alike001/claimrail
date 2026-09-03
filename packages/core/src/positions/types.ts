import type { EvidenceSummary, ScanCompleteness } from "../evidence/types.js";
import type { Address, BaseUnit, MarketId, TokenId } from "../identity/types.js";
import type { MarketIdentity } from "../markets/types.js";

export type OutcomeIndex = 0 | 1;
export type OutcomeSide = "up" | "down";

export type WalletPositionState =
  | "open"
  | "locked"
  | "winning_unfinalized"
  | "claimable"
  | "losing"
  | "void_refundable"
  | "claim_submitted"
  | "redeemed"
  | "payout_owed";

export type CostHistoryCompleteness = ScanCompleteness;

export interface CostBasis {
  readonly rawCost: BaseUnit;
  readonly collateralDecimals: number;
  readonly completeness: CostHistoryCompleteness;
}

export interface WalletPosition {
  readonly identity: string;
  readonly wallet: Address;
  readonly market: MarketIdentity;
  readonly marketId: MarketId;
  readonly outcomeIndex: OutcomeIndex;
  readonly side: OutcomeSide;
  readonly tokenId: TokenId;
  readonly verifiedBalance: BaseUnit;
  readonly state: WalletPositionState;
  readonly expectedPayout: BaseUnit;
  readonly costBasis?: CostBasis;
  readonly evidence: EvidenceSummary;
}
