import type { ClaimPlan } from "@claimrail/core";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { ClaimRailDatabase } from "../client.js";
import { toJsonObject } from "../json.js";
import {
  auditRecords,
  canonicalEvents,
  claims,
  claimTransactions,
  deployments,
  outboxJobs,
} from "../schema/index.js";
import type { DeploymentWrite } from "./types.js";

export interface PersistClaimPlanInput {
  readonly deployment: DeploymentWrite;
  readonly plan: ClaimPlan;
}

export interface RecordClaimSubmissionInput {
  readonly deploymentKey: string;
  readonly planHash: string;
  readonly owner: string;
  readonly chainId: number;
  readonly batchIndex: number;
  readonly nonce: bigint;
  readonly transactionHash: string;
  readonly submittedAt: Date;
}

export interface ClaimSubmissionRecord {
  readonly claimId: string;
  readonly transactionHash: string;
  readonly batchIndex: number;
  readonly duplicate: boolean;
}

export interface StoredClaimPlan {
  readonly claimId: string;
  readonly status: "draft" | "ready" | "submitted" | "confirmed" | "failed" | "superseded";
  readonly plan: Record<string, unknown>;
}

export interface StoredClaimReceipt {
  readonly claimId: string;
  readonly status: "draft" | "ready" | "submitted" | "confirmed" | "failed" | "superseded";
  readonly planHash: string;
  readonly owner: string;
  readonly recipient: string;
  readonly expectedPayout: bigint;
  readonly actualCollateral: bigint | null;
  readonly gasUsed: bigint | null;
  readonly submittedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly blockNumber: bigint | null;
  readonly plan: Record<string, unknown>;
  readonly transactions: readonly {
    readonly batchIndex: number;
    readonly nonce: bigint | null;
    readonly transactionHash: string;
    readonly status: "pending" | "confirmed" | "failed" | "superseded";
    readonly attempts: number;
    readonly submittedAt: Date;
    readonly confirmedAt: Date | null;
    readonly blockNumber: bigint | null;
    readonly gasUsed: bigint | null;
    readonly actualCollateral: bigint | null;
    readonly fallbackOwed: bigint;
    readonly receipt: Record<string, unknown> | null;
  }[];
}

export interface LeasedClaimTransaction {
  readonly id: string;
  readonly claimId: string;
  readonly planHash: string;
  readonly plan: Record<string, unknown>;
  readonly batchIndex: number;
  readonly nonce: bigint | null;
  readonly transactionHash: string;
  readonly submittedAt: Date;
  readonly attempts: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
}

export interface CompleteClaimReconciliationInput {
  readonly transactionId: string;
  readonly workerId: string;
  readonly status: "confirmed" | "failed" | "superseded";
  readonly blockNumber?: bigint;
  readonly gasUsed?: bigint;
  readonly actualCollateral?: bigint;
  readonly receipt: Record<string, unknown>;
  readonly fallbackOwed: bigint;
  readonly now?: Date;
}

interface LeasedClaimRow extends Record<string, unknown>, LeasedClaimTransaction {}

function planMetadata(plan: ClaimPlan): Record<string, unknown> {
  return toJsonObject({ plan });
}

function storedPlan(metadata: Record<string, unknown>): Record<string, unknown> {
  const plan = metadata.plan;
  if (typeof plan !== "object" || plan === null || Array.isArray(plan)) {
    throw new Error("stored claim plan metadata is invalid");
  }
  return plan as Record<string, unknown>;
}

export class ClaimRepository {
  constructor(private readonly db: ClaimRailDatabase) {}

