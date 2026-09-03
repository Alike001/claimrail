import fc from "fast-check";
import { describe, expect, it } from "vitest";
import claimableWalletJson from "../../../../fixtures/dreamdex/live/shannon-50312/claimable-wallet.json" with { type: "json" };
import redemptionSimulationsJson from "../../../../fixtures/dreamdex/live/shannon-50312/redemption-simulations.json" with { type: "json" };
import voidWalletJson from "../../../../fixtures/dreamdex/live/shannon-50312/void-wallet.json" with { type: "json" };
import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asMarketId,
  asTimestampMs,
  asTokenId,
} from "../identity/types.js";
import {
  CHAIN_ID,
  COLLATERAL,
  MODULE,
  OTHER_OWNER,
  OWNER,
  POOL,
  claimCandidate,
  marketId,
  prepareInput,
} from "../test-support/factories.js";
import {
  SHANNON_REDEEM_MANY_BATCH_POLICY,
  finalizeClaimPlan,
  prepareClaimPlan,
  validateClaimPlan,
} from "./planner.js";
import type { ClaimCandidate, ClaimPlanDraft, ClaimSimulation } from "./types.js";

interface ClaimableFixture {
  readonly wallet: string;
  readonly claimable: {
    readonly value: readonly {
      readonly marketId: string;
      readonly pool: string;
      readonly outcomeIdx: 0 | 1;
      readonly amount: string;
    }[];
  };
  readonly verifiedPositions: readonly {
    readonly indexed: {
      readonly outcomeIndex: 0 | 1;
      readonly tokenId: string;
      readonly market: { readonly id: string };
    };
    readonly onchainMarket: {
      readonly value: {
        readonly nonce: string;
        readonly collateral: string;
        readonly backing: string;
        readonly winningOutcome: 0 | 1;
      };
    };
  }[];
}

interface VoidFixture {
  readonly wallet: string;
  readonly verifiedClaimables: readonly {
    readonly indexed: {
      readonly marketId: string;
      readonly pool: string;
      readonly outcomeIdx: 0 | 1;
      readonly amount: string;
    };
    readonly onchainMarket: {
      readonly value: {
        readonly yesId: string;
        readonly noId: string;
        readonly nonce: string;
        readonly collateral: string;
      };
    };
    readonly balance: { readonly value: string };
    readonly settlement: {
      readonly value: {
        readonly settlementFeeBpsTimes1k: string;
        readonly backing: string;
        readonly payoutNumerators: readonly string[];
      };
    };
  }[];
}

interface SimulationsFixture {
  readonly results: readonly {
    readonly name: string;
    readonly account: string;
    readonly marketIds: readonly string[];
    readonly outcomeIdxs: readonly (0 | 1)[];
    readonly amounts: readonly string[];
  }[];
}

const claimableFixture = claimableWalletJson as unknown as ClaimableFixture;
const voidFixture = voidWalletJson as unknown as VoidFixture;
const simulationsFixture = redemptionSimulationsJson as unknown as SimulationsFixture;

function passedSimulations(draft: ClaimPlanDraft): ClaimSimulation[] {
  return draft.batches.map((batch) => ({
    status: "passed",
    batchIndex: batch.index,
    gasEstimate: 1_500_000n,
    verifiedBlock: draft.verifiedBlock,
  }));
}

async function finalizedFrom(candidates: readonly ClaimCandidate[]) {
  const draft = prepareClaimPlan(prepareInput(candidates));
  return finalizeClaimPlan({ draft, simulations: passedSimulations(draft) });
}

