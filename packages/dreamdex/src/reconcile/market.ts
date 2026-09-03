import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asChainId,
  asMarketId,
  asTimestampMs,
  asTokenId,
  asTransactionHash,
  normalizeContractStatus,
  reconcileMarketLifecycle,
  type EvidenceConflict,
  type EvidenceSource,
  type EvidenceValue,
  type MarketRecord,
  type OracleEvidence,
  type PayoutVectorRecord,
} from "@claimrail/core";
import type { DreamDexDeployment } from "../config/deployments.js";
import { DEPLOYED_MARKET_FINALIZED_TOPIC } from "../chain/abi.js";
import type { MarketReadBundle } from "../chain/types.js";

export interface ReconciledDreamDexMarket {
  readonly market: MarketRecord;
  readonly operatorId: number | null;
  readonly venueId: string | null;
  readonly bundle: MarketReadBundle;
}

export interface ReconcileMarketOptions {
  readonly deployment: DreamDexDeployment;
  readonly bundle: MarketReadBundle;
  readonly observedAt?: number;
}

function source(
  name: string,
  observedAt: number,
  blockNumber?: bigint,
  transactionHash?: string,
): EvidenceSource {
  return {
    name,
    observedAt: asTimestampMs(observedAt),
    ...(blockNumber === undefined ? {} : { blockNumber: asBlockNumber(blockNumber) }),
    ...(transactionHash === undefined
      ? {}
      : { transactionHash: asTransactionHash(transactionHash) }),
  };
}

function verified<Value>(value: Value, evidenceSource: EvidenceSource): EvidenceValue<Value> {
  return { status: "verified", value, source: evidenceSource };
}

