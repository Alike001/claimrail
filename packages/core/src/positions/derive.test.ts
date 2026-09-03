import { describe, expect, it } from "vitest";
import { asBaseUnit } from "../identity/types.js";
import { CHAIN_ID, MODULE, OWNER, marketId } from "../test-support/factories.js";
import { deriveWalletPositionState, outcomeSide, positionIdentity } from "./derive.js";

const defaults = {
  contractStatus: "resolved" as const,
  settlementFinalized: true,
  isResolved: true,
  isVoided: false,
  verifiedBalance: asBaseUnit(1n),
  payoutNumerator: asBaseUnit(1n),
};

describe("wallet position derivation", () => {
  it.each([
    [{ contractStatus: "listed" }, "open"],
    [{ contractStatus: "trading" }, "open"],
    [{ contractStatus: "locked", isResolved: false }, "locked"],
    [{ contractStatus: "settling", isResolved: false }, "locked"],
    [{ contractStatus: "resolved", settlementFinalized: false }, "winning_unfinalized"],
    [{ payoutNumerator: asBaseUnit(0n) }, "losing"],
    [{ isResolved: false, isVoided: true, contractStatus: "voided" }, "void_refundable"],
    [{ claimStatus: "submitted" }, "claim_submitted"],
    [{ claimStatus: "confirmed" }, "redeemed"],
    [{ payoutOwed: asBaseUnit(10n) }, "payout_owed"],
  ] as const)("derives %s as %s", (overrides, expected) => {
    expect(deriveWalletPositionState({ ...defaults, ...overrides })).toBe(expected);
  });

  it("does not infer a win from non-terminal flags", () => {
    expect(
      deriveWalletPositionState({
        ...defaults,
        contractStatus: "resolved",
        isResolved: false,
      }),
    ).toBe("locked");
  });

  it("maps outcome sides and creates case-insensitive stable identities", () => {
    expect(outcomeSide(0)).toBe("up");
    expect(outcomeSide(1)).toBe("down");
    expect(
      positionIdentity(
        { chainId: CHAIN_ID, binaryModule: MODULE, marketId: marketId(1) },
        OWNER.toUpperCase(),
        0,
      ),
    ).toBe(`${CHAIN_ID}:${MODULE}:${marketId(1)}:${OWNER}:0`);
  });
});
