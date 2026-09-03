import type { BlockNumber, TimestampMs, TransactionHash } from "../identity/types.js";

export type EvidenceStatus = "missing" | "pending" | "verified" | "conflicting";
export type EvidenceFreshness = "fresh" | "stale" | "unknown";
export type ScanCompleteness = "complete" | "partial" | "failed";

export interface EvidenceSource {
  readonly name: string;
  readonly reference?: string;
  readonly observedAt: TimestampMs;
  readonly blockNumber?: BlockNumber;
  readonly transactionHash?: TransactionHash;
}

export interface EvidenceObservation<Value> {
  readonly value: Value;
  readonly source: EvidenceSource;
}

export type EvidenceValue<Value> =
  | { readonly status: "missing"; readonly reason: string }
  | {
      readonly status: "pending";
      readonly reason: string;
      readonly source?: EvidenceSource;
    }
  | {
      readonly status: "verified";
      readonly value: Value;
      readonly source: EvidenceSource;
    }
  | {
      readonly status: "conflicting";
      readonly observations: readonly EvidenceObservation<Value>[];
      readonly reason: string;
    };

export interface EvidenceConflict {
  readonly field: string;
  readonly reason: string;
  readonly sources: readonly string[];
}

export interface EvidenceSummary {
  readonly version: string;
  readonly freshness: EvidenceFreshness;
  readonly observedAt: TimestampMs;
  readonly verifiedBlock?: BlockNumber;
  readonly conflicts: readonly EvidenceConflict[];
}

export interface ScanFailure {
  readonly source: string;
  readonly page?: number;
  readonly reason: string;
}

export interface PositionScan<Position> {
  readonly completeness: ScanCompleteness;
  readonly source: string;
  readonly pageCount: number;
  readonly rowCount: number;
  readonly uniquePositionCount: number;
  readonly startedAt: TimestampMs;
  readonly completedAt: TimestampMs;
  readonly evidence: EvidenceSummary;
  readonly positions: readonly Position[];
  readonly failures: readonly ScanFailure[];
}