function missing<Value>(reason: string): EvidenceValue<Value> {
  return { status: "missing", reason };
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameBigints(left: readonly bigint[], right: readonly bigint[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function addConflict(
  conflicts: EvidenceConflict[],
  field: string,
  reason: string,
  sources: readonly string[] = ["dreamdex-indexer", "somnia-chain"],
) {
  conflicts.push({ field, reason, sources });
}

function payoutVector(numerators: readonly bigint[], denominator: bigint): PayoutVectorRecord {
  return {
    numerators: numerators.map(asBaseUnit),
    denominator: asBaseUnit(denominator),
  };
}

export function reconcileDreamDexMarket(options: ReconcileMarketOptions): ReconciledDreamDexMarket {
  const { deployment, bundle } = options;
  const observedAt = options.observedAt ?? Date.now();
  const { indexed, onchain, settlement, finalizationEvent } = bundle;
  const chainSource = source("somnia-chain", observedAt, bundle.head.blockNumber);
  const indexerSource = source("dreamdex-indexer", observedAt, BigInt(indexed.createdAtBlock));
  const settlementSource = source(
    "dreamdex-binary-settlement",
    observedAt,
    finalizationEvent?.blockNumber ?? bundle.head.blockNumber,
    finalizationEvent?.transactionHash,
  );
  const conflicts: EvidenceConflict[] = [];

  if (!sameAddress(indexed.marketAddress, onchain.marketAddress)) {
    addConflict(conflicts, "marketAddress", "indexer market address disagrees with module state");
  }
  if (!sameAddress(indexed.poolAddress, onchain.pool)) {
    addConflict(conflicts, "pool", "indexer pool binding disagrees with module state");
  }
  if (!sameAddress(indexed.collateral, onchain.collateral)) {
    addConflict(conflicts, "collateral", "indexer collateral disagrees with module state");
  }
  if (
    indexed.nonce !== null &&
    indexed.nonce !== undefined &&
    BigInt(indexed.nonce) !== onchain.nonce
  ) {
    addConflict(conflicts, "marketNonce", "indexer nonce disagrees with module marketNonce");
  }
  if (BigInt(indexed.yesTokenId) !== onchain.yesId || BigInt(indexed.noTokenId) !== onchain.noId) {
    addConflict(conflicts, "tokenIds", "indexer outcome ids disagree with module state");
  }

  const contractStatus = normalizeContractStatus(onchain.status);
  const indexedStatus = indexed.status.trim().toLowerCase();
  if (
    (indexedStatus === "finalized") !== settlement.finalized ||
    (indexedStatus !== "finalized" && normalizeContractStatus(indexedStatus) !== contractStatus)
  ) {
    addConflict(
      conflicts,
      "lifecycle.indexedStatus",
      `indexer status ${indexed.status} disagrees with chain status ${contractStatus}`,
    );
  }
  const lifecycle = reconcileMarketLifecycle({
    contractStatus,
    settlementFinalized: settlement.finalized,
    isResolved: onchain.isResolved,
    isVoided: onchain.isVoided,
    indexedStatus: indexed.status,
  });
  for (const reason of lifecycle.conflicts) {
    addConflict(conflicts, "lifecycle", reason);
  }

  if (settlement.finalized) {
    if (!sameAddress(settlement.pool, onchain.pool)) {
      addConflict(conflicts, "settlement.pool", "settlement pool disagrees with module state");
    }
    if (settlement.nonce !== onchain.nonce) {
      addConflict(conflicts, "settlement.nonce", "settlement nonce disagrees with module state");
    }
    if (!sameAddress(settlement.collateralToken, onchain.collateral)) {
      addConflict(
        conflicts,
        "settlement.collateral",
        "settlement collateral disagrees with module state",
      );
    }
    if (
      bundle.directPayoutNumerators.length > 0 &&
      !sameBigints(settlement.payoutNumerators, bundle.directPayoutNumerators)
    ) {
      addConflict(
        conflicts,
        "settlement.payoutVector",
        "market and settlement payout vectors disagree",
      );
    }
    if (finalizationEvent === null) {
      addConflict(
        conflicts,
        "settlement.finalizationEvent",
        "finalized settlement has no deployed MarketFinalized event in the queried range",
        ["dreamdex-binary-settlement"],
      );
    } else {
      if (finalizationEvent.nonce !== settlement.nonce) {
        addConflict(
          conflicts,
          "finalizationEvent.nonce",
          "event nonce disagrees with settlement record",
        );
      }
      if (settlement.backing > finalizationEvent.netBacking) {
        addConflict(
          conflicts,
          "finalizationEvent.backing",
          "current settlement backing exceeds the finalized net backing",
        );
      }
      if (!sameBigints(finalizationEvent.payoutNumerators, settlement.payoutNumerators)) {
        addConflict(
          conflicts,
          "finalizationEvent.payoutVector",
          "event payout vector disagrees with settlement record",
        );
      }
    }
  }

  const authoritativePayout = settlement.finalized
    ? settlement.payoutNumerators
    : bundle.directPayoutNumerators;
  const payoutEvidence =
    authoritativePayout.length === 0
      ? missing<PayoutVectorRecord>("market does not have a payout vector yet")
      : verified(
          payoutVector(authoritativePayout, deployment.payoutVectorDenominator),
          settlement.finalized ? settlementSource : chainSource,
        );

  const closing = bundle.resolution.closingAnswer;
  const opening = bundle.resolution.openingAnswer;
  const oracleValue: OracleEvidence = {
    questionId:
      indexed.oracleQuestionId ??
      bundle.onchainResolutionPrice?.oracleQuestionId ??
      bundle.resolution.reference?.oracleQuestionId ??
      "unknown",
    ...(opening?.numericValue === null || opening?.numericValue === undefined
      ? {}
      : { openingValue: asBaseUnit(opening.numericValue) }),
    ...(closing?.numericValue === null || closing?.numericValue === undefined
      ? bundle.onchainResolutionPrice === null
        ? {}
        : { closingValue: asBaseUnit(bundle.onchainResolutionPrice.numericValue) }
      : { closingValue: asBaseUnit(closing.numericValue) }),
    ...(bundle.onchainResolutionPrice === null
      ? {}
      : { valueDecimals: bundle.onchainResolutionPrice.decimals }),
    ...(closing?.voidReason === null || closing?.voidReason === undefined
      ? {}
      : { voidReason: `oracle reason ${closing.voidReason}` }),
    ...(closing?.txHash === null || closing?.txHash === undefined
      ? {}
      : { resolutionTransaction: asTransactionHash(closing.txHash) }),
    explorerUrl: deployment.explorerUrl,
  };
  const hasOracleEvidence = oracleValue.questionId !== "unknown";
  const market: MarketRecord = {
    identity: {
      chainId: asChainId(deployment.chain.id),
      binaryModule: asAddress(deployment.addresses.binaryModule),
      marketId: asMarketId(indexed.marketId),
    },
    display: {
      asset: indexed.asset,
      question: indexed.question,
      interval: indexed.interval ?? indexed.intervalSec ?? "unknown",
      collateralSymbol: "USDso",
      collateralDecimals: onchain.decimals,
    },
    contractStatus,
    settlementFinalized: settlement.finalized,
    lifecycle: lifecycle.lifecycle,
    wiring: verified(
      {
        marketAddress: asAddress(onchain.marketAddress),
        pool: asAddress(onchain.pool),
        marketNonce: onchain.nonce,
        outcomeToken: asAddress(onchain.outcomeToken),
        collateral: asAddress(onchain.collateral),
        tokenIds: [asTokenId(onchain.yesId), asTokenId(onchain.noId)],
      },
      chainSource,
    ),
    settlement: {
      isResolved: onchain.isResolved,
      isVoided: onchain.isVoided,
      finalized: settlement.finalized,
      payoutVector: payoutEvidence,
      backing: verified(
        asBaseUnit(settlement.finalized ? settlement.backing : onchain.backing),
        settlement.finalized ? settlementSource : chainSource,
      ),
      settlementFeeBpsTimes1k: settlement.finalized
        ? verified(asBaseUnit(settlement.settlementFeeBpsTimes1k), settlementSource)
        : missing("settlement has not been finalized"),
      oracle: hasOracleEvidence
        ? verified(oracleValue, indexerSource)
        : missing("oracle evidence is not indexed yet"),
      finalizationTransaction:
        finalizationEvent === null
          ? missing("no deployed finalization event was found")
          : verified(asTransactionHash(finalizationEvent.transactionHash), settlementSource),
      deployedEventSelector: verified(DEPLOYED_MARKET_FINALIZED_TOPIC, settlementSource),
    },
    evidence: {
      version: "claimrail-dreamdex-reconciliation/v1",
      freshness: "fresh",
      observedAt: asTimestampMs(observedAt),
      verifiedBlock: asBlockNumber(bundle.head.blockNumber),
      conflicts,
    },
  };

  return {
    market,
    operatorId: indexed.operatorId ?? null,
    venueId: indexed.venueId ?? null,
    bundle,
  };
}