describe("claim-plan preparation", () => {
  it("builds the two captured winning claimables into a 3,670 USDso plan", () => {
    const candidates = claimableFixture.claimable.value.map((row, index) => {
      const verified = claimableFixture.verifiedPositions.find(
        (position) =>
          position.indexed.market.id === row.marketId &&
          position.indexed.outcomeIndex === row.outcomeIdx,
      );
      if (verified === undefined) throw new Error("fixture position not found");
      const winningOutcome = verified.onchainMarket.value.winningOutcome;
      return claimCandidate({
        candidateId: `fixture-winner-${index}`,
        market: {
          chainId: CHAIN_ID,
          binaryModule: MODULE,
          marketId: asMarketId(row.marketId),
        },
        owner: asAddress(claimableFixture.wallet),
        outcomeIndex: row.outcomeIdx,
        tokenId: asTokenId(verified.indexed.tokenId),
        amount: asBaseUnit(row.amount),
        verifiedBalance: asBaseUnit(row.amount),
        pool: asAddress(row.pool),
        marketNonce: BigInt(verified.onchainMarket.value.nonce),
        collateral: asAddress(verified.onchainMarket.value.collateral),
        settlementBacking: asBaseUnit(verified.onchainMarket.value.backing),
        payoutVector: {
          numerators:
            winningOutcome === 0
              ? [asBaseUnit(10_000_000n), asBaseUnit(0n)]
              : [asBaseUnit(0n), asBaseUnit(10_000_000n)],
          denominator: asBaseUnit(10_000_000n),
        },
      });
    });
    const draft = prepareClaimPlan(prepareInput(candidates));
    expect(draft.entries).toHaveLength(2);
    expect(draft.expectedPayout).toBe(3_670_000_000n);
    expect(draft.approval).toEqual({
      required: true,
      scope: "module-wide",
      operator: MODULE,
    });
  });

  it("uses the captured void vector to refund both held outcomes", () => {
    const owner = asAddress(voidFixture.wallet);
    const candidates = voidFixture.verifiedClaimables.map((row, index) => {
      const onchain = row.onchainMarket.value;
      return claimCandidate({
        candidateId: `void-${index}`,
        market: {
          chainId: CHAIN_ID,
          binaryModule: MODULE,
          marketId: asMarketId(row.indexed.marketId),
        },
        owner,
        outcomeIndex: row.indexed.outcomeIdx,
        tokenId: asTokenId(row.indexed.outcomeIdx === 0 ? onchain.yesId : onchain.noId),
        amount: asBaseUnit(row.indexed.amount),
        verifiedBalance: asBaseUnit(row.balance.value),
        pool: asAddress(row.indexed.pool),
        marketNonce: BigInt(onchain.nonce),
        collateral: asAddress(onchain.collateral),
        contractStatus: "voided",
        isResolved: false,
        isVoided: true,
        settlementBacking: asBaseUnit(row.settlement.value.backing),
        payoutVector: {
          numerators: row.settlement.value.payoutNumerators.map(asBaseUnit),
          denominator: asBaseUnit(10_000_000n),
        },
        settlementFeeBpsTimes1k: asBaseUnit(row.settlement.value.settlementFeeBpsTimes1k),
      });
    });
    const draft = prepareClaimPlan(
      prepareInput(candidates, { owner, recipient: owner, operatorApproved: true }),
    );
    expect(draft.entries).toHaveLength(2);
    expect(draft.expectedPayout).toBe(2_400_000_000n);
    expect(draft.entries.every((entry) => entry.settlementFeeBpsTimes1k === 0n)).toBe(true);
    expect(draft.approval.required).toBe(false);
  });

  it.each([
    ["identity_mismatch", { owner: OTHER_OWNER }],
    ["already_redeemed", { alreadyRedeemed: true }],
    ["stale_evidence", { freshness: "stale" as const }],
    ["stale_evidence", { freshness: "unknown" as const }],
    ["evidence_conflict", { conflicts: ["pool mismatch"] }],
    ["non_terminal", { contractStatus: "locked" as const, isResolved: false }],
    ["non_finalized", { settlementFinalized: false }],
    ["zero_balance", { verifiedBalance: asBaseUnit(0n) }],
    ["zero_amount", { amount: asBaseUnit(0n) }],
    [
      "invalid_payout_vector",
      {
        payoutVector: {
          numerators: [asBaseUnit(2n), asBaseUnit(2n)],
          denominator: asBaseUnit(3n),
        },
      },
    ],
    [
      "zero_payout",
      {
        payoutVector: {
          numerators: [asBaseUnit(0n), asBaseUnit(10_000_000n)],
          denominator: asBaseUnit(10_000_000n),
        },
      },
    ],
    ["evidence_conflict", { contractStatus: "voided" as const }],
  ] as const)("excludes unsafe candidate as %s", (reason, overrides) => {
    const draft = prepareClaimPlan(prepareInput([claimCandidate(overrides)]));
    expect(draft.entries).toHaveLength(0);
    expect(draft.exclusions[0]?.reason).toBe(reason);
  });

  it("deduplicates the same source row and coalesces different partial rows", () => {
    const exact = claimCandidate({
      candidateId: "duplicate-1",
      amount: asBaseUnit(40n),
      verifiedBalance: asBaseUnit(100n),
    });
    const partial: ClaimCandidate = {
      ...exact,
      candidateId: "duplicate-2",
      amount: asBaseUnit(60n),
    };
    const draft = prepareClaimPlan(prepareInput([exact, exact, partial]));
    expect(draft.entries).toHaveLength(1);
    expect(draft.entries[0]?.amount).toBe(100n);
    expect(draft.entries[0]?.candidateIds).toEqual(["duplicate-1", "duplicate-2"]);
  });

  it("rejects cumulative duplicate burns above the verified balance", () => {
    const simulation = simulationsFixture.results.find(
      ({ name }) => name === "duplicate_full_over_total",
    );
    if (simulation === undefined) throw new Error("simulation fixture missing");
    const candidates = simulation.amounts.map((amount, index) =>
      claimCandidate({
        candidateId: `over-${index}`,
        market: {
          chainId: CHAIN_ID,
          binaryModule: MODULE,
          marketId: asMarketId(simulation.marketIds[index] ?? simulation.marketIds[0] ?? ""),
        },
        owner: asAddress(simulation.account),
        outcomeIndex: simulation.outcomeIdxs[index] ?? 0,
        amount: asBaseUnit(amount),
        verifiedBalance: asBaseUnit(simulation.amounts[0] ?? "0"),
      }),
    );
    const owner = asAddress(simulation.account);
    const draft = prepareClaimPlan(prepareInput(candidates, { owner, recipient: owner }));
    expect(draft.entries).toHaveLength(0);
    expect(draft.exclusions[0]?.reason).toBe("duplicate_over_balance");
  });

  it("removes the losing leg from the captured mixed winner/loser success case", () => {
    const simulation = simulationsFixture.results.find(
      ({ name }) => name === "mixed_winner_and_loser",
    );
    if (simulation === undefined) throw new Error("simulation fixture missing");
    const owner = asAddress(simulation.account);
    const candidates = simulation.amounts.map((amount, index) =>
      claimCandidate({
        candidateId: `mixed-${index}`,
        market: {
          chainId: CHAIN_ID,
          binaryModule: MODULE,
          marketId: asMarketId(simulation.marketIds[index] ?? ""),
        },
        owner,
        outcomeIndex: simulation.outcomeIdxs[index] ?? 0,
        tokenId: asTokenId(BigInt(index)),
        amount: asBaseUnit(amount),
        verifiedBalance: asBaseUnit(amount),
        payoutVector:
          index === 0
            ? {
                numerators: [asBaseUnit(10_000_000n), asBaseUnit(0n)],
                denominator: asBaseUnit(10_000_000n),
              }
            : {
                numerators: [asBaseUnit(0n), asBaseUnit(10_000_000n)],
                denominator: asBaseUnit(10_000_000n),
              },
      }),
    );
    const draft = prepareClaimPlan(prepareInput(candidates, { owner, recipient: owner }));
    expect(draft.entries).toHaveLength(1);
    expect(draft.exclusions).toHaveLength(1);
    expect(draft.exclusions[0]?.reason).toBe("zero_payout");
  });

  it("rejects conflicting duplicate evidence", () => {
    const first = claimCandidate({
      candidateId: "conflict-1",
      amount: asBaseUnit(40n),
      verifiedBalance: asBaseUnit(100n),
    });
    const second: ClaimCandidate = {
      ...first,
      candidateId: "conflict-2",
      verifiedBalance: asBaseUnit(99n),
    };
    const draft = prepareClaimPlan(prepareInput([first, second]));
    expect(draft.entries).toHaveLength(0);
    expect(draft.exclusions[0]?.reason).toBe("evidence_conflict");
  });

  it("rejects a market whose combined payouts exceed verified backing", () => {
    const candidate = claimCandidate({ settlementBacking: asBaseUnit(999_999n) });
    const draft = prepareClaimPlan(prepareInput([candidate]));
    expect(draft.entries).toHaveLength(0);
    expect(draft.exclusions[0]?.reason).toBe("insufficient_backing");
  });

  it("rejects cross-outcome positions with conflicting backing evidence", () => {
    const up = claimCandidate({
      candidateId: "backing-up",
      amount: asBaseUnit(50n),
      verifiedBalance: asBaseUnit(50n),
      settlementBacking: asBaseUnit(100n),
      payoutVector: {
        numerators: [asBaseUnit(5n), asBaseUnit(5n)],
        denominator: asBaseUnit(10n),
      },
    });
    const down: ClaimCandidate = {
      ...up,
      candidateId: "backing-down",
      outcomeIndex: 1,
      tokenId: asTokenId(1n),
      settlementBacking: asBaseUnit(99n),
    };
    const draft = prepareClaimPlan(prepareInput([up, down]));
    expect(draft.entries).toHaveLength(0);
    expect(draft.exclusions.map(({ reason }) => reason)).toEqual([
      "evidence_conflict",
      "evidence_conflict",
    ]);
  });

  it("splits only through the explicit tested batch policy", () => {
    const candidates = Array.from({ length: 101 }, (_, index) =>
      claimCandidate({
        candidateId: `batch-${index + 1}`,
        market: { chainId: CHAIN_ID, binaryModule: MODULE, marketId: marketId(index + 1) },
        tokenId: asTokenId(BigInt(index + 1)),
      }),
    );
    const draft = prepareClaimPlan(
      prepareInput(candidates, { batchPolicy: SHANNON_REDEEM_MANY_BATCH_POLICY }),
    );
    expect(draft.batches.map(({ entries }) => entries.length)).toEqual([100, 1]);
  });

  it("orders multiple exclusions deterministically", () => {
    const later = claimCandidate({
      candidateId: "excluded-later",
      market: { chainId: CHAIN_ID, binaryModule: MODULE, marketId: marketId(2) },
      tokenId: asTokenId(2n),
      alreadyRedeemed: true,
    });
    const earlier = claimCandidate({ candidateId: "excluded-earlier", amount: asBaseUnit(0n) });
    const draft = prepareClaimPlan(prepareInput([later, earlier]));
    expect(draft.exclusions.map(({ candidateIds }) => candidateIds[0])).toEqual([
      "excluded-earlier",
      "excluded-later",
    ]);
  });

  it.each([
    ["operator", { operatorId: -1 }],
    ["ttl", { ttlMs: 0 }],
    ["batch", { batchPolicy: { name: "bad", maxEntries: 0, evidenceReference: "none" } }],
    ["recipient", { recipient: OTHER_OWNER }],
  ] as const)("rejects invalid plan-level %s input", (_label, overrides) => {
    expect(() => prepareClaimPlan(prepareInput([claimCandidate()], overrides))).toThrow();
  });

  it("never emits a zero-paying entry or a total inconsistent with its entries", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 0n, max: 10n ** 18n }), { minLength: 1, maxLength: 30 }),
        (amounts) => {
          const candidates = amounts.map((amount, index) =>
            claimCandidate({
              candidateId: `property-${index + 1}`,
              market: {
                chainId: CHAIN_ID,
                binaryModule: MODULE,
                marketId: marketId(index + 1),
              },
              tokenId: asTokenId(BigInt(index + 1)),
              amount: asBaseUnit(amount),
              verifiedBalance: asBaseUnit(amount),
            }),
          );
          const draft = prepareClaimPlan(prepareInput(candidates));
          expect(draft.entries.every(({ expectedPayout }) => expectedPayout > 0n)).toBe(true);
          expect(draft.expectedPayout).toBe(
            draft.entries.reduce((sum, entry) => sum + entry.expectedPayout, 0n),
          );
        },
      ),
    );
  });
});

