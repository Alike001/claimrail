import type { CanonicalDeliveryEvent } from "@claimrail/contracts";
import { describe, expect, it, vi } from "vitest";
import { DreamDexClaimRailAdapter } from "./adapter.js";

const marketId = `0x${"12".repeat(32)}`;
const claimId = `claim:0x${"34".repeat(32)}`;

function event(
  id: string,
  type: CanonicalDeliveryEvent["type"],
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): CanonicalDeliveryEvent {
  return {
    id,
    schemaVersion: "1",
    type,
    aggregateType,
    aggregateId,
    occurredAt: "2026-09-04T08:00:00.000Z",
    payload,
    sourceTransactionHash: null,
    sourceLogIndex: null,
    blockNumber: "478725909",
  };
}

describe("DreamDEX Bot Kit settlement adapter", () => {
  it("pauses at lock and resumes only after the requested claim is confirmed", async () => {
    const pauseMarket = vi.fn();
    const requestOwnerApprovedClaim = vi.fn(async () => ({ claimId }));
    const resumeMarket = vi.fn();
    const adapter = new DreamDexClaimRailAdapter({
      pauseMarket,
      requestOwnerApprovedClaim,
      resumeMarket,
    });

    await adapter.accept(event("locked-1", "market.locked", "market", marketId, { marketId }));
    expect(adapter.canTrade(marketId)).toBe(false);
    await adapter.accept(
      event("claimable-1", "wallet.claimable", "position", "position-1", { marketId }),
    );
    await adapter.accept(event("submitted-1", "claim.submitted", "claim", claimId, { claimId }));
    expect(resumeMarket).not.toHaveBeenCalled();
    await adapter.accept(event("confirmed-1", "claim.confirmed", "claim", claimId, { claimId }));
    expect(adapter.canTrade(marketId)).toBe(true);
    expect(resumeMarket).toHaveBeenCalledWith(expect.objectContaining({ marketId, claimId }));
  });

  it("deduplicates deliveries and keeps failed claims paused", async () => {
    const pauseMarket = vi.fn();
    const requestOwnerApprovedClaim = vi.fn(async () => ({ claimId }));
    const resumeMarket = vi.fn();
    const needsAttention = vi.fn();
    const adapter = new DreamDexClaimRailAdapter({
      pauseMarket,
      requestOwnerApprovedClaim,
      resumeMarket,
      needsAttention,
    });
    const claimable = event("claimable-1", "wallet.claimable", "position", "position-1", {
      marketId,
    });
    await adapter.accept(claimable);
    await adapter.accept(claimable);
    await adapter.accept(event("failed-1", "claim.failed", "claim", claimId, { claimId }));
    expect(requestOwnerApprovedClaim).toHaveBeenCalledOnce();
    expect(adapter.canTrade(marketId)).toBe(false);
    expect(resumeMarket).not.toHaveBeenCalled();
    expect(needsAttention).toHaveBeenCalledWith(expect.objectContaining({ marketId, claimId }));
  });
});
