import { asBaseUnit, asTimestampMs } from "../identity/types.js";
import { isTerminalContractStatus } from "../markets/lifecycle.js";
import { positionIdentity } from "../positions/derive.js";
import { calculatePayout, validatePayoutVector } from "../settlement/payout.js";
import { integrityHash } from "./canonical.js";
import type {
  ClaimBatch,
  ClaimCandidate,
  ClaimEntry,
  ClaimExclusion,
  ClaimExclusionReason,
  ClaimPlan,
  ClaimPlanDraft,
  ClaimPlanValidation,
  ClaimPlanValidationInput,
  ClaimSimulation,
  FinalizeClaimPlanInput,
  PrepareClaimPlanInput,
} from "./types.js";

export const SHANNON_REDEEM_MANY_BATCH_POLICY = {
  name: "shannon-readonly-simulation-v1",
  maxEntries: 100,
  evidenceReference:
    "fixtures/dreamdex/live/shannon-50312/redemption-simulations.json#duplicate_batch_100",
} as const;

interface CandidateGroup {
  readonly identity: string;
  readonly candidates: [ClaimCandidate, ...ClaimCandidate[]];
}

function compareCandidates(left: ClaimCandidate, right: ClaimCandidate): number {
  return (
    left.market.marketId.localeCompare(right.market.marketId) ||
    left.outcomeIndex - right.outcomeIndex ||
    left.candidateId.localeCompare(right.candidateId)
  );
}

function compareExclusions(left: ClaimExclusion, right: ClaimExclusion): number {
  return (
    left.marketId.localeCompare(right.marketId) ||
    left.outcomeIndex - right.outcomeIndex ||
    left.reason.localeCompare(right.reason) ||
    left.candidateIds.join(":").localeCompare(right.candidateIds.join(":"))
  );
}

function exclusion(
  candidate: ClaimCandidate,
  reason: ClaimExclusionReason,
  detail: string,
  identity: string,
): ClaimExclusion {
  const base = {
    candidateIds: [candidate.candidateId],
    marketId: candidate.market.marketId,
    outcomeIndex: candidate.outcomeIndex,
    reason,
    detail,
  } as const;
  return { ...base, positionIdentity: identity };
}

function groupExclusion(
  group: CandidateGroup,
  reason: ClaimExclusionReason,
  detail: string,
): ClaimExclusion {
  const first = group.candidates[0];
  return {
    candidateIds: group.candidates.map(({ candidateId }) => candidateId).sort(),
    positionIdentity: group.identity,
    marketId: first.market.marketId,
    outcomeIndex: first.outcomeIndex,
    reason,
    detail,
  };
}

function candidateMatchesPlan(candidate: ClaimCandidate, input: PrepareClaimPlanInput): boolean {
  return (
    candidate.market.chainId === input.chainId &&
    candidate.market.binaryModule === input.binaryModule &&
    candidate.outcomeToken === input.outcomeToken &&
    candidate.venueId === input.venueId &&
    candidate.operatorId === input.operatorId &&
    candidate.owner === input.owner
  );
}

function candidateEvidenceSignature(candidate: ClaimCandidate): string {
  return [
    candidate.verifiedBalance.toString(),
    candidate.pool,
    candidate.marketNonce.toString(),
    candidate.collateral,
    candidate.settlementBacking.toString(),
    candidate.payoutVector.denominator.toString(),
    candidate.payoutVector.numerators.join(","),
    candidate.settlementFeeBpsTimes1k.toString(),
    candidate.isVoided ? "void" : "resolved",
    candidate.evidenceVersion,
  ].join("|");
}

