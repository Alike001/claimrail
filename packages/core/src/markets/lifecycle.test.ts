import { describe, expect, it } from "vitest";
import {
  deriveMarketLifecycle,
  isTerminalContractStatus,
  normalizeContractStatus,
  reconcileMarketLifecycle,
} from "./lifecycle.js";

describe("DreamDEX contract lifecycle", () => {
  it.each([
    [0, "listed"],
    [1, "trading"],
    [2, "locked"],
    [3, "settling"],
    [4, "resolved"],
    [5, "voided"],
  ] as const)("normalizes contract status %s as %s", (raw, expected) => {
    expect(normalizeContractStatus(raw)).toBe(expected);
    expect(normalizeContractStatus(String(raw))).toBe(expected);
    expect(normalizeContractStatus(expected.toUpperCase())).toBe(expected);
  });

  it("derives finalized separately from the six-value contract enum", () => {
    expect(deriveMarketLifecycle("resolved", false)).toBe("resolved");
    expect(deriveMarketLifecycle("resolved", true)).toBe("finalized");
    expect(isTerminalContractStatus("resolved")).toBe(true);
    expect(isTerminalContractStatus("voided")).toBe(true);
    expect(isTerminalContractStatus("locked")).toBe(false);
  });

  it.each([-1, 6, "Finalized", "unknown"])("rejects unknown contract status %s", (value) => {
    expect(() => normalizeContractStatus(value)).toThrow(RangeError);
  });

  it("records lifecycle conflicts without erasing the raw contract state", () => {
    const result = reconcileMarketLifecycle({
      contractStatus: "locked",
      settlementFinalized: true,
      isResolved: true,
      isVoided: true,
      indexedStatus: "Trading",
    });
    expect(result).toMatchObject({
      contractStatus: "locked",
      settlementFinalized: true,
      lifecycle: "finalized",
      terminal: true,
    });
    expect(result.conflicts).toContain("market cannot be resolved and voided simultaneously");
  });

  it("flags an indexed Finalized label when permanent settlement is absent", () => {
    const result = reconcileMarketLifecycle({
      contractStatus: "resolved",
      settlementFinalized: false,
      isResolved: true,
      isVoided: false,
      indexedStatus: "Finalized",
    });
    expect(result.conflicts).toEqual([
      "indexer reports Finalized but permanent settlement is not finalized",
    ]);
  });

  it.each([
    ["resolved", false, false, "resolved contract status is missing the resolved flag"],
    ["voided", false, false, "voided contract status is missing the voided flag"],
    ["locked", false, true, "permanent settlement is finalized before a terminal market result"],
  ] as const)(
    "detects inconsistent %s terminal evidence",
    (status, isResolved, finalized, reason) => {
      const result = reconcileMarketLifecycle({
        contractStatus: status,
        settlementFinalized: finalized,
        isResolved,
        isVoided: false,
      });
      expect(result.conflicts).toContain(reason);
    },
  );
});