  async persistReadyPlan(input: PersistClaimPlanInput): Promise<{ readonly claimId: string }> {
    const claimId = `claim:${input.plan.integrityHash}`;
    const eventId = `claim-plan:${input.plan.integrityHash}`;
    await this.db.transaction(async (tx) => {
      const now = new Date(Number(input.plan.createdAt));
      await tx
        .insert(deployments)
        .values({
          ...input.deployment,
          binaryModule: input.deployment.binaryModule.toLowerCase(),
          binarySettlement: input.deployment.binarySettlement.toLowerCase(),
          configuration: toJsonObject(input.deployment.configuration),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: deployments.key,
          set: {
            adapterVersion: input.deployment.adapterVersion,
            name: input.deployment.name,
            binaryModule: input.deployment.binaryModule.toLowerCase(),
            binarySettlement: input.deployment.binarySettlement.toLowerCase(),
            configuration: toJsonObject(input.deployment.configuration),
            updatedAt: now,
          },
        });
      await tx
        .insert(claims)
        .values({
          id: claimId,
          deploymentKey: input.deployment.key,
          owner: input.plan.owner.toLowerCase(),
          recipient: input.plan.recipient.toLowerCase(),
          status: "ready",
          planHash: input.plan.integrityHash,
          expectedPayout: input.plan.expectedPayout,
          metadata: planMetadata(input.plan),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: claims.planHash });
      const payload = toJsonObject({
        planHash: input.plan.integrityHash,
        owner: input.plan.owner,
        chainId: input.plan.chainId,
        expectedPayout: input.plan.expectedPayout,
        expiresAt: input.plan.expiresAt,
        batchCount: input.plan.batches.length,
      });
      await tx
        .insert(canonicalEvents)
        .values({
          id: eventId,
          type: "claim.plan_created",
          aggregateType: "claim",
          aggregateId: claimId,
          schemaVersion: "1",
          payload,
          blockNumber: input.plan.verifiedBlock,
          occurredAt: now,
        })
        .onConflictDoNothing({ target: canonicalEvents.id });
      await tx
        .insert(outboxJobs)
        .values({ eventId, topic: "canonical-events", payload, availableAt: now })
        .onConflictDoNothing({ target: [outboxJobs.eventId, outboxJobs.topic] });
      await tx
        .insert(auditRecords)
        .values({
          idempotencyKey: `claim-plan:${input.plan.integrityHash}`,
          action: "claim.plan.persisted",
          actorType: "api",
          subjectType: "claim",
          subjectId: claimId,
          details: payload,
          occurredAt: now,
        })
        .onConflictDoNothing({ target: auditRecords.idempotencyKey });
    });
    return { claimId };
  }

  async loadPlan(deploymentKey: string, planHash: string): Promise<StoredClaimPlan | null> {
    const [claim] = await this.db
      .select({ id: claims.id, status: claims.status, metadata: claims.metadata })
      .from(claims)
      .where(and(eq(claims.deploymentKey, deploymentKey), eq(claims.planHash, planHash)))
      .limit(1);
    if (claim === undefined) return null;
    return { claimId: claim.id, status: claim.status, plan: storedPlan(claim.metadata) };
  }

  async getClaimReceipt(claimId: string): Promise<StoredClaimReceipt | null> {
    const [claim] = await this.db.select().from(claims).where(eq(claims.id, claimId)).limit(1);
    if (claim === undefined || claim.planHash === null) return null;
    const rows = await this.db
      .select()
      .from(claimTransactions)
      .where(eq(claimTransactions.claimId, claimId))
      .orderBy(asc(claimTransactions.batchIndex));
    return {
      claimId: claim.id,
      status: claim.status,
      planHash: claim.planHash,
      owner: claim.owner,
      recipient: claim.recipient,
      expectedPayout: claim.expectedPayout,
      actualCollateral: claim.actualCollateral,
      gasUsed: claim.gasUsed,
      submittedAt: claim.submittedAt,
      confirmedAt: claim.confirmedAt,
      blockNumber: claim.blockNumber,
      plan: storedPlan(claim.metadata),
      transactions: rows.map((row) => {
        const receipt = row.metadata.receipt;
        const fallbackOwed = row.metadata.fallbackOwed;
        return {
          batchIndex: row.batchIndex,
          nonce: row.nonce,
          transactionHash: row.transactionHash,
          status: row.status,
          attempts: row.attempts,
          submittedAt: row.submittedAt,
          confirmedAt: row.confirmedAt,
          blockNumber: row.blockNumber,
          gasUsed: row.gasUsed,
          actualCollateral: row.actualCollateral,
          fallbackOwed:
            typeof fallbackOwed === "string" && /^(0|[1-9][0-9]*)$/.test(fallbackOwed)
              ? BigInt(fallbackOwed)
              : 0n,
          receipt:
            typeof receipt === "object" && receipt !== null && !Array.isArray(receipt)
              ? (receipt as Record<string, unknown>)
              : null,
        };
      }),
    };
  }

