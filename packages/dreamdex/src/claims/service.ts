import {
  SHANNON_REDEEM_MANY_BATCH_POLICY,
  asAddress,
  asBlockNumber,
  asChainId,
  asTimestampMs,
  finalizeClaimPlan,
  prepareClaimPlan,
  type ClaimPlan,
  type ClaimPlanDraft,
  type ClaimSimulation,
} from "@claimrail/core";
import { getAddress, type Hex } from "viem";
import type { DreamDexClaimGateway } from "../chain/types.js";
import type { DreamDexDeployment } from "../config/deployments.js";
import { ClaimRailReadService, type ReadWalletOptions } from "../services/claimrail.js";

export const DEFAULT_CLAIM_PLAN_TTL_MS = 90_000;
export const MAX_REDEEM_MANY_GAS = 50_000_000n;

export type PreparedClaimResult =
  | { readonly status: "approval_required"; readonly draft: ClaimPlanDraft }
  | { readonly status: "ready"; readonly plan: ClaimPlan };

export interface ClaimRailClaimServiceOptions {
  readonly deployment: DreamDexDeployment;
  readonly gateway: DreamDexClaimGateway;
  readonly readService?: ClaimRailReadService;
  readonly now?: () => number;
  readonly ttlMs?: number;
}

/**
 * Turns a complete, freshly verified wallet scan into exact redeemMany calldata.
 * This service never receives a signer and never broadcasts a transaction.
 */
export class ClaimRailClaimService {
  private readonly readService: ClaimRailReadService;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(private readonly options: ClaimRailClaimServiceOptions) {
    this.readService =
      options.readService ??
      new ClaimRailReadService({
        deployment: options.deployment,
        gateway: options.gateway,
      });
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? DEFAULT_CLAIM_PLAN_TTL_MS;
  }

  async prepare(owner: string, readOptions: ReadWalletOptions = {}): Promise<PreparedClaimResult> {
    const normalizedOwner = getAddress(owner);
    const wallet = await this.readService.readWallet(normalizedOwner, readOptions);
    if (wallet.positions.completeness !== "complete") {
      throw new Error("claim preparation requires a complete wallet scan");
    }
    if (wallet.positions.evidence.freshness !== "fresh") {
      throw new Error("claim preparation requires fresh position evidence");
    }
    const verifiedBlock = wallet.positions.evidence.verifiedBlock;
    if (verifiedBlock === undefined) {
      throw new Error("claim preparation requires a verified block");
    }
    if (wallet.operatorApproved === null) {
      throw new Error("outcome-token operator approval could not be verified");
    }
    const first = wallet.claimCandidates[0];
    if (first === undefined) throw new Error("wallet has no verified claimable positions");

    const draft = prepareClaimPlan({
      chainId: asChainId(this.options.deployment.chain.id),
      binaryModule: asAddress(this.options.deployment.addresses.binaryModule),
      outcomeToken: first.outcomeToken,
      venueId: first.venueId,
      operatorId: first.operatorId,
      owner: asAddress(normalizedOwner),
      recipient: asAddress(normalizedOwner),
      operatorApproved: wallet.operatorApproved,
      candidates: wallet.claimAssessments,
      discoveryCompleteness: wallet.positions.completeness,
      verifiedBlock,
      now: asTimestampMs(this.now()),
      ttlMs: this.ttlMs,
      batchPolicy: SHANNON_REDEEM_MANY_BATCH_POLICY,
    });
    if (draft.entries.length === 0) {
      throw new Error("no candidate passed ClaimRail safety checks");
    }
    if (draft.approval.required) return { status: "approval_required", draft };

    const simulations: ClaimSimulation[] = [];
    for (const batch of draft.batches) {
      const result = await this.options.gateway.simulateRedeemMany({
        owner: normalizedOwner,
        operatorId: draft.operatorId,
        venueId: draft.venueId as Hex,
        marketIds: batch.entries.map(({ marketId }) => marketId as Hex),
        outcomeIndexes: batch.entries.map(({ outcomeIndex }) => outcomeIndex),
        amounts: batch.entries.map(({ amount }) => amount),
      });
      if (result.gasEstimate > MAX_REDEEM_MANY_GAS) {
        throw new Error(
          `claim batch ${batch.index} exceeds the ${MAX_REDEEM_MANY_GAS} gas safety limit`,
        );
      }
      simulations.push({
        status: "passed",
        batchIndex: batch.index,
        gasEstimate: result.gasEstimate,
        verifiedBlock: asBlockNumber(result.verifiedBlock),
      });
    }
    return { status: "ready", plan: await finalizeClaimPlan({ draft, simulations }) };
  }
}
