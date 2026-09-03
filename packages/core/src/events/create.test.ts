import { describe, expect, it } from "vitest";
import { asBaseUnit, asTimestampMs } from "../identity/types.js";
import { CHAIN_ID, OWNER, marketId } from "../test-support/factories.js";
import { createCanonicalEvent } from "./create.js";

describe("canonical event envelope", () => {
  it("deduplicates the same state transition independently of delivery time and payload", async () => {
    const base = {
      schemaVersion: "1" as const,
      type: "wallet.claimable" as const,
      createdAt: asTimestampMs(1000),
      chainId: CHAIN_ID,
      stateVersion: "block:42",
      wallet: OWNER,
      marketId: marketId(1),
      outcomeIndex: 0 as const,
      amount: { raw: asBaseUnit(10n), decimals: 6, symbol: "USDso" },
      evidenceLinks: ["https://example.test/evidence"],
      payload: { reason: "winner" },
    };
    const first = await createCanonicalEvent(base);
    const repeated = await createCanonicalEvent({
      ...base,
      createdAt: asTimestampMs(2000),
      payload: { reason: "delivery retry" },
    });
    expect(first.id).toBe(repeated.id);
    expect(first.payload).toEqual({ reason: "winner" });
  });

  it("changes identity when the canonical position transition changes", async () => {
    const base = {
      schemaVersion: "1" as const,
      type: "wallet.claimable" as const,
      createdAt: asTimestampMs(1000),
      chainId: CHAIN_ID,
      stateVersion: "block:42",
      wallet: OWNER,
      marketId: marketId(1),
      evidenceLinks: [],
      payload: {},
    };
    const up = await createCanonicalEvent({ ...base, outcomeIndex: 0 });
    const down = await createCanonicalEvent({ ...base, outcomeIndex: 1 });
    expect(up.id).not.toBe(down.id);
  });
});