function createEntry(group: CandidateGroup): ClaimEntry | ClaimExclusion {
  const first = group.candidates[0];
  const evidenceSignatures = new Set(group.candidates.map(candidateEvidenceSignature));
  if (evidenceSignatures.size !== 1) {
    return groupExclusion(
      group,
      "evidence_conflict",
      "duplicate candidates disagree about verified on-chain evidence",
    );
  }

  const amount = group.candidates.reduce((sum, candidate) => sum + candidate.amount, 0n);
  if (amount > first.verifiedBalance) {
    return groupExclusion(
      group,
      "duplicate_over_balance",
      `cumulative amount ${amount} exceeds verified balance ${first.verifiedBalance}`,
    );
  }

  const payout = calculatePayout({
    amount: asBaseUnit(amount),
    outcomeIndex: first.outcomeIndex,
    payoutVector: first.payoutVector,
    settlementFeeBpsTimes1k: first.settlementFeeBpsTimes1k,
  });
  if (payout.expectedPayout === 0n) {
    return groupExclusion(group, "zero_payout", "the verified payout vector pays zero");
  }

  return {
    positionIdentity: group.identity,
    marketId: first.market.marketId,
    outcomeIndex: first.outcomeIndex,
    tokenId: first.tokenId,
    amount: asBaseUnit(amount),
    verifiedBalance: first.verifiedBalance,
    pool: first.pool,
    marketNonce: first.marketNonce,
    collateral: first.collateral,
    settlementBacking: first.settlementBacking,
    payoutNumerator: payout.payoutNumerator,
    payoutDenominator: payout.payoutDenominator,
    settlementFeeBpsTimes1k: payout.settlementFeeBpsTimes1k,
    expectedPayout: payout.expectedPayout,
    evidenceVersion: first.evidenceVersion,
    candidateIds: group.candidates.map(({ candidateId }) => candidateId).sort(),
  };
}

function isClaimEntry(value: ClaimEntry | ClaimExclusion): value is ClaimEntry {
  return "expectedPayout" in value;
}

function backingExclusion(
  entry: ClaimEntry,
  reason: "evidence_conflict" | "insufficient_backing",
  detail: string,
): ClaimExclusion {
  return {
    candidateIds: entry.candidateIds,
    positionIdentity: entry.positionIdentity,
    marketId: entry.marketId,
    outcomeIndex: entry.outcomeIndex,
    reason,
    detail,
  };
}

function reconcileSettlementBacking(entries: readonly ClaimEntry[]): {
  readonly entries: readonly ClaimEntry[];
  readonly exclusions: readonly ClaimExclusion[];
} {
  const byMarket = new Map<string, ClaimEntry[]>();
  for (const entry of entries) {
    const existing = byMarket.get(entry.marketId);
    if (existing === undefined) byMarket.set(entry.marketId, [entry]);
    else existing.push(entry);
  }

  const accepted: ClaimEntry[] = [];
  const exclusions: ClaimExclusion[] = [];
  for (const marketEntries of byMarket.values()) {
    const evidence = new Set(
      marketEntries.map((entry) =>
        [
          entry.pool,
          entry.marketNonce.toString(),
          entry.collateral,
          entry.settlementBacking.toString(),
          entry.evidenceVersion,
        ].join("|"),
      ),
    );
    if (evidence.size !== 1) {
      exclusions.push(
        ...marketEntries.map((entry) =>
          backingExclusion(
            entry,
            "evidence_conflict",
            "positions in the same market disagree about settlement backing evidence",
          ),
        ),
      );
      continue;
    }

    const backing = marketEntries[0]?.settlementBacking ?? asBaseUnit(0n);
    const totalPayout = marketEntries.reduce((sum, entry) => sum + entry.expectedPayout, 0n);
    if (totalPayout > backing) {
      exclusions.push(
        ...marketEntries.map((entry) =>
          backingExclusion(
            entry,
            "insufficient_backing",
            `market payout ${totalPayout} exceeds verified backing ${backing}`,
          ),
        ),
      );
      continue;
    }
    accepted.push(...marketEntries);
  }
  return { entries: accepted, exclusions };
}

