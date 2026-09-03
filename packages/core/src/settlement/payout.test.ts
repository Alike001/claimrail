import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asBaseUnit } from "../identity/types.js";
import { BPS_TIMES_1K_DENOMINATOR, calculatePayout, validatePayoutVector } from "./payout.js";

const vector = (yes: bigint, no: bigint, denominator = yes + no) => ({
  numerators: [asBaseUnit(yes), asBaseUnit(no)],
  denominator: asBaseUnit(denominator),
});

describe("integer payout mathematics", () => {
  it("pays a winner and excludes a loser from value", () => {
    const winner = calculatePayout({
      amount: asBaseUnit(2_970_000_000n),
      outcomeIndex: 0,
      payoutVector: vector(10_000_000n, 0n),
    });
    const loser = calculatePayout({
      amount: asBaseUnit(450_000_000n),
      outcomeIndex: 1,
      payoutVector: vector(10_000_000n, 0n),
    });
    expect(winner.expectedPayout).toBe(2_970_000_000n);
    expect(loser.expectedPayout).toBe(0n);
  });

  it("uses the captured uniform void vector for both sides", () => {
    const payoutVector = vector(5_000_000n, 5_000_000n);
    for (const outcomeIndex of [0, 1] as const) {
      const result = calculatePayout({
        amount: asBaseUnit(2_400_000_000n),
        outcomeIndex,
        payoutVector,
        settlementFeeBpsTimes1k: asBaseUnit(999_000n),
      });
      expect(result.expectedPayout).toBe(1_200_000_000n);
      expect(result.settlementFeeBpsTimes1k).toBe(999_000n);
    }
  });

  it("uses the already fee-scaled settlement vector with one integer division", () => {
    const result = calculatePayout({
      amount: asBaseUnit(1_000_001n),
      outcomeIndex: 0,
      payoutVector: vector(9_975_000n, 0n, 10_000_000n),
      settlementFeeBpsTimes1k: asBaseUnit(25_000n),
    });
    expect(result.expectedPayout).toBe(997_500n);
    expect(result.settlementFeeBpsTimes1k).toBe(25_000n);
  });

  it("handles mixed token decimals because all math stays in base units", () => {
    const sixDecimal = calculatePayout({
      amount: asBaseUnit(1_234_567n),
      outcomeIndex: 0,
      payoutVector: vector(3n, 1n, 4n),
    });
    const eighteenDecimal = calculatePayout({
      amount: asBaseUnit(1_234_567_000_000_000_000n),
      outcomeIndex: 0,
      payoutVector: vector(3n, 1n, 4n),
    });
    expect(sixDecimal.expectedPayout).toBe(925_925n);
    expect(eighteenDecimal.expectedPayout).toBe(925_925_250_000_000_000n);
  });

  it.each([
    { payoutVector: vector(0n, 0n, 0n), caseName: "denominator" },
    { payoutVector: vector(10n, 0n, 5n), caseName: "numerator" },
    { payoutVector: vector(6n, 6n, 10n), caseName: "sum" },
    {
      payoutVector: { numerators: [asBaseUnit(10n)], denominator: asBaseUnit(10n) },
      caseName: "outcomes",
    },
  ] as const)("rejects a malformed payout vector ($caseName)", ({ payoutVector }) => {
    expect(() => validatePayoutVector(payoutVector)).toThrow(RangeError);
  });

  it("rejects invalid expected counts, outcome indices and fee rates", () => {
    expect(() => validatePayoutVector(vector(1n, 0n), 0)).toThrow(RangeError);
    expect(() =>
      calculatePayout({
        amount: asBaseUnit(1n),
        outcomeIndex: 2,
        payoutVector: vector(1n, 0n),
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculatePayout({
        amount: asBaseUnit(1n),
        outcomeIndex: 0,
        payoutVector: vector(1n, 0n),
        settlementFeeBpsTimes1k: asBaseUnit(BPS_TIMES_1K_DENOMINATOR + 1n),
      }),
    ).toThrow(RangeError);
  });

  it("never pays more than the burned amount for any valid binary vector", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 30n }),
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        fc.integer({ min: 0, max: 1 }),
        fc.bigInt({ min: 0n, max: BPS_TIMES_1K_DENOMINATOR }),
        (amount, yesNumerator, outcomeIndex, feeRate) => {
          const result = calculatePayout({
            amount: asBaseUnit(amount),
            outcomeIndex,
            payoutVector: vector(yesNumerator, 10_000_000n - yesNumerator),
            settlementFeeBpsTimes1k: asBaseUnit(feeRate),
          });
          expect(result.expectedPayout).toBeLessThanOrEqual(amount);
          expect(result.expectedPayout).toBeGreaterThanOrEqual(0n);
        },
      ),
    );
  });
});
