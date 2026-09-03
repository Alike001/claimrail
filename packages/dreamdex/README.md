# `@claimrail/dreamdex`

ClaimRail's signer-free DreamDEX adapter. It converts DreamDEX indexer and Somnia
contract data into the evidence-bearing records in `@claimrail/core`, simulates
exact user-owned claims, and reconciles transaction receipts without ever
constructing a wallet client.

The package deliberately separates three sources:

- The DreamDEX indexer discovers markets, positions, history, and oracle context.
- Current Somnia chain reads verify market wiring, lifecycle, and ERC-6909 balances.
- `BinarySettlement` verifies finalization, remaining backing, fees, and payout vectors.

`ClaimRailReadService.readWallet(address)` is the main application boundary. It
accepts any public address and returns an honest `complete`, `partial`, or `failed`
scan, normalized positions, reconciled markets, and only fully verified claim
candidates. It never constructs a signer or submits a transaction.

## Why pagination is owned here

DreamDEX SDK `0.29.0` limits `getPortfolio()` to 200 positive outcome balances.
ClaimRail queries `OutcomeBalance` directly with `id: asc`, offset pagination,
deduplication, per-page timeouts, abort support, and a maximum-page safety limit.
The captured large-wallet fixture proves 1,044 unique rows over eleven pages.

## Deployed event override

The Shannon `BinarySettlement.MarketFinalized` event ends with
`uint256[] payoutNumerators`. SDK `0.29.0` still describes that event with a
legacy `uint8 winningOutcome`. ClaimRail owns the verified local event fragment
and pins topic
`0xb1884334e955f8d8727678d4fa52dd9fc7140ff5e4ad38d358453bd400ada178`
in a regression test.

## Commands

```sh
pnpm --filter @claimrail/dreamdex typecheck
pnpm --filter @claimrail/dreamdex test:coverage
pnpm --filter @claimrail/dreamdex smoke:shannon
```

The smoke command performs public, read-only Shannon calls. It has no private-key
or wallet configuration.

## Claim and receipt boundary

`ClaimRailClaimService` creates a plan only from a complete, fresh wallet scan.
It returns the exact ERC-6909 operator requirement before simulation, or simulates
every `redeemMany` batch and produces a short-lived integrity hash. The browser,
not this package, asks the owner wallet to sign.

`reconcileClaimReceipt` independently checks the mined receipt, deployed
`Redeemed` events, amounts burned, collateral returned, post-claim ERC-6909
balances, settlement backing, block timestamp, gas, and current `owed` balance.
A missing hash is called `superseded` only after the sender's verified nonce has
been consumed by another mined transaction.