function createBatches(entries: readonly ClaimEntry[], maximum: number): readonly ClaimBatch[] {
  const batches: ClaimBatch[] = [];
  for (let offset = 0; offset < entries.length; offset += maximum) {
    const batchEntries = entries.slice(offset, offset + maximum);
    batches.push({
      index: batches.length,
      entries: batchEntries,
      expectedPayout: asBaseUnit(
        batchEntries.reduce((sum, entry) => sum + entry.expectedPayout, 0n),
      ),
    });
  }
  return batches;
}

export function prepareClaimPlan(input: PrepareClaimPlanInput): ClaimPlanDraft {
  if (!Number.isSafeInteger(input.operatorId) || input.operatorId < 0) {
    throw new RangeError("operatorId must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0) {
    throw new RangeError("claim plan ttlMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.batchPolicy.maxEntries) || input.batchPolicy.maxEntries <= 0) {
    throw new RangeError("claim batch size must be a positive safe integer");
  }
  if (input.recipient !== input.owner) {
    throw new Error("manual claim recipient must be the owner");
  }

  const uniqueCandidates = new Map<string, ClaimCandidate>();
  for (const candidate of [...input.candidates].sort(compareCandidates)) {
    if (!uniqueCandidates.has(candidate.candidateId)) {
      uniqueCandidates.set(candidate.candidateId, candidate);
    }
  }

  const exclusions: ClaimExclusion[] = [];
  const groups = new Map<string, CandidateGroup>();

  for (const candidate of uniqueCandidates.values()) {
    const identity = positionIdentity(candidate.market, candidate.owner, candidate.outcomeIndex);
    if (!candidateMatchesPlan(candidate, input)) {
      exclusions.push(
        exclusion(
          candidate,
          "identity_mismatch",
          "candidate does not belong to this plan",
          identity,
        ),
      );
      continue;
    }
    if (candidate.alreadyRedeemed) {
      exclusions.push(
        exclusion(candidate, "already_redeemed", "position is already redeemed", identity),
      );
      continue;
    }
    if (candidate.freshness !== "fresh") {
      exclusions.push(
        exclusion(candidate, "stale_evidence", "candidate does not have fresh evidence", identity),
      );
      continue;
    }
    if (candidate.conflicts.length > 0) {
      exclusions.push(
        exclusion(candidate, "evidence_conflict", candidate.conflicts.join("; "), identity),
      );
      continue;
    }
    if (
      (candidate.isResolved && candidate.contractStatus !== "resolved") ||
      (candidate.isVoided && candidate.contractStatus !== "voided") ||
      (candidate.isResolved && candidate.isVoided)
    ) {
      exclusions.push(
        exclusion(
          candidate,
          "evidence_conflict",
          "terminal flags disagree with the contract status",
          identity,
        ),
      );
      continue;
    }
    if (
      !isTerminalContractStatus(candidate.contractStatus) ||
      (!candidate.isResolved && !candidate.isVoided)
    ) {
      exclusions.push(exclusion(candidate, "non_terminal", "market is not terminal", identity));
      continue;
    }
    if (!candidate.settlementFinalized) {
      exclusions.push(
        exclusion(candidate, "non_finalized", "permanent settlement is not finalized", identity),
      );
      continue;
    }
    if (candidate.verifiedBalance === 0n) {
      exclusions.push(exclusion(candidate, "zero_balance", "verified balance is zero", identity));
      continue;
    }
    if (candidate.amount === 0n) {
      exclusions.push(
        exclusion(candidate, "zero_amount", "requested burn amount is zero", identity),
      );
      continue;
    }
    try {
      validatePayoutVector(candidate.payoutVector);
    } catch (error) {
      exclusions.push(
        exclusion(
          candidate,
          "invalid_payout_vector",
          error instanceof Error ? error.message : "invalid payout vector",
          identity,
        ),
      );
      continue;
    }

    const existing = groups.get(identity);
    if (existing === undefined) {
      groups.set(identity, { identity, candidates: [candidate] });
    } else {
      existing.candidates.push(candidate);
    }
  }

  const entries: ClaimEntry[] = [];
  for (const group of [...groups.values()].sort((left, right) =>
    left.identity.localeCompare(right.identity),
  )) {
    const result = createEntry(group);
    if (isClaimEntry(result)) {
      entries.push(result);
    } else {
      exclusions.push(result);
    }
  }

  const backingResult = reconcileSettlementBacking(entries);
  exclusions.push(...backingResult.exclusions);
  const orderedEntries = [...backingResult.entries].sort((left, right) =>
    left.positionIdentity.localeCompare(right.positionIdentity),
  );
  const batches = createBatches(orderedEntries, input.batchPolicy.maxEntries);

  return {
    schemaVersion: "1",
    chainId: input.chainId,
    binaryModule: input.binaryModule,
    outcomeToken: input.outcomeToken,
    venueId: input.venueId,
    operatorId: input.operatorId,
    owner: input.owner,
    recipient: input.recipient,
    approval: {
      required: !input.operatorApproved,
      scope: "module-wide",
      operator: input.binaryModule,
    },
    entries: orderedEntries,
    batches,
    exclusions: exclusions.sort(compareExclusions),
    expectedPayout: asBaseUnit(
      orderedEntries.reduce((sum, entry) => sum + entry.expectedPayout, 0n),
    ),
    discoveryCompleteness: input.discoveryCompleteness,
    verifiedBlock: input.verifiedBlock,
    createdAt: input.now,
    expiresAt: asTimestampMs(input.now + input.ttlMs),
    batchPolicy: input.batchPolicy,
  };
}

function validateSimulations(draft: ClaimPlanDraft, simulations: readonly ClaimSimulation[]): void {
  if (draft.entries.length === 0) {
    throw new Error("cannot finalize an empty claim plan");
  }
  if (simulations.length !== draft.batches.length) {
    throw new Error("every claim batch must have exactly one simulation");
  }
  for (const batch of draft.batches) {
    const simulation = simulations.find(({ batchIndex }) => batchIndex === batch.index);
    if (simulation === undefined) {
      throw new Error(`claim batch ${batch.index} has no simulation`);
    }
    if (simulation.status !== "passed") {
      throw new Error(`claim batch ${batch.index} simulation failed: ${simulation.reason}`);
    }
    if (simulation.verifiedBlock < draft.verifiedBlock) {
      throw new Error(`claim batch ${batch.index} simulation is older than the plan evidence`);
    }
  }
}

export async function finalizeClaimPlan(input: FinalizeClaimPlanInput): Promise<ClaimPlan> {
  validateSimulations(input.draft, input.simulations);
  const simulations = [...input.simulations].sort(
    (left, right) => left.batchIndex - right.batchIndex,
  );
  const payload = { ...input.draft, simulations };
  return {
    ...payload,
    integrityHash: await integrityHash(payload),
  };
}

export async function validateClaimPlan(
  input: ClaimPlanValidationInput,
): Promise<ClaimPlanValidation> {
  const reasons: string[] = [];
  if (input.now >= input.plan.expiresAt) {
    reasons.push("claim plan has expired");
  }
  if (input.connectedWallet !== input.plan.owner) {
    reasons.push("connected wallet does not match the claim owner");
  }
  if (
    input.minimumVerifiedBlock !== undefined &&
    input.plan.verifiedBlock < input.minimumVerifiedBlock
  ) {
    reasons.push("claim plan was built from stale chain state");
  }

  const { integrityHash: claimedHash, ...payload } = input.plan;
  const actualHash = await integrityHash(payload);
  if (actualHash !== claimedHash) {
    reasons.push("claim plan integrity hash does not match its contents");
  }
  return { valid: reasons.length === 0, reasons };
}
