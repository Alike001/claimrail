import type {
  Address,
  BaseUnit,
  ChainId,
  IntegrityHash,
  MarketId,
  TimestampMs,
  TransactionHash,
} from "../identity/types.js";
import type { OutcomeIndex } from "../positions/types.js";

export type CanonicalEventType =
  | "market.locked"
  | "market.resolved"
  | "market.finalized"
  | "market.voided"
  | "wallet.claimable"
  | "wallet.payout_owed"
  | "claim.plan_created"
  | "claim.submitted"
  | "claim.confirmed"
  | "claim.failed"
  | "claim.superseded";

export interface CanonicalAmount {
  readonly raw: BaseUnit;
  readonly decimals: number;
  readonly symbol: string;
}

export interface CanonicalEventEnvelope<Payload = unknown> {
  readonly id: IntegrityHash;
  readonly schemaVersion: "1";
  readonly type: CanonicalEventType;
  readonly createdAt: TimestampMs;
  readonly chainId: ChainId;
  readonly stateVersion: string;
  readonly wallet?: Address;
  readonly marketId?: MarketId;
  readonly outcomeIndex?: OutcomeIndex;
  readonly transactionHash?: TransactionHash;
  readonly amount?: CanonicalAmount;
  readonly evidenceLinks: readonly string[];
  readonly payload: Payload;
}

export type CanonicalEventInput<Payload> = Omit<CanonicalEventEnvelope<Payload>, "id">;
