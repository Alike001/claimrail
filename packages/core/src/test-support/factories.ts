import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asChainId,
  asMarketId,
  asTimestampMs,
  asTokenId,
  asVenueId,
} from "../identity/types.js";
import type { ClaimCandidate, PrepareClaimPlanInput } from "../claims/types.js";

export const CHAIN_ID = asChainId(50_312);
export const MODULE = asAddress("0x3ecc694cef705358864a646142ac17a90e29e388");
export const OWNER = asAddress("0xe1DA3bdD4189FDEfB2eF8A73bd37A4083F284477");
export const OTHER_OWNER = asAddress("0x4356f421bfaf8bfeef5188c3a511ad79a5947c67");
export const VENUE_ID = asVenueId(
  "0x1a1e6821cde7d0159c0d293177871e09677b4e42307c7db3ba94f8648a5a050f",
);
export const POOL = asAddress("0x5b95229d893135d9af01e9b4a126caf861f254d5");
export const COLLATERAL = asAddress("0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e");
export const OUTCOME_TOKEN = asAddress("0xb52c5934113af5c0bb20eb3c72290c8215f755b9");

export function marketId(index: number) {
  return asMarketId(`0x${index.toString(16).padStart(64, "0")}`);
}

export function claimCandidate(overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  const index = Number(overrides.candidateId?.replace(/\D/g, "")) || 1;
  return {
    candidateId: `candidate-${index}`,
    market: { chainId: CHAIN_ID, binaryModule: MODULE, marketId: marketId(index) },
    owner: OWNER,
    venueId: VENUE_ID,
    operatorId: 4,
    outcomeIndex: 0,
    tokenId: asTokenId(BigInt(index) * 2n),
    outcomeToken: OUTCOME_TOKEN,
    amount: asBaseUnit(1_000_000n),
    verifiedBalance: asBaseUnit(1_000_000n),
    pool: POOL,
    marketNonce: BigInt(index),
    collateral: COLLATERAL,
    contractStatus: "resolved",
    isResolved: true,
    isVoided: false,
    settlementFinalized: true,
    settlementBacking: asBaseUnit(10n ** 30n),
    payoutVector: {
      numerators: [asBaseUnit(10_000_000n), asBaseUnit(0n)],
      denominator: asBaseUnit(10_000_000n),
    },
    settlementFeeBpsTimes1k: asBaseUnit(0n),
    alreadyRedeemed: false,
    freshness: "fresh",
    conflicts: [],
    evidenceVersion: "fixture-v1",
    ...overrides,
  };
}

export function prepareInput(
  candidates: readonly ClaimCandidate[],
  overrides: Partial<PrepareClaimPlanInput> = {},
): PrepareClaimPlanInput {
  return {
    chainId: CHAIN_ID,
    binaryModule: MODULE,
    outcomeToken: OUTCOME_TOKEN,
    venueId: VENUE_ID,
    operatorId: 4,
    owner: OWNER,
    recipient: OWNER,
    operatorApproved: false,
    candidates,
    discoveryCompleteness: "complete",
    verifiedBlock: asBlockNumber(478_582_638n),
    now: asTimestampMs(1_788_430_000_000),
    ttlMs: 60_000,
    batchPolicy: {
      name: "test",
      maxEntries: 100,
      evidenceReference: "fixture:test",
    },
    ...overrides,
  };
}