describe("claim-plan finalization and validation", () => {
  it("produces the same hash regardless of candidate input order", async () => {
    const first = claimCandidate({ candidateId: "ordered-1" });
    const second = claimCandidate({
      candidateId: "ordered-2",
      market: { chainId: CHAIN_ID, binaryModule: MODULE, marketId: marketId(2) },
      tokenId: asTokenId(2n),
    });
    const left = await finalizedFrom([first, second]);
    const right = await finalizedFrom([second, first]);
    expect(left.integrityHash).toBe(right.integrityHash);
  });

  it("requires one current passing simulation for every batch", async () => {
    const draft = prepareClaimPlan(prepareInput([claimCandidate()]));
    await expect(finalizeClaimPlan({ draft, simulations: [] })).rejects.toThrow(
      "exactly one simulation",
    );
    await expect(
      finalizeClaimPlan({
        draft,
        simulations: [
          {
            status: "failed",
            batchIndex: 0,
            reason: "InsufficientPermission",
            verifiedBlock: draft.verifiedBlock,
          },
        ],
      }),
    ).rejects.toThrow("simulation failed");
    await expect(
      finalizeClaimPlan({
        draft,
        simulations: [
          {
            status: "passed",
            batchIndex: 0,
            gasEstimate: 1n,
            verifiedBlock: asBlockNumber(draft.verifiedBlock - 1n),
          },
        ],
      }),
    ).rejects.toThrow("older than the plan evidence");
  });

  it("matches simulations by batch and stores them in deterministic order", async () => {
    const candidates = Array.from({ length: 2 }, (_, index) =>
      claimCandidate({
        candidateId: `simulation-order-${index}`,
        market: { chainId: CHAIN_ID, binaryModule: MODULE, marketId: marketId(index + 1) },
        tokenId: asTokenId(BigInt(index + 1)),
      }),
    );
    const draft = prepareClaimPlan(
      prepareInput(candidates, {
        batchPolicy: { name: "one", maxEntries: 1, evidenceReference: "fixture:test" },
      }),
    );
    const simulations = passedSimulations(draft).reverse();
    const plan = await finalizeClaimPlan({ draft, simulations });
    expect(plan.simulations.map(({ batchIndex }) => batchIndex)).toEqual([0, 1]);

    await expect(
      finalizeClaimPlan({
        draft,
        simulations: simulations.map((simulation) => ({ ...simulation, batchIndex: 99 })),
      }),
    ).rejects.toThrow("has no simulation");
  });

  it("rejects finalization of an empty draft", async () => {
    const draft = prepareClaimPlan(prepareInput([]));
    await expect(finalizeClaimPlan({ draft, simulations: [] })).rejects.toThrow("empty");
  });

  it("validates expiry, owner, evidence block and content integrity", async () => {
    const plan = await finalizedFrom([claimCandidate()]);
    const valid = await validateClaimPlan({
      plan,
      now: asTimestampMs(plan.createdAt + 1),
      connectedWallet: OWNER,
      minimumVerifiedBlock: plan.verifiedBlock,
    });
    expect(valid).toEqual({ valid: true, reasons: [] });

    const invalid = await validateClaimPlan({
      plan: { ...plan, expectedPayout: asBaseUnit(plan.expectedPayout + 1n) },
      now: plan.expiresAt,
      connectedWallet: OTHER_OWNER,
      minimumVerifiedBlock: asBlockNumber(plan.verifiedBlock + 1n),
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.reasons).toEqual([
      "claim plan has expired",
      "connected wallet does not match the claim owner",
      "claim plan was built from stale chain state",
      "claim plan integrity hash does not match its contents",
    ]);
  });

  it("hashes arbitrary deterministic plans consistently", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.bigInt({ min: 1n, max: 10n ** 12n }), { minLength: 1, maxLength: 12 }),
        async (amounts) => {
          const candidates = amounts.map((amount, index) =>
            claimCandidate({
              candidateId: `hash-${index + 1}`,
              market: {
                chainId: CHAIN_ID,
                binaryModule: MODULE,
                marketId: marketId(index + 1),
              },
              tokenId: asTokenId(BigInt(index + 1)),
              amount: asBaseUnit(amount),
              verifiedBalance: asBaseUnit(amount),
              pool: POOL,
              collateral: COLLATERAL,
            }),
          );
          const forward = await finalizedFrom(candidates);
          const reverse = await finalizedFrom([...candidates].reverse());
          expect(forward.integrityHash).toBe(reverse.integrityHash);
        },
      ),
      { numRuns: 40 },
    );
  });
});
