import { decodeClaimPlan } from "@claimrail/contracts";
import type { ClaimRepository } from "@claimrail/db";
import {
  reconcileClaimReceipt,
  type DreamDexDeployment,
  type DreamDexReceiptGateway,
} from "@claimrail/dreamdex";
import type { Hex } from "viem";
import { idleJob, type WorkerJob } from "../runtime.js";

export interface ClaimReceiptJobOptions {
  readonly repository: Pick<
    ClaimRepository,
    "leasePendingTransaction" | "deferReconciliation" | "completeReconciliation"
  >;
  readonly deployment: DreamDexDeployment;
  readonly gateway: DreamDexReceiptGateway;
  readonly workerId: string;
  readonly leaseMs: number;
}

export function createClaimReceiptJob(options?: ClaimReceiptJobOptions): WorkerJob {
  if (options === undefined) return idleJob("claim receipt reconciliation is not configured");
  return async () => {
    const leased = await options.repository.leasePendingTransaction({
      workerId: options.workerId,
      leaseMs: options.leaseMs,
    });
    if (leased === null) return { status: "idle", detail: "no pending claim receipt" };

    try {
      const plan = decodeClaimPlan(leased.plan);
      const result = await reconcileClaimReceipt({
        deployment: options.deployment,
        gateway: options.gateway,
        plan,
        batchIndex: leased.batchIndex,
        transactionHash: leased.transactionHash as Hex,
        ...(leased.nonce === null ? {} : { transactionNonce: leased.nonce }),
        submittedAt: leased.submittedAt.getTime(),
      });
      if (result.status === "pending") {
        const deferred = await options.repository.deferReconciliation({
          transactionId: leased.id,
          workerId: options.workerId,
          reason: result.reason,
        });
        if (!deferred) throw new Error("claim receipt lease was lost before retry scheduling");
        return { status: "worked", detail: "claim receipt remains pending", count: 1 };
      }
      if (result.status === "failed") {
        const completed = await options.repository.completeReconciliation({
          transactionId: leased.id,
          workerId: options.workerId,
          status: "failed",
          ...(result.blockNumber === undefined ? {} : { blockNumber: result.blockNumber }),
          ...(result.gasUsed === undefined ? {} : { gasUsed: result.gasUsed }),
          receipt: {
            schemaVersion: "1",
            planHash: plan.integrityHash,
            chainId: plan.chainId,
            owner: plan.owner,
            recipient: plan.recipient,
            transactionHash: leased.transactionHash,
            status: "failed",
            submittedAt: leased.submittedAt.getTime(),
            reason: result.reason,
            ...(result.blockNumber === undefined ? {} : { blockNumber: result.blockNumber }),
            ...(result.gasUsed === undefined ? {} : { gasUsed: result.gasUsed }),
          },
          fallbackOwed: 0n,
        });
        if (!completed) throw new Error("claim receipt lease was lost before failure recording");
        return { status: "worked", detail: "claim receipt failed verification", count: 1 };
      }
      if (result.status === "superseded") {
        const completed = await options.repository.completeReconciliation({
          transactionId: leased.id,
          workerId: options.workerId,
          status: "superseded",
          receipt: {
            schemaVersion: "1",
            planHash: plan.integrityHash,
            chainId: plan.chainId,
            owner: plan.owner,
            recipient: plan.recipient,
            transactionHash: leased.transactionHash,
            status: "superseded",
            submittedAt: leased.submittedAt.getTime(),
            reason: result.reason,
          },
          fallbackOwed: 0n,
        });
        if (!completed) {
          throw new Error("claim receipt lease was lost before replacement recording");
        }
        return { status: "worked", detail: "claim transaction was superseded", count: 1 };
      }
      if (
        result.receipt.blockNumber === undefined ||
        result.receipt.gasUsed === undefined ||
        result.receipt.actualCollateral === undefined
      ) {
        throw new Error("confirmed receipt is missing terminal chain evidence");
      }
      const completed = await options.repository.completeReconciliation({
        transactionId: leased.id,
        workerId: options.workerId,
        status: "confirmed",
        blockNumber: result.receipt.blockNumber,
        gasUsed: result.receipt.gasUsed,
        actualCollateral: result.receipt.actualCollateral,
        receipt: {
          ...result.receipt,
          verification: {
            postBalances: result.postBalances,
            postSettlementBacking: result.postSettlementBacking,
          },
        },
        fallbackOwed: result.fallbackOwed,
      });
      if (!completed) throw new Error("claim receipt lease was lost before confirmation recording");
      return { status: "worked", detail: "claim receipt confirmed", count: 1 };
    } catch (error) {
      await options.repository.deferReconciliation({
        transactionId: leased.id,
        workerId: options.workerId,
        reason: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  };
}
