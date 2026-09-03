import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asTimestampMs,
  asTokenId,
  asTransactionHash,
  asVenueId,
  calculatePayout,
  deriveWalletPositionState,
  outcomeSide,
  positionIdentity,
  type ClaimCandidate,
  type EvidenceSource,
  type EvidenceValue,
  type PositionScan,
  type SettlementExplanationInput,
  type WalletPosition,
} from "@claimrail/core";
import { getAddress, type Address, type Hex } from "viem";
import { readMarketBundle } from "../chain/gateway.js";
import type { DreamDexReadGateway, MarketReadBundle } from "../chain/types.js";
import type { DreamDexDeployment } from "../config/deployments.js";
import {
  createOutcomeBalancePageFetcher,
  discoverOutcomeBalances,
  type DiscoverOutcomeBalancesOptions,
  type OutcomeBalancePageFetcher,
  type OutcomeBalanceRow,
  type OutcomeBalanceScan,
} from "../indexer/outcome-balances.js";
import { reconcileDreamDexMarket, type ReconciledDreamDexMarket } from "../reconcile/market.js";
import { mapWithConcurrency } from "./concurrency.js";

export interface WalletReadResult {
  readonly address: Address;
  readonly discovery: OutcomeBalanceScan;
  readonly positions: PositionScan<WalletPosition>;
  readonly markets: readonly ReconciledDreamDexMarket[];
  readonly claimAssessments: readonly ClaimCandidate[];
  readonly claimCandidates: readonly ClaimCandidate[];
  readonly operatorApproved: boolean | null;
}

export interface ClaimRailReadServiceOptions {
  readonly deployment: DreamDexDeployment;
  readonly gateway: DreamDexReadGateway;
  readonly fetchPage?: OutcomeBalancePageFetcher;
  readonly concurrency?: number;
  readonly now?: () => number;
  readonly readBundle?: (gateway: DreamDexReadGateway, marketId: Hex) => Promise<MarketReadBundle>;
}

export interface ReadWalletOptions {
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly pageTimeoutMs?: number;
  readonly signal?: AbortSignal;
}

interface PositionBuildResult {
  readonly position?: WalletPosition;
  readonly assessment?: ClaimCandidate;
  readonly candidate?: ClaimCandidate;
  readonly failure?: string;
}

function evidenceSource(name: string, observedAt: number, blockNumber?: bigint): EvidenceSource {
  return {
    name,
    observedAt: asTimestampMs(observedAt),
    ...(blockNumber === undefined ? {} : { blockNumber: asBlockNumber(blockNumber) }),
  };
}

function verified<Value>(value: Value, source: EvidenceSource): EvidenceValue<Value> {
  return { status: "verified", value, source };
}

function missing<Value>(reason: string): EvidenceValue<Value> {
  return { status: "missing", reason };
}

function winningOutcome(numerators: readonly bigint[]): 0 | 1 | null {
  if (numerators.length !== 2 || numerators[0] === numerators[1]) return null;
  return (numerators[0] ?? 0n) > (numerators[1] ?? 0n) ? 0 : 1;
}

export class ClaimRailReadService {
  private readonly fetchPage: OutcomeBalancePageFetcher;
  private readonly concurrency: number;
  private readonly now: () => number;
  private readonly bundleReader: (
    gateway: DreamDexReadGateway,
    marketId: Hex,
  ) => Promise<MarketReadBundle>;

  constructor(private readonly options: ClaimRailReadServiceOptions) {
    this.fetchPage =
      options.fetchPage ?? createOutcomeBalancePageFetcher(options.deployment.indexerUrl);
    this.concurrency = options.concurrency ?? 8;
    this.now = options.now ?? Date.now;
    this.bundleReader = options.readBundle ?? readMarketBundle;
  }

