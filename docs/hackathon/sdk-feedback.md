# DreamDEX SDK and documentation feedback

Prepared for the Somnia × DreamDEX Event Contracts Hackathon from live Shannon testnet research
performed September 3–8, 2026. The investigation began read-only and concluded with one controlled,
owner-signed `redeemMany` claim whose receipt was independently reconciled by ClaimRail.

## Test environment

| Item     | Value                                                                             |
| -------- | --------------------------------------------------------------------------------- |
| Package  | `@somnia-chain/markets-sdk@0.29.0`                                                |
| Network  | Somnia Shannon testnet                                                            |
| Chain ID | `50312`                                                                           |
| Method   | Indexer, RPC, WebSocket RPC, reads, logs, simulations, and one owner-signed claim |

The reproducible collector and simulator are under [`probes/event-contracts`](../../probes/event-contracts/README.md).
They accept no private key and cannot broadcast transactions.

## What worked well

- `SomniaMarkets` provides a useful single entry point for indexed and on-chain market reads.
- Exact bigint values and exported chain/address configuration made independent verification
  practical.
- `redeemMany` and operator-permission ABIs were sufficient to simulate the exact owner action.
- The indexer's `OutcomeBalance` query supports ordered `limit`/`offset` pagination even though the
  higher-level portfolio method does not expose it.
- Shannon produced enough public market, settlement, redemption, and void data to build realistic
  regression fixtures.

## Findings and recommendations

### 1. `MarketFinalized` event ABI does not match the Shannon deployment — high priority

The deployed `BinarySettlement` event ends with `uint256[] payoutNumerators`:

```text
MarketFinalized(uint256,address,uint64,address,uint256,bool,uint256[])
topic0: 0xb1884334e955f8d8727678d4fa52dd9fc7140ff5e4ad38d358453bd400ada178
```

SDK `0.29.0` declares a final `uint8 winningOutcome`, which produces a different topic. A consumer
using only the published event ABI can silently miss every deployed finalization log.

Recommendation: update the published ABI, add a deployed-topic regression test per supported
network, and version the event shape when older deployments differ. ClaimRail currently carries a
verified local ABI fragment and preserves the raw payout vector.

### 2. Portfolio and claimable discovery stop at 200 positions — high priority

`getPortfolio(address)` requests at most 200 positive outcome balances and exposes no position
cursor or offset. `getClaimable(address)` derives from that response and inherits the limit.

A public Shannon wallet returned 1,044 unique positive `OutcomeBalance` rows across eleven ordered
pages: ten pages of 100 and one page of 44. This is a demonstrated omission for larger wallets.

Recommendation: expose cursor/offset pagination or an async iterator, return an explicit
`complete`/`hasMore` signal, and ensure `getClaimable` either exhausts all pages or states its cap.
ClaimRail pages the GraphQL rows directly, deduplicates them, and never labels a capped scan as
complete.

### 3. `createClient` documentation and root exports disagree — medium priority

`dist/createClient.d.ts` documents a root import for `createClient`, but the package root declaration
does not export that symbol. The reliable path is `new SomniaMarkets(config).client`.

Recommendation: either export `createClient` from the package root or update the declaration example
to use the supported `SomniaMarkets` entry point. Add a package-exports compile test for documented
imports.

### 4. `SomniaMarkets.close()` can leave a WebSocket transport open — medium priority

After a one-shot chain read, calling `SomniaMarkets.close()` stopped SDK watches but did not close the
lazily created viem WebSocket RPC client. A CLI probe remained alive until it explicitly closed that
underlying client.

Recommendation: make `close()` release every transport owned by the instance, document ownership
when a caller supplies a transport, and add a process-exit test after one WebSocket-backed read.

### 5. Lifecycle terminology needs one canonical diagram — medium priority

On Shannon, a market contract can remain numeric `Resolved` while the indexer calls the market
`Finalized` after the permanent settlement record is created. During one capture, the indexer still
said `Trading` while current chain state already showed a finalized payout vector.

