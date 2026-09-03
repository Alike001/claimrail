import { createCanonicalEvent, type WalletPosition } from "@claimrail/core";
import { ClaimRailStateRepository, type PersistWalletTransitionInput } from "@claimrail/db";
import type {
  ClaimRailReadService,
  DreamDexDeployment,
  ReconciledDreamDexMarket,
  WalletReadResult,
} from "@claimrail/dreamdex";
import type { WorkerJob } from "../runtime.js";

export interface WalletScanOptions {
  readonly wallet: string;
  readonly deployment: DreamDexDeployment;
  readonly service: Pick<ClaimRailReadService, "readWallet">;
  readonly repository: ClaimRailStateRepository;
}

function marketIdentity(market: ReconciledDreamDexMarket): string {
  const { identity } = market.market;
  return [identity.chainId, identity.binaryModule, identity.marketId].join(":").toLowerCase();
}

function settlementStatus(market: ReconciledDreamDexMarket) {
  const statuses = [
    market.market.settlement.payoutVector.status,
    market.market.settlement.backing.status,
    market.market.settlement.settlementFeeBpsTimes1k.status,
  ];
  if (statuses.includes("conflicting")) return "conflicting" as const;
  if (statuses.every((status) => status === "verified")) return "verified" as const;
  if (statuses.includes("pending")) return "pending" as const;
  return "missing" as const;
}

function verifiedValue<Value>(
  evidence: { readonly status: string; readonly value?: Value },
  label: string,
): Value {
  if (evidence.status !== "verified" || evidence.value === undefined) {
    throw new Error(`${label} is not verified`);
  }
  return evidence.value;
}

function sourceId(prefix: string, identity: string, block: bigint | undefined): string {
  return `${prefix}:${identity}:${block?.toString() ?? "unverified"}`;
}

async function transitionInput(
  deployment: DreamDexDeployment,
  result: WalletReadResult,
  position: WalletPosition,
  market: ReconciledDreamDexMarket,
): Promise<PersistWalletTransitionInput> {
  const wiring = verifiedValue(market.market.wiring, "market wiring");
  const payout = verifiedValue(market.market.settlement.payoutVector, "payout vector");
  const backing = verifiedValue(market.market.settlement.backing, "settlement backing");
  const fee = verifiedValue(market.market.settlement.settlementFeeBpsTimes1k, "settlement fee");
  const finalization = market.market.settlement.finalizationTransaction;
  const transactionHash = finalization.status === "verified" ? finalization.value : undefined;
  const verifiedBlock = market.market.evidence.verifiedBlock;
  const observedAt = new Date(position.evidence.observedAt);
  const marketKey = marketIdentity(market);
  const stateVersion = [
    position.evidence.version,
    position.state,
    position.verifiedBalance,
    position.expectedPayout,
    market.market.lifecycle,
    payout.numerators.join(","),
  ].join(":");
  const payload = {
    wallet: position.wallet,
    positionIdentity: position.identity,
    marketId: position.marketId,
    outcomeIndex: position.outcomeIndex,
    state: position.state,
    verifiedBalance: position.verifiedBalance,
    expectedPayout: position.expectedPayout,
    settlementFinalized: market.market.settlementFinalized,
    evidenceVersion: position.evidence.version,
  };
  const event = await createCanonicalEvent({
    schemaVersion: "1",
    type: "wallet.claimable",
    createdAt: position.evidence.observedAt,
    chainId: market.market.identity.chainId,
    stateVersion,
    wallet: position.wallet,
    marketId: position.marketId,
    outcomeIndex: position.outcomeIndex,
    ...(transactionHash === undefined ? {} : { transactionHash }),
    amount: {
      raw: position.expectedPayout,
      decimals: market.market.display.collateralDecimals,
      symbol: market.market.display.collateralSymbol,
    },
    evidenceLinks:
      transactionHash === undefined
        ? [deployment.explorerUrl]
        : [`${deployment.explorerUrl}/tx/${transactionHash}`],
    payload,
  });
  return {
    deployment: {
      key: deployment.key,
      chainId: deployment.chain.id,
      adapterVersion: deployment.adapterVersion,
      name: deployment.chain.name,
      binaryModule: deployment.addresses.binaryModule,
      binarySettlement: deployment.addresses.binarySettlement,
      configuration: { payoutVectorDenominator: deployment.payoutVectorDenominator },
    },
    walletAddress: result.address,
    scan: {
      sourceRunId: `${result.positions.source}:${result.address}:${result.positions.startedAt}:${result.positions.completedAt}`,
      completeness: result.positions.completeness,
      source: result.positions.source,
      pageCount: result.positions.pageCount,
      rowCount: result.positions.rowCount,
      uniquePositionCount: result.positions.uniquePositionCount,
      ...(result.discovery.nextOffset === null ? {} : { nextOffset: result.discovery.nextOffset }),
      failureDetails: result.positions.failures,
      startedAt: new Date(result.positions.startedAt),
      completedAt: new Date(result.positions.completedAt),
    },
    market: {
      identity: marketKey,
      marketId: market.market.identity.marketId,
      binaryModule: market.market.identity.binaryModule,
      pool: wiring.pool,
      marketNonce: wiring.marketNonce,
      marketAddress: wiring.marketAddress,
      outcomeToken: wiring.outcomeToken,
      collateral: wiring.collateral,
      contractStatus: market.market.contractStatus,
      settlementFinalized: market.market.settlementFinalized,
      lifecycle: market.market.lifecycle,
      evidenceVersion: market.market.evidence.version,
      canonical: { ...market.market },
      ...(verifiedBlock === undefined ? {} : { verifiedBlock }),
      observedAt,
      observation: {
        source: "claimrail-dreamdex-reconciliation",
        sourceId: sourceId("market", marketKey, verifiedBlock),
        ...(transactionHash === undefined ? {} : { transactionHash }),
        payload: { ...market.market },
      },
      settlement: {
        status: settlementStatus(market),
        finalized: market.market.settlement.finalized,
        voided: market.market.settlement.isVoided,
        backing,
        settlementFeeBpsTimes1k: fee,
        payoutNumerators: payout.numerators.map(String),
        payoutDenominator: payout.denominator,
        ...(transactionHash === undefined ? {} : { finalizationTransaction: transactionHash }),
        evidence: { ...market.market.settlement },
      },
    },
    position: {
      identity: position.identity,
      outcomeIndex: position.outcomeIndex,
      tokenId: BigInt(position.tokenId),
      verifiedBalance: position.verifiedBalance,
      state: position.state,
      expectedPayout: position.expectedPayout,
      evidenceVersion: position.evidence.version,
      evidence: { ...position.evidence },
      ...(position.evidence.verifiedBlock === undefined
        ? {}
        : { verifiedBlock: position.evidence.verifiedBlock }),
      observedAt,
      observation: {
        source: "claimrail-wallet-position",
        sourceId: sourceId("position", position.identity, position.evidence.verifiedBlock),
        payload: { ...position },
      },
    },
    transition: {
      eventId: event.id,
      eventType: event.type,
      aggregateType: "position",
      aggregateId: position.identity,
      schemaVersion: event.schemaVersion,
      payload: { ...event },
      ...(transactionHash === undefined ? {} : { sourceTransactionHash: transactionHash }),
      ...(verifiedBlock === undefined ? {} : { blockNumber: verifiedBlock }),
      occurredAt: observedAt,
      outboxTopic: "canonical-events",
    },
  };
}

