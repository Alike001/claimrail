import { sql } from "drizzle-orm";
import type { ClaimRailDatabase } from "../client.js";
import { toJsonObject, toJsonSafe } from "../json.js";
import {
  auditRecords,
  canonicalEvents,
  deployments,
  marketObservations,
  markets,
  outboxJobs,
  positionObservations,
  positionScanMembers,
  positions,
  scanRuns,
  settlementEvidence,
  watchedWallets,
} from "../schema/index.js";
import type { PersistWalletTransitionInput } from "./types.js";

export interface PersistTransitionResult {
  readonly walletId: string;
  readonly scanRunId: string;
  readonly eventCreated: boolean;
  readonly outboxCreated: boolean;
}

export class ClaimRailStateRepository {
  constructor(private readonly db: ClaimRailDatabase) {}

  async persistWalletTransition(
    input: PersistWalletTransitionInput,
  ): Promise<PersistTransitionResult> {
    const walletId = `${input.deployment.key}:${input.walletAddress.toLowerCase()}`;
    return this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .insert(deployments)
        .values({
          ...input.deployment,
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
        .insert(watchedWallets)
        .values({
          id: walletId,
          deploymentKey: input.deployment.key,
          address: input.walletAddress.toLowerCase(),
          ...(input.scan.completeness === "complete"
            ? { lastCompleteScanAt: input.scan.completedAt }
            : {}),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: watchedWallets.id,
          set: {
            enabled: true,
            ...(input.scan.completeness === "complete"
              ? { lastCompleteScanAt: input.scan.completedAt }
              : {}),
            updatedAt: now,
          },
        });

      await tx
        .insert(markets)
        .values({
          ...input.market,
          deploymentKey: input.deployment.key,
          canonical: toJsonObject(input.market.canonical),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: markets.identity,
          set: {
            pool: input.market.pool.toLowerCase(),
            marketNonce: input.market.marketNonce,
            marketAddress: input.market.marketAddress.toLowerCase(),
            outcomeToken: input.market.outcomeToken.toLowerCase(),
            collateral: input.market.collateral.toLowerCase(),
            contractStatus: input.market.contractStatus,
            settlementFinalized: input.market.settlementFinalized,
            lifecycle: input.market.lifecycle,
            evidenceVersion: input.market.evidenceVersion,
            canonical: toJsonObject(input.market.canonical),
            ...(input.market.verifiedBlock === undefined
              ? {}
              : { verifiedBlock: input.market.verifiedBlock }),
            observedAt: input.market.observedAt,
            updatedAt: now,
          },
        });
      await tx
        .insert(marketObservations)
        .values({
          marketIdentity: input.market.identity,
          source: input.market.observation.source,
          sourceId: input.market.observation.sourceId,
          ...(input.market.verifiedBlock === undefined
            ? {}
            : { blockNumber: input.market.verifiedBlock }),
          ...(input.market.observation.transactionHash === undefined
            ? {}
            : { transactionHash: input.market.observation.transactionHash.toLowerCase() }),
          payload: toJsonObject(input.market.observation.payload),
          observedAt: input.market.observedAt,
        })
        .onConflictDoNothing({
          target: [marketObservations.source, marketObservations.sourceId],
        });
      await tx
        .insert(settlementEvidence)
        .values({
          marketIdentity: input.market.identity,
          ...input.market.settlement,
          payoutNumerators: [...input.market.settlement.payoutNumerators],
          ...(input.market.settlement.finalizationTransaction === undefined
            ? {}
            : {
                finalizationTransaction:
                  input.market.settlement.finalizationTransaction.toLowerCase(),
              }),
          ...(input.market.verifiedBlock === undefined
            ? {}
            : { verifiedBlock: input.market.verifiedBlock }),
          evidence: toJsonObject(input.market.settlement.evidence),
          observedAt: input.market.observedAt,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: settlementEvidence.marketIdentity,
          set: {
            status: input.market.settlement.status,
            finalized: input.market.settlement.finalized,
            voided: input.market.settlement.voided,
            backing: input.market.settlement.backing,
            settlementFeeBpsTimes1k: input.market.settlement.settlementFeeBpsTimes1k,
            payoutNumerators: [...input.market.settlement.payoutNumerators],
            payoutDenominator: input.market.settlement.payoutDenominator,
            ...(input.market.settlement.finalizationTransaction === undefined
              ? {}
              : {
                  finalizationTransaction:
                    input.market.settlement.finalizationTransaction.toLowerCase(),
                }),
            ...(input.market.verifiedBlock === undefined
              ? {}
              : { verifiedBlock: input.market.verifiedBlock }),
            evidence: toJsonObject(input.market.settlement.evidence),
            observedAt: input.market.observedAt,
            updatedAt: now,
          },
        });

      const [scan] = await tx
        .insert(scanRuns)
        .values({
          walletId,
          ...input.scan,
          failureDetails: toJsonSafe(input.scan.failureDetails) as readonly unknown[],
        })
        .onConflictDoUpdate({
          target: [scanRuns.walletId, scanRuns.sourceRunId],
          set: {
            completeness: input.scan.completeness,
            pageCount: input.scan.pageCount,
            rowCount: input.scan.rowCount,
            uniquePositionCount: input.scan.uniquePositionCount,
            ...(input.scan.nextOffset === undefined
              ? { nextOffset: sql`null` }
              : { nextOffset: input.scan.nextOffset }),
            failureDetails: toJsonSafe(input.scan.failureDetails) as readonly unknown[],
            completedAt: input.scan.completedAt,
          },
        })
        .returning({ id: scanRuns.id });
      if (scan === undefined) throw new Error("scan upsert did not return an id");

      await tx
        .insert(positions)
        .values({
          ...input.position,
          walletId,
          marketIdentity: input.market.identity,
          evidence: toJsonObject(input.position.evidence),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: positions.identity,
          set: {
            verifiedBalance: input.position.verifiedBalance,
            state: input.position.state,
            expectedPayout: input.position.expectedPayout,
            evidenceVersion: input.position.evidenceVersion,
            evidence: toJsonObject(input.position.evidence),
            ...(input.position.verifiedBlock === undefined
              ? {}
              : { verifiedBlock: input.position.verifiedBlock }),
            observedAt: input.position.observedAt,
            updatedAt: now,
          },
        });
      await tx
        .insert(positionObservations)
        .values({
          positionIdentity: input.position.identity,
          source: input.position.observation.source,
          sourceId: input.position.observation.sourceId,
          balance: input.position.verifiedBalance,
          expectedPayout: input.position.expectedPayout,
          ...(input.position.verifiedBlock === undefined
            ? {}
            : { blockNumber: input.position.verifiedBlock }),
          payload: toJsonObject(input.position.observation.payload),
          observedAt: input.position.observedAt,
        })
        .onConflictDoNothing({
          target: [positionObservations.source, positionObservations.sourceId],
        });
      await tx
        .insert(positionScanMembers)
        .values({ scanRunId: scan.id, positionIdentity: input.position.identity })
        .onConflictDoNothing();

      const createdEvents = await tx
        .insert(canonicalEvents)
        .values({
          id: input.transition.eventId,
          type: input.transition.eventType,
          aggregateType: input.transition.aggregateType,
          aggregateId: input.transition.aggregateId,
          schemaVersion: input.transition.schemaVersion,
          payload: toJsonObject(input.transition.payload),
          ...(input.transition.sourceTransactionHash === undefined
            ? {}
            : { sourceTransactionHash: input.transition.sourceTransactionHash.toLowerCase() }),
          ...(input.transition.sourceLogIndex === undefined
            ? {}
            : { sourceLogIndex: input.transition.sourceLogIndex }),
          ...(input.transition.blockNumber === undefined
            ? {}
            : { blockNumber: input.transition.blockNumber }),
          occurredAt: input.transition.occurredAt,
        })
        .onConflictDoNothing()
        .returning({ id: canonicalEvents.id });
      const createdJobs = await tx
        .insert(outboxJobs)
        .values({
          eventId: input.transition.eventId,
          topic: input.transition.outboxTopic,
          payload: toJsonObject(input.transition.payload),
          availableAt: input.transition.occurredAt,
          ...(input.transition.outboxMaxAttempts === undefined
            ? {}
            : { maxAttempts: input.transition.outboxMaxAttempts }),
        })
        .onConflictDoNothing({ target: [outboxJobs.eventId, outboxJobs.topic] })
        .returning({ id: outboxJobs.id });
      await tx
        .insert(auditRecords)
        .values({
          idempotencyKey: `transition:${input.transition.eventId}`,
          action: "wallet_transition.persisted",
          actorType: "worker",
          subjectType: "position",
          subjectId: input.position.identity,
          details: toJsonObject({
            eventId: input.transition.eventId,
            scanRunId: scan.id,
            sourceRunId: input.scan.sourceRunId,
          }),
          occurredAt: input.transition.occurredAt,
        })
        .onConflictDoNothing({ target: auditRecords.idempotencyKey });
      return {
        walletId,
        scanRunId: scan.id,
        eventCreated: createdEvents.length === 1,
        outboxCreated: createdJobs.length === 1,
      };
    });
  }
}