  async readWallet(address: string, options: ReadWalletOptions = {}): Promise<WalletReadResult> {
    const wallet = getAddress(address);
    const discoveryOptions: DiscoverOutcomeBalancesOptions = {
      account: wallet,
      fetchPage: this.fetchPage,
      now: this.now,
      ...(options.pageSize === undefined ? {} : { pageSize: options.pageSize }),
      ...(options.maxPages === undefined ? {} : { maxPages: options.maxPages }),
      ...(options.pageTimeoutMs === undefined ? {} : { timeoutMs: options.pageTimeoutMs }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
    const discovery = await discoverOutcomeBalances(discoveryOptions);
    const marketIds = [
      ...new Set(
        discovery.positions
          .map(({ market }) => market?.id)
          .filter((marketId): marketId is Hex => marketId !== undefined),
      ),
    ];
    const marketResults = await mapWithConcurrency(
      marketIds,
      this.concurrency,
      async (marketId) => {
        try {
          const bundle = await this.bundleReader(this.options.gateway, marketId);
          return {
            marketId,
            value: reconcileDreamDexMarket({
              deployment: this.options.deployment,
              bundle,
              observedAt: this.now(),
            }),
          } as const;
        } catch (error) {
          return {
            marketId,
            error: error instanceof Error ? error.message : String(error),
          } as const;
        }
      },
    );
    const markets = marketResults.flatMap((result) => ("value" in result ? [result.value] : []));
    const byMarket = new Map(markets.map((market) => [market.market.identity.marketId, market]));
    const marketFailures = new Map(
      marketResults.flatMap((result) =>
        "error" in result ? [[result.marketId, result.error] as const] : [],
      ),
    );

    const built = await mapWithConcurrency(discovery.positions, this.concurrency, (row) =>
      this.buildPosition(wallet, row, byMarket, marketFailures).catch(
        (error: unknown): PositionBuildResult => ({
          failure: `position ${row.id} verification failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
      ),
    );
    const positions = built.flatMap((result) =>
      result.position === undefined ? [] : [result.position],
    );
    const candidates = built.flatMap((result) =>
      result.candidate === undefined ? [] : [result.candidate],
    );
    const assessments = built.flatMap((result) =>
      result.assessment === undefined ? [] : [result.assessment],
    );
    const failures = [
      ...discovery.failures,
      ...built.flatMap((result, index) =>
        result.failure === undefined
          ? []
          : [{ source: "claimrail-position-verifier", page: index, reason: result.failure }],
      ),
    ];
    const completeness =
      failures.length === 0
        ? discovery.completeness
        : positions.length === 0
          ? "failed"
          : "partial";
    const completedAt = asTimestampMs(this.now());
    const verifiedBlocks = markets.flatMap(({ market }) =>
      market.evidence.verifiedBlock === undefined ? [] : [market.evidence.verifiedBlock],
    );
    const commonVerifiedBlock = verifiedBlocks.reduce<(typeof verifiedBlocks)[number] | undefined>(
      (oldest, block) => (oldest === undefined || block < oldest ? block : oldest),
      undefined,
    );
    const positionScan: PositionScan<WalletPosition> = {
      completeness,
      source: "claimrail-dreamdex-read-service",
      pageCount: discovery.pageCount,
      rowCount: discovery.rowCount,
      uniquePositionCount: positions.length,
      startedAt: discovery.startedAt,
      completedAt,
      evidence: {
        version: "claimrail-wallet-read/v1",
        freshness: failures.length === 0 ? "fresh" : "unknown",
        observedAt: completedAt,
        ...(commonVerifiedBlock === undefined ? {} : { verifiedBlock: commonVerifiedBlock }),
        conflicts: markets.flatMap(({ market }) => market.evidence.conflicts),
      },
      positions,
      failures,
    };

    let operatorApproved: boolean | null = null;
    const firstWiring = markets[0]?.market.wiring;
    if (firstWiring?.status === "verified") {
      try {
        operatorApproved = await this.options.gateway.isOperator(
          firstWiring.value.outcomeToken,
          wallet,
          this.options.deployment.addresses.binaryModule,
        );
      } catch {
        operatorApproved = null;
      }
    }
    return {
      address: wallet,
      discovery,
      positions: positionScan,
      markets,
      claimAssessments: assessments,
      claimCandidates: candidates,
      operatorApproved,
    };
  }

  async listWalletPositions(address: string, options: ReadWalletOptions = {}) {
    return (await this.readWallet(address, options)).positions;
  }

  async listClaimCandidates(address: string, options: ReadWalletOptions = {}) {
    const result = await this.readWallet(address, options);
    return {
      completeness: result.positions.completeness,
      candidates: result.claimCandidates,
      failures: result.positions.failures,
      verifiedBlock: result.positions.evidence.verifiedBlock,
      operatorApproved: result.operatorApproved,
    };
  }

  async explainSettlement(marketId: Hex) {
    const bundle = await this.bundleReader(this.options.gateway, marketId);
    const reconciled = reconcileDreamDexMarket({
      deployment: this.options.deployment,
      bundle,
      observedAt: this.now(),
    });
    const source = evidenceSource(
      "claimrail-settlement-explanation",
      this.now(),
      bundle.head.blockNumber,
    );
    const payout = bundle.settlement.finalized
      ? bundle.settlement.payoutNumerators
      : bundle.directPayoutNumerators;
    const closing =
      bundle.resolution.closingAnswer?.numericValue ??
      bundle.onchainResolutionPrice?.numericValue ??
      null;
    const opening = bundle.resolution.openingAnswer?.numericValue ?? null;
    const resolutionEvent = bundle.resolution.events.at(-1);
    const explanation: SettlementExplanationInput = {
      marketQuestion: bundle.indexed.question,
      rule:
        bundle.indexed.mode === "reference"
          ? "Up wins when the closing oracle value is at or above the opening value."
          : `Up wins when the closing oracle value is at or above ${bundle.indexed.strike}.`,
      contractStatus: reconciled.market.contractStatus,
      settlementFinalized: reconciled.market.settlementFinalized,
      openingValue:
        opening === null
          ? missing("this market has no indexed opening answer")
          : verified(asBaseUnit(opening), source),
      closingValue:
        closing === null
          ? missing("the oracle has no closing answer yet")
          : verified(asBaseUnit(closing), source),
      valueDecimals: bundle.onchainResolutionPrice?.decimals ?? 2,
      winningOutcome:
        payout.length === 0
          ? missing("the market has no payout vector yet")
          : verified(winningOutcome(payout), source),
      voidReason:
        bundle.resolution.closingAnswer?.voidReason === null ||
        bundle.resolution.closingAnswer?.voidReason === undefined
          ? missing("the oracle did not provide a void reason")
          : verified(`oracle reason ${bundle.resolution.closingAnswer.voidReason}`, source),
      payoutVector: reconciled.market.settlement.payoutVector,
      oracleQuestionId:
        bundle.indexed.oracleQuestionId === null || bundle.indexed.oracleQuestionId === undefined
          ? missing("oracle question id is not indexed")
          : verified(bundle.indexed.oracleQuestionId, source),
      resolutionTransaction:
        resolutionEvent === undefined
          ? missing("resolution transaction is not indexed")
          : verified(asTransactionHash(resolutionEvent.txHash), source),
      finalizationTransaction: reconciled.market.settlement.finalizationTransaction,
    };
    return { market: reconciled.market, explanation };
  }

  private async buildPosition(
    wallet: Address,
    row: OutcomeBalanceRow,
    markets: ReadonlyMap<string, ReconciledDreamDexMarket>,
    marketFailures: ReadonlyMap<string, string>,
  ): Promise<PositionBuildResult> {
    if (row.market === null) return { failure: `position ${row.id} has no market relation` };
    if (row.account.toLowerCase() !== wallet.toLowerCase()) {
      return { failure: `position ${row.id} belongs to a different wallet` };
    }
    if (row.outcomeIndex !== 0 && row.outcomeIndex !== 1) {
      return { failure: `position ${row.id} has unsupported outcome ${row.outcomeIndex}` };
    }
    const reconciled = markets.get(row.market.id);
    if (reconciled === undefined) {
      return {
        failure: `market ${row.market.id} could not be verified: ${marketFailures.get(row.market.id) ?? "unknown error"}`,
      };
    }
    const wiring = reconciled.market.wiring;
    if (wiring.status !== "verified")
      return { failure: `market ${row.market.id} wiring is not verified` };
    const expectedTokenId = wiring.value.tokenIds[row.outcomeIndex];
    const conflicts = reconciled.market.evidence.conflicts.map(({ reason }) => reason);
    if (expectedTokenId !== row.tokenId)
      conflicts.push("indexed token id disagrees with module outcome id");
    const balance = await this.options.gateway.getOutcomeBalance(
      wiring.value.outcomeToken,
      wallet,
      BigInt(expectedTokenId),
    );
    if (balance !== BigInt(row.balance))
      conflicts.push("indexed balance disagrees with ERC-6909 balance");

    const payoutEvidence = reconciled.market.settlement.payoutVector;
    const payoutNumerator =
      payoutEvidence.status === "verified"
        ? (payoutEvidence.value.numerators[row.outcomeIndex] ?? asBaseUnit(0n))
        : asBaseUnit(0n);
    const expectedPayout =
      payoutEvidence.status === "verified"
        ? calculatePayout({
            amount: asBaseUnit(balance),
            outcomeIndex: row.outcomeIndex,
            payoutVector: payoutEvidence.value,
          }).expectedPayout
        : asBaseUnit(0n);
    const positionEvidence = {
      version: "claimrail-wallet-position/v1",
      freshness: reconciled.market.evidence.freshness,
      observedAt: reconciled.market.evidence.observedAt,
      ...(reconciled.market.evidence.verifiedBlock === undefined
        ? {}
        : { verifiedBlock: reconciled.market.evidence.verifiedBlock }),
      conflicts: conflicts.map((reason) => ({
        field: "position",
        reason,
        sources: ["dreamdex-indexer", "somnia-chain"],
      })),
    } as const;
    const verifiedBalance = asBaseUnit(balance);
    const position: WalletPosition = {
      identity: positionIdentity(reconciled.market.identity, wallet, row.outcomeIndex),
      wallet: asAddress(wallet),
      market: reconciled.market.identity,
      marketId: reconciled.market.identity.marketId,
      outcomeIndex: row.outcomeIndex,
      side: outcomeSide(row.outcomeIndex),
      tokenId: asTokenId(expectedTokenId),
      verifiedBalance,
      state: deriveWalletPositionState({
        contractStatus: reconciled.market.contractStatus,
        settlementFinalized: reconciled.market.settlementFinalized,
        isResolved: reconciled.market.settlement.isResolved,
        isVoided: reconciled.market.settlement.isVoided,
        verifiedBalance,
        payoutNumerator,
      }),
      expectedPayout,
      evidence: positionEvidence,
    };

    const settlementBacking = reconciled.market.settlement.backing;
    const settlementFee = reconciled.market.settlement.settlementFeeBpsTimes1k;
    const assessment: ClaimCandidate | undefined =
      payoutEvidence.status === "verified" &&
      settlementBacking.status === "verified" &&
      settlementFee.status === "verified" &&
      conflicts.length === 0 &&
      reconciled.venueId !== null &&
      reconciled.operatorId !== null
        ? {
            candidateId: row.id,
            market: reconciled.market.identity,
            owner: asAddress(wallet),
            venueId: asVenueId(reconciled.venueId),
            operatorId: reconciled.operatorId,
            outcomeIndex: row.outcomeIndex,
            tokenId: asTokenId(expectedTokenId),
            outcomeToken: wiring.value.outcomeToken,
            amount: verifiedBalance,
            verifiedBalance,
            pool: wiring.value.pool,
            marketNonce: wiring.value.marketNonce,
            collateral: wiring.value.collateral,
            contractStatus: reconciled.market.contractStatus,
            isResolved: reconciled.market.settlement.isResolved,
            isVoided: reconciled.market.settlement.isVoided,
            settlementFinalized: reconciled.market.settlementFinalized,
            settlementBacking: settlementBacking.value,
            payoutVector: payoutEvidence.value,
            settlementFeeBpsTimes1k: settlementFee.value,
            alreadyRedeemed: balance === 0n,
            freshness: reconciled.market.evidence.freshness,
            conflicts,
            evidenceVersion: reconciled.market.evidence.version,
          }
        : undefined;
    const candidate =
      assessment !== undefined &&
      (position.state === "claimable" || position.state === "void_refundable") &&
      expectedPayout > 0n
        ? assessment
        : undefined;
    return {
      position,
      ...(assessment === undefined ? {} : { assessment }),
      ...(candidate === undefined ? {} : { candidate }),
    };
  }
}