export async function persistClaimableWalletScan(options: WalletScanOptions) {
  const result = await options.service.readWallet(options.wallet);
  const markets = new Map(
    result.markets.map((market) => [market.market.identity.marketId, market] as const),
  );
  const candidateKeys = new Set(
    result.claimCandidates.map(
      (candidate) => `${candidate.market.marketId}:${candidate.outcomeIndex}`,
    ),
  );
  let eventsCreated = 0;
  let outboxJobsCreated = 0;
  let persisted = 0;
  for (const position of result.positions.positions) {
    if (!candidateKeys.has(`${position.marketId}:${position.outcomeIndex}`)) continue;
    const market = markets.get(position.marketId);
    if (market === undefined) continue;
    const saved = await options.repository.persistWalletTransition(
      await transitionInput(options.deployment, result, position, market),
    );
    persisted += 1;
    if (saved.eventCreated) eventsCreated += 1;
    if (saved.outboxCreated) outboxJobsCreated += 1;
  }
  return {
    wallet: result.address,
    completeness: result.positions.completeness,
    verifiedPositions: result.positions.uniquePositionCount,
    claimCandidates: result.claimCandidates.length,
    persisted,
    eventsCreated,
    outboxJobsCreated,
  } as const;
}

export function createWalletScanJob(options?: WalletScanOptions): WorkerJob {
  if (options === undefined) {
    return async () => ({ status: "idle", detail: "CLAIMRAIL_SYNC_WALLET is not configured" });
  }
  return async () => {
    const result = await persistClaimableWalletScan(options);
    return {
      status: result.persisted === 0 ? "idle" : "worked",
      detail: `verified ${result.verifiedPositions} positions; upserted ${result.persisted} claimables; created ${result.eventsCreated} events and ${result.outboxJobsCreated} jobs`,
      count: result.persisted,
    };
  };
}
