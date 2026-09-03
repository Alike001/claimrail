import { asBaseUnit, type BaseUnit } from "../identity/types.js";
import type { PayoutVectorRecord } from "../markets/types.js";

export const BPS_TIMES_1K_DENOMINATOR = 10_000_000n;

export interface PayoutCalculation {
  readonly amount: BaseUnit;
  readonly payoutNumerator: BaseUnit;
  readonly payoutDenominator: BaseUnit;
  readonly settlementFeeBpsTimes1k: BaseUnit;
  readonly expectedPayout: BaseUnit;
}

export interface CalculatePayoutInput {
  readonly amount: BaseUnit;
  readonly outcomeIndex: number;
  readonly payoutVector: PayoutVectorRecord;
  readonly settlementFeeBpsTimes1k?: BaseUnit;
}

export function validatePayoutVector(
  payoutVector: PayoutVectorRecord,
  expectedOutcomeCount = 2,
): PayoutVectorRecord {
  if (!Number.isSafeInteger(expectedOutcomeCount) || expectedOutcomeCount <= 0) {
    throw new RangeError("expectedOutcomeCount must be a positive integer");
  }
  if (payoutVector.denominator <= 0n) {
    throw new RangeError("payout denominator must be positive");
  }
  if (payoutVector.numerators.length !== expectedOutcomeCount) {
    throw new RangeError(`payout vector must contain ${expectedOutcomeCount} outcomes`);
  }

  let total = 0n;
  for (const numerator of payoutVector.numerators) {
    if (numerator < 0n || numerator > payoutVector.denominator) {
      throw new RangeError("payout numerator must be between zero and the denominator");
    }
    total += numerator;
  }
  if (total === 0n || total > payoutVector.denominator) {
    throw new RangeError(
      "payout numerators must have a positive sum no greater than the denominator",
    );
  }
  return payoutVector;
}

/**
 * Calculates redemption directly from the finalized settlement vector.
 * The deployed vector is already fee-scaled; the fee rate is retained only
 * as audit evidence and must never be deducted a second time.
 */
export function calculatePayout(input: CalculatePayoutInput): PayoutCalculation {
  const vector = validatePayoutVector(input.payoutVector);
  const numerator = vector.numerators[input.outcomeIndex];
  if (numerator === undefined) {
    throw new RangeError(`outcome index ${input.outcomeIndex} is outside the payout vector`);
  }

  const feeRate = input.settlementFeeBpsTimes1k ?? asBaseUnit(0n);
  if (feeRate > BPS_TIMES_1K_DENOMINATOR) {
    throw new RangeError("settlement fee cannot exceed 100%");
  }

  const expectedPayout = (input.amount * numerator) / vector.denominator;

  return {
    amount: input.amount,
    payoutNumerator: numerator,
    payoutDenominator: vector.denominator,
    settlementFeeBpsTimes1k: feeRate,
    expectedPayout: asBaseUnit(expectedPayout),
  };
}