  async listWalletClaimReceipts(
    owner: string,
    limit = 100,
  ): Promise<readonly StoredClaimReceipt[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 500) {
      throw new RangeError("claim receipt limit must be between 1 and 500");
    }
    const rows = await this.db
      .select({ id: claims.id })
      .from(claims)
      .where(eq(claims.owner, owner.toLowerCase()))
      .orderBy(desc(claims.createdAt))
      .limit(limit);
    const receipts = await Promise.all(rows.map(({ id }) => this.getClaimReceipt(id)));
    return receipts.filter((receipt): receipt is StoredClaimReceipt => receipt !== null);
  }

  async leasePendingTransaction(options: {
    readonly workerId: string;
    readonly leaseMs: number;
    readonly now?: Date;
  }): Promise<LeasedClaimTransaction | null> {
    if (options.workerId.trim() === "") throw new Error("workerId is required");
    if (!Number.isSafeInteger(options.leaseMs) || options.leaseMs <= 0) {
      throw new RangeError("leaseMs must be a positive safe integer");
    }
    const now = options.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + options.leaseMs);
    const result = await this.db.execute<LeasedClaimRow>(sql`
      with candidate as (
        select ct.id
        from claim_transactions as ct
        where ct.status = 'pending'
          and ct.next_attempt_at <= ${now}
          and (
            ct.lease_owner is null
            or ct.lease_expires_at <= ${now}
          )
        order by ct.next_attempt_at asc, ct.submitted_at asc
        for update skip locked
        limit 1
      )
      update claim_transactions as ct
      set lease_owner = ${options.workerId},
          lease_expires_at = ${leaseExpiresAt},
          attempts = ct.attempts + 1,
          updated_at = ${now}
      from candidate, claims as claim
      where ct.id = candidate.id
        and claim.id = ct.claim_id
      returning
        ct.id,
        ct.claim_id as "claimId",
        claim.plan_hash as "planHash",
        claim.metadata->'plan' as plan,
        ct.batch_index as "batchIndex",
        ct.nonce,
        ct.transaction_hash as "transactionHash",
        ct.submitted_at as "submittedAt",
        ct.attempts,
        ct.lease_owner as "leaseOwner",
        ct.lease_expires_at as "leaseExpiresAt"
    `);
    return result.rows[0] ?? null;
  }

  async deferReconciliation(options: {
    readonly transactionId: string;
    readonly workerId: string;
    readonly reason: string;
    readonly delayMs?: number;
    readonly now?: Date;
  }): Promise<boolean> {
    const delayMs = options.delayMs ?? 15_000;
    if (!Number.isSafeInteger(delayMs) || delayMs <= 0) {
      throw new RangeError("delayMs must be a positive safe integer");
    }
    const now = options.now ?? new Date();
    const updated = await this.db
      .update(claimTransactions)
      .set({
        nextAttemptAt: new Date(now.getTime() + delayMs),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: options.reason.slice(0, 4_000),
        updatedAt: now,
      })
      .where(
        and(
          eq(claimTransactions.id, options.transactionId),
          eq(claimTransactions.status, "pending"),
          eq(claimTransactions.leaseOwner, options.workerId),
        ),
      )
      .returning({ id: claimTransactions.id });
    return updated.length === 1;
  }

  async completeReconciliation(input: CompleteClaimReconciliationInput): Promise<boolean> {
    const now = input.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(claimTransactions)
        .set({
          status: input.status,
          confirmedAt: now,
          ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
          ...(input.gasUsed === undefined ? {} : { gasUsed: input.gasUsed }),
          ...(input.actualCollateral === undefined
            ? {}
            : { actualCollateral: input.actualCollateral }),
          metadata: toJsonObject({ receipt: input.receipt, fallbackOwed: input.fallbackOwed }),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: input.status === "failed" ? "receipt reconciliation failed" : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(claimTransactions.id, input.transactionId),
            eq(claimTransactions.status, "pending"),
            eq(claimTransactions.leaseOwner, input.workerId),
          ),
        )
        .returning({
          claimId: claimTransactions.claimId,
          transactionHash: claimTransactions.transactionHash,
        });
      if (updated === undefined) return false;

      const totals = await tx.execute<{
        readonly pending: string;
        readonly failed: string;
        readonly superseded: string;
        readonly actualCollateral: string;
        readonly gasUsed: string;
      }>(sql`
        select
          count(*) filter (where status = 'pending')::text as pending,
          count(*) filter (where status = 'failed')::text as failed,
          count(*) filter (where status = 'superseded')::text as superseded,
          coalesce(sum(actual_collateral), 0)::text as "actualCollateral",
          coalesce(sum(gas_used), 0)::text as "gasUsed"
        from claim_transactions
        where claim_id = ${updated.claimId}
      `);
      const aggregate = totals.rows[0];
      if (aggregate === undefined) throw new Error("claim transaction aggregate is missing");
      const claimStatus =
        Number(aggregate.failed) > 0
          ? "failed"
          : Number(aggregate.superseded) > 0
            ? "superseded"
            : Number(aggregate.pending) === 0
              ? "confirmed"
              : "submitted";
      await tx
        .update(claims)
        .set({
          status: claimStatus,
          ...(claimStatus === "confirmed"
            ? {
                actualCollateral: BigInt(aggregate.actualCollateral),
                gasUsed: BigInt(aggregate.gasUsed),
                confirmedAt: now,
                blockNumber: input.blockNumber,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(claims.id, updated.claimId));

      const eventType =
        input.status === "confirmed"
          ? "claim.confirmed"
          : input.status === "failed"
            ? "claim.failed"
            : "claim.superseded";
      const eventId = `${eventType}:${updated.transactionHash}`;
      const payload = toJsonObject({
        claimId: updated.claimId,
        transactionHash: updated.transactionHash,
        status: input.status,
        ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
        ...(input.gasUsed === undefined ? {} : { gasUsed: input.gasUsed }),
        ...(input.actualCollateral === undefined
          ? {}
          : { actualCollateral: input.actualCollateral }),
        fallbackOwed: input.fallbackOwed,
      });
      await tx
        .insert(canonicalEvents)
        .values({
          id: eventId,
          type: eventType,
          aggregateType: "claim",
          aggregateId: updated.claimId,
          schemaVersion: "1",
          payload,
          sourceTransactionHash: updated.transactionHash,
          ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
          occurredAt: now,
        })
        .onConflictDoNothing({ target: canonicalEvents.id });
      await tx
        .insert(outboxJobs)
        .values({ eventId, topic: "canonical-events", payload, availableAt: now })
        .onConflictDoNothing({ target: [outboxJobs.eventId, outboxJobs.topic] });
      await tx
        .insert(auditRecords)
        .values({
          idempotencyKey: eventId,
          action: `claim.reconciliation.${input.status}`,
          actorType: "worker",
          subjectType: "claim",
          subjectId: updated.claimId,
          details: payload,
          occurredAt: now,
        })
        .onConflictDoNothing({ target: auditRecords.idempotencyKey });
      if (input.fallbackOwed > 0n) {
        const [claimOwner] = await tx
          .select({ owner: claims.owner })
          .from(claims)
          .where(eq(claims.id, updated.claimId))
          .limit(1);
        if (claimOwner === undefined) throw new Error("claim owner is missing");
        const owedEventId = `wallet.payout_owed:${updated.transactionHash}`;
        const owedPayload = toJsonObject({
          claimId: updated.claimId,
          owner: claimOwner.owner,
          transactionHash: updated.transactionHash,
          amount: input.fallbackOwed,
        });
        await tx
          .insert(canonicalEvents)
          .values({
            id: owedEventId,
            type: "wallet.payout_owed",
            aggregateType: "wallet",
            aggregateId: claimOwner.owner,
            schemaVersion: "1",
            payload: owedPayload,
            sourceTransactionHash: updated.transactionHash,
            ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
            occurredAt: now,
          })
          .onConflictDoNothing({ target: canonicalEvents.id });
        await tx
          .insert(outboxJobs)
          .values({
            eventId: owedEventId,
            topic: "canonical-events",
            payload: owedPayload,
            availableAt: now,
          })
          .onConflictDoNothing({ target: [outboxJobs.eventId, outboxJobs.topic] });
      }
      return true;
    });
  }

  async recordSubmission(input: RecordClaimSubmissionInput): Promise<ClaimSubmissionRecord> {
    if (!Number.isSafeInteger(input.batchIndex) || input.batchIndex < 0) {
      throw new RangeError("batchIndex must be a non-negative safe integer");
    }
    if (input.nonce < 0n) throw new RangeError("nonce must not be negative");
    return this.db.transaction(async (tx) => {
      const [claim] = await tx
        .select()
        .from(claims)
        .where(
          and(eq(claims.deploymentKey, input.deploymentKey), eq(claims.planHash, input.planHash)),
        )
        .limit(1);
      if (claim === undefined) throw new Error("claim plan was not found");
      const plan = storedPlan(claim.metadata);
      if (String(plan.owner).toLowerCase() !== input.owner.toLowerCase()) {
        throw new Error("submission owner does not match the claim plan");
      }
      if (Number(plan.chainId) !== input.chainId) {
        throw new Error("submission chain does not match the claim plan");
      }
      if (Number(plan.expiresAt) <= input.submittedAt.getTime()) {
        throw new Error("claim plan has expired; prepare a fresh plan");
      }
      const batches = plan.batches;
      if (!Array.isArray(batches) || input.batchIndex >= batches.length) {
        throw new Error("submission batch does not exist in the claim plan");
      }
      const [existing] = await tx
        .select()
        .from(claimTransactions)
        .where(
          and(
            eq(claimTransactions.claimId, claim.id),
            eq(claimTransactions.batchIndex, input.batchIndex),
          ),
        )
        .limit(1);
      if (existing !== undefined) {
        if (existing.transactionHash.toLowerCase() !== input.transactionHash.toLowerCase()) {
          throw new Error("this claim batch already has a different transaction hash");
        }
        return {
          claimId: claim.id,
          transactionHash: existing.transactionHash,
          batchIndex: existing.batchIndex,
          duplicate: true,
        };
      }

      const [created] = await tx
        .insert(claimTransactions)
        .values({
          claimId: claim.id,
          deploymentKey: input.deploymentKey,
          batchIndex: input.batchIndex,
          nonce: input.nonce,
          transactionHash: input.transactionHash.toLowerCase(),
          status: "pending",
          nextAttemptAt: input.submittedAt,
          submittedAt: input.submittedAt,
          createdAt: input.submittedAt,
          updatedAt: input.submittedAt,
          metadata: toJsonObject({ planHash: input.planHash }),
        })
        .returning();
      if (created === undefined) throw new Error("claim submission was not persisted");
      await tx
        .update(claims)
        .set({
          status: "submitted",
          ...(input.batchIndex === 0
            ? { transactionHash: input.transactionHash.toLowerCase() }
            : {}),
          submittedAt: claim.submittedAt ?? input.submittedAt,
          updatedAt: input.submittedAt,
        })
        .where(eq(claims.id, claim.id));

      const eventId = `claim-submitted:${input.transactionHash.toLowerCase()}`;
      const payload = toJsonObject({
        planHash: input.planHash,
        transactionHash: input.transactionHash,
        owner: input.owner,
        chainId: input.chainId,
        batchIndex: input.batchIndex,
        nonce: input.nonce,
      });
      await tx.insert(canonicalEvents).values({
        id: eventId,
        type: "claim.submitted",
        aggregateType: "claim",
        aggregateId: claim.id,
        schemaVersion: "1",
        payload,
        sourceTransactionHash: input.transactionHash.toLowerCase(),
        occurredAt: input.submittedAt,
      });
      await tx.insert(outboxJobs).values({
        eventId,
        topic: "canonical-events",
        payload,
        availableAt: input.submittedAt,
      });
      await tx.insert(auditRecords).values({
        idempotencyKey: eventId,
        action: "claim.submission.persisted",
        actorType: "wallet",
        actorId: input.owner.toLowerCase(),
        subjectType: "claim",
        subjectId: claim.id,
        details: payload,
        occurredAt: input.submittedAt,
      });
      return {
        claimId: claim.id,
        transactionHash: created.transactionHash,
        batchIndex: created.batchIndex,
        duplicate: false,
      };
    });
  }
}
