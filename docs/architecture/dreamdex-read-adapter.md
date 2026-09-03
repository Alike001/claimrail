# DreamDEX read adapter

This is the technical documentation for ClaimRail Phase 3. A browsable `/docs`
product site is planned for Phase 9; this file is its source material.

## Purpose

`@claimrail/dreamdex` turns three imperfect views into one evidence-bearing model:

```text
DreamDEX indexer ── discovers positions, markets, history, oracle context
Somnia chain ────── verifies current wiring, lifecycle, and ERC-6909 balances
BinarySettlement ── verifies finality, payout vector, fee, and remaining backing
                              │
                              ▼
                         ClaimRail Core
```

The indexer is useful for discovery but is not allowed to authorize a financial
action by itself. The current chain and permanent settlement record are the action
gates. Any disagreement remains attached to the record and prevents a position
from becoming a verified claim candidate.

## Public service boundary

```ts
const result = await service.readWallet("0x...");
```

The call needs only a public address. It returns:

- the raw exhaustive discovery result and its next offset when incomplete;
- canonical wallet positions with current ERC-6909 balances;
- reconciled markets and evidence conflicts;
- only claimable, positive-payout, finalized, conflict-free claim candidates;
- current module-wide operator approval when it can be read.

Convenience methods expose `listWalletPositions(address)`,
`listClaimCandidates(address)`, and `explainSettlement(marketId)`.

## Identity and recycled pools

A pool is reusable and therefore is not a market identity. ClaimRail keys a market
by `(chainId, binaryModule, marketId)`. The pair `(pool, marketNonce)` identifies
that market's historical slice of the pool and determines its ERC-6909 outcome IDs:

```text
outcomeId = (pool << 72) | (marketNonce << 8) | outcomeIndex
marketKey = outcomeId >> 8
```

This prevents an old position from being accidentally matched to the new market
currently using the same pool.

## Exhaustive discovery

SDK `getPortfolio()` reads at most 200 positive outcome balances. ClaimRail owns a
paginated `OutcomeBalance` query ordered by immutable row ID. It reads until a
short page, deduplicates row IDs, and refuses to say `complete` after a timeout,
abort, transport error, or max-page stop. A partial result includes the offset from
which a caller can resume.

## Finalization ABI

The deployed Shannon event is:

```solidity
event MarketFinalized(
  uint256 indexed marketKey,
  address indexed pool,
  uint64 nonce,
  address collateralToken,
  uint256 netBacking,
  bool voided,
  uint256[] payoutNumerators
);
```

Its topic is
`0xb1884334e955f8d8727678d4fa52dd9fc7140ff5e4ad38d358453bd400ada178`.
SDK `0.29.0` still ends its event ABI with the older `uint8 winningOutcome`, so
ClaimRail uses a local read-only fragment with a captured-log regression test.

The event's `netBacking` is the starting permanent pot. The settlement record's
current `backing` decreases after redemptions. A lower current value is expected;
an increase above the event value is a conflict.

## Safety boundary

This phase contains no signer, private key, WalletClient, signature, transaction
construction, or contract write. It finds and explains claimable funds. Phase 6
will add manual user-signed redemption planning and simulation without weakening
this read boundary.