Recommendation: document indexed status, market-contract status, and settlement finalization as
separate facts. State that indexer results are excellent for discovery but current contract state
should gate financial actions.

### 6. Pool recycling should be prominent in identity guidance — medium priority

The same pool address is reused across markets, with a changing market nonce. Treating the pool as a
stable market ID can attach old events to a new prediction.

Recommendation: show a canonical identity recipe in the Event Contract docs. ClaimRail uses
`chainId + binaryModule + marketId` for a market, and keeps pool plus nonce as time-varying evidence.

### 7. The combined market-resolution query can time out under public-indexer load — medium priority

On September 8, the public Shannon indexer and Somnia RPC both answered health-sized requests, but
the SDK's combined `MarketResolution` query repeatedly exceeded its 30-second request ceiling. The
`MarketResolutionEvent` and `MarketReferenceLink` selections completed when requested separately;
the `Market_by_pk` branch was the slow boundary during isolation.

Recommendation: split or optimize the combined query, allow a caller-supplied timeout, and let
consumers request resolution events without oracle-answer joins. ClaimRail now requests the two
bounded collections in parallel, validates every returned field, and uses direct Somnia reads for
the authoritative payout and closing value. Missing oracle detail remains visibly missing.

### 8. Document `Redeemed.holder` semantics for `redeemMany` — high priority

A successful Shannon `redeemMany` transaction showed that the binary module first receives the
owner's ERC-6909 outcome tokens, then invokes settlement redemption. The resulting `Redeemed` log
names the trusted binary module as `holder`, while `to` remains the owner receiving collateral. A
verifier that assumes `holder === owner` will reject a valid batch claim even when its recipient,
market, outcome, amount, receipt status, post-balance, and settlement backing all agree.

Recommendation: document the difference between direct settlement redemption and the
`BinaryMarketModule.redeemMany` path, include decoded event examples for both, and expose a supported
receipt-decoding helper or invariant checklist. ClaimRail accepts only the planned owner or planned
binary module as holder and still requires the exact owner recipient and post-state checks.

Live evidence:

- transaction: [`0x03172396…39666c11`](https://shannon-explorer.somnia.network/tx/0x03172396dd2ba45d1f6c6d119d01029a2eb0b6fc8c13592c832293fe39666c11);
- block: `483279926`;
- burned outcome units: `1,001,000`;
- collateral delivered: `1,001,000` base units (`1.001000 USDso`);
- owner post-balance for the redeemed outcome: `0`;
- fallback owed: `0`.

## Documentation improvements with the largest adoption impact

1. Add a five-minute Event Contract quickstart that follows one position from trade to settlement to
   redemption, with testnet addresses and explorer links together.
2. Put the lifecycle diagram beside the redemption guide and explain `Resolved`, `Voided`, and
   settlement `Finalized` in plain language.
3. Mark collection limits in every high-level read method and return machine-readable completeness.
4. Publish verified ABI/topic artifacts per network and note when documentation describes a newer or
   older deployment.
5. Add one browser-wallet example that shows the scope of `setOperator` before `redeemMany`.

## Evidence index

- Full interpreted findings: [`context/claimrail-phase0-evidence.md`](../../context/claimrail-phase0-evidence.md)
- Canonical capture manifest: [`probes/event-contracts/evidence/README.md`](../../probes/event-contracts/evidence/README.md)
- Adapter behavior and workarounds: [`packages/dreamdex/README.md`](../../packages/dreamdex/README.md)
- Pagination probe: [`probes/event-contracts/src/probe-pagination.ts`](../../probes/event-contracts/src/probe-pagination.ts)
- Deployed event probe: [`probes/event-contracts/src/probe.ts`](../../probes/event-contracts/src/probe.ts)

This report separates observed behavior from recommendations. ClaimRail never received a private
key: the browser wallet signed the controlled claim, and the worker independently verified the
public transaction, logs, payout, and post-state before marking its receipt confirmed.
