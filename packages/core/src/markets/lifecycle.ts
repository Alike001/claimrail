import type { ContractStatus, MarketLifecycle } from "./types.js";

const STATUS_BY_NUMBER = [
  "listed",
  "trading",
  "locked",
  "settling",
  "resolved",
  "voided",
] as const satisfies readonly ContractStatus[];

export interface LifecycleReconciliationInput {
  readonly contractStatus: ContractStatus;
  readonly settlementFinalized: boolean;
  readonly isResolved: boolean;
  readonly isVoided: boolean;
  readonly indexedStatus?: string;
}

export interface LifecycleReconciliation {
  readonly contractStatus: ContractStatus;
  readonly settlementFinalized: boolean;
  readonly lifecycle: MarketLifecycle;
  readonly terminal: boolean;
  readonly conflicts: readonly string[];
}

export function normalizeContractStatus(value: number | string): ContractStatus {
  if (typeof value === "number") {
    const status = STATUS_BY_NUMBER[value];
    if (status === undefined) {
      throw new RangeError(`unknown contract status: ${value}`);
    }
    return status;
  }

  const normalized = value.trim().toLowerCase();
  const numeric = Number(normalized);
  if (/^[0-5]$/.test(normalized)) {
    return normalizeContractStatus(numeric);
  }
  if ((STATUS_BY_NUMBER as readonly string[]).includes(normalized)) {
    return normalized as ContractStatus;
  }
  throw new RangeError(`unknown contract status: ${value}`);
}

export function isTerminalContractStatus(status: ContractStatus): boolean {
  return status === "resolved" || status === "voided";
}

export function deriveMarketLifecycle(
  contractStatus: ContractStatus,
  settlementFinalized: boolean,
): MarketLifecycle {
  return settlementFinalized ? "finalized" : contractStatus;
}

export function reconcileMarketLifecycle(
  input: LifecycleReconciliationInput,
): LifecycleReconciliation {
  const conflicts: string[] = [];
  const terminal = input.isResolved || input.isVoided;

  if (input.isResolved && input.isVoided) {
    conflicts.push("market cannot be resolved and voided simultaneously");
  }
  if (input.isResolved && input.contractStatus !== "resolved") {
    conflicts.push("resolved flag disagrees with contract status");
  }
  if (input.isVoided && input.contractStatus !== "voided") {
    conflicts.push("voided flag disagrees with contract status");
  }
  if (input.contractStatus === "resolved" && !input.isResolved) {
    conflicts.push("resolved contract status is missing the resolved flag");
  }
  if (input.contractStatus === "voided" && !input.isVoided) {
    conflicts.push("voided contract status is missing the voided flag");
  }
  if (input.settlementFinalized && !terminal) {
    conflicts.push("permanent settlement is finalized before a terminal market result");
  }
  if (input.indexedStatus?.trim().toLowerCase() === "finalized" && !input.settlementFinalized) {
    conflicts.push("indexer reports Finalized but permanent settlement is not finalized");
  }
  return {
    contractStatus: input.contractStatus,
    settlementFinalized: input.settlementFinalized,
    lifecycle: deriveMarketLifecycle(input.contractStatus, input.settlementFinalized),
    terminal,
    conflicts,
  };
}
