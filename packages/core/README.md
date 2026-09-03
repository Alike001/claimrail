# `@claimrail/core`

ClaimRail Core is the dependency-free truth layer shared by the indexer, API, web interface, notifications, bots, games, and agents. It contains no DreamDEX SDK, RPC, database, React, wallet, or transaction runtime.

## Responsibilities

- Normalize the six DreamDEX contract states while preserving settlement finality separately.
- Represent missing, pending, conflicting, stale, partial, and verified evidence explicitly.
- Derive wallet-position states from canonical market, balance, payout, claim, and fallback evidence.
- Calculate expected redemption in integer base units from the deployed payout vector.
- Prepare deterministic claim batches and explicit exclusions.
- Finalize a short-lived integrity-hashed plan only after every batch simulation passes.
- Create stable canonical event identities for all product consumers.

## Critical payout rule

The finalized DreamDEX settlement vector is already fee-scaled. Core calculates:

```text
expectedPayout = amount × payoutNumerator[outcomeIndex] ÷ payoutDenominator
```

All values are `bigint`, and division uses contract-compatible integer flooring. `settlementFeeBpsTimes1k` remains on the record for auditability; it is not deducted a second time. A uniform void observed on Shannon uses `[5_000_000, 5_000_000] / 10_000_000`, so both held sides can pay.

## Claim planning boundary

Planning is deliberately split:

1. `prepareClaimPlan` deduplicates source rows, coalesces partial burns, rejects unsafe candidates, reconciles cumulative balances and settlement backing, orders entries, and applies an evidence-backed batch policy.
2. The DreamDEX adapter simulates each prepared `redeemMany` batch from the owner address.
3. `finalizeClaimPlan` accepts only one passing simulation per batch at an equal-or-newer block and adds a deterministic SHA-256 integrity hash.
4. `validateClaimPlan` rejects expiry, owner mismatch, stale verified blocks, or changed contents immediately before signing.

Core never signs or broadcasts a transaction.

## Verification

```bash
pnpm --filter @claimrail/core typecheck
pnpm test:core:coverage
```

The coverage gate requires at least 95% statements/functions/lines and 90% branches. Captured DreamDEX fixtures remain read-only test evidence and cannot be imported as production data.
