import type { BaseUnit } from "../identity/types.js";
import type { ContractStatus, MarketIdentity } from "../markets/types.js";
import type { OutcomeIndex, OutcomeSide, WalletPositionState } from "./types.js";

export interface WalletPositionStateInput {
  readonly contractStatus: ContractStatus;
  readonly settlementFinalized: boolean;
  readonly isResolved: boolean;
  readonly isVoided: boolean;
  readonly verifiedBalance: BaseUnit;
  readonly payoutNumerator: BaseUnit;
  readonly claimStatus?: "none" | "submitted" | "confirmed";
  readonly payoutOwed?: BaseUnit;
}

export function outcomeSide(outcomeIndex: OutcomeIndex): OutcomeSide {
  return outcomeIndex === 0 ? "up" : "down";
}

export function positionIdentity(
  market: MarketIdentity,
  wallet: string,
  outcomeIndex: OutcomeIndex,
): string {
  return [
    market.chainId.toString(),
    market.binaryModule.toLowerCase(),
    market.marketId.toLowerCase(),
    wallet.toLowerCase(),
    outcomeIndex.toString(),
  ].join(":");
}

export function deriveWalletPositionState(input: WalletPositionStateInput): WalletPositionState {
  if ((input.payoutOwed ?? 0n) > 0n) {
    return "payout_owed";
  }
  if (input.claimStatus === "confirmed") {
    return "redeemed";
  }
  if (input.claimStatus === "submitted") {
    return "claim_submitted";
  }

  if (input.contractStatus === "listed" || input.contractStatus === "trading") {
    return "open";
  }
  if (input.contractStatus === "locked" || input.contractStatus === "settling") {
    return "locked";
  }

  const terminal = input.isResolved || input.isVoided;
  if (!terminal) {
    return "locked";
  }
  if (input.payoutNumerator === 0n) {
    return "losing";
  }
  if (!input.settlementFinalized) {
    return "winning_unfinalized";
  }
  return input.isVoided ? "void_refundable" : "claimable";
}
