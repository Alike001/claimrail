# ClaimRail Phase 0 protocol evidence

Snapshot date: 2026-09-03 (`Africa/Lagos`)

This report records live, read-only observations from Somnia Shannon testnet. It is separate from the product plan so that protocol facts, SDK defects, and ClaimRail decisions do not blur together.

The reproducible collector and redemption simulator are in [`probes/event-contracts`](../probes/event-contracts/README.md). They accept no private key and cannot trade, approve, redeem, sign, or broadcast.

## 1. Environment verified

| Item | Observed value |
| --- | --- |
| Chain | Somnia Shannon testnet |
| Chain ID | `50312` |
| SDK | `@somnia-chain/markets-sdk@0.29.0` |
| Binary module | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| Binary settlement | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| Test collateral | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` |

The HTTP RPC, WebSocket RPC, and DreamDEX GraphQL indexer all answered live reads during the capture.

## 2. One finalized market traced end to end

Market `0x…12222` resolved in block `478578871`. One transaction produced all of the following observable facts:

1. The per-market clone emitted `Resolved([10000000, 0])` and `StatusChanged(Locked, Resolved)`.
2. The pool emitted `PoolFinalized` for nonce `490`.
3. `BinarySettlement` emitted `MarketFinalized`, preserving collateral, net backing, void flag, and the full payout vector.
4. `BinaryMarketsModule` emitted its own `MarketFinalized`, which lets the indexer expose the user-facing status `Finalized`.

The market contract still reported numeric status `4` (`Resolved`) while the indexer reported `Finalized`. These are not contradictory:

- **Resolved** means the market contract knows the outcome.
- **Finalized** means the permanent settlement record exists and redemption is available.

ClaimRail must preserve both facts instead of forcing them into one ambiguous status field.

The on-chain resolution price was also readable: `2397845000000000000000` with 18 decimals, against the market strike `239715` in the market’s displayed scale. The indexer supplied the resolution transaction, while the oracle read supplied the canonical numeric result.

## 3. A real indexer-lag boundary was observed

During the first capture, market `0x…12213` was returned by the indexer as `Trading`, but a subsequent on-chain read showed:

- contract status `Resolved`;
- `finalized = true`;
- payout vector `[10000000, 0]`.

The finalization occurred while the probe was running. This is direct evidence for ClaimRail’s two-source rule:

> Use the indexer to discover candidates quickly; use current chain state to decide whether a claim is safe.

The probe now records a per-market event upper block after its state reads so a transition occurring during collection is not omitted.

## 4. Deployed event and SDK ABI disagree

The Shannon `BinarySettlement` deployment emitted this event topic:

```text
MarketFinalized(uint256,address,uint64,address,uint256,bool,uint256[])
0xb1884334e955f8d8727678d4fa52dd9fc7140ff5e4ad38d358453bd400ada178
```

Its final field is the complete `uint256[] payoutNumerators` vector.

SDK `0.29.0` currently declares the same event name with a final `uint8 winningOutcome`, producing a different topic:

```text
MarketFinalized(uint256,address,uint64,address,uint256,bool,uint8)
0xaa0d535f55946d4080e0c3a62bb1c53e2596353e9ab633fca0ce625fa518edc1
```

The SDK’s settlement read model correctly returns `payoutNumerators`; the mismatch is specifically in its event ABI/materializer declaration. A consumer using only the published event ABI can silently miss the deployed settlement-finalization log.

ClaimRail’s adapter must test deployed selectors and preserve raw logs. This is also useful SDK feedback for the hackathon submission.

## 5. Redemption behavior verified from receipts

Market `0x…121ed` finalized with Up/YES (`outcomeIdx = 0`) winning. The same public test wallet later emitted two `Redeemed` events:

| Outcome | Amount burned | Collateral returned | Meaning |
| --- | ---: | ---: | --- |
| `0` (winner) | `1,494,000,000` | `1,494,000,000` | Valid paying redemption |
| `1` (loser) | `1,500,000,000` | `0` | Accepted but economically wasteful redemption |

This proves that “the transaction may succeed” is not enough protection. ClaimRail must calculate the actual payout vector and remove zero-paying entries before generating `redeemMany` calldata.

The remaining settlement backing read `6,000,000`, matching the indexer’s `netBacking`. That gives the receipt parser a concrete reconciliation rule: emitted collateral out and remaining settlement backing must agree with the post-claim state.

## 6. Public-wallet claim discovery verified

A read-only scan of public test address `0xe1DA3bdD4189FDEfB2eF8A73bd37A4083F284477` returned:

- eight non-zero finalized positions;
- two claimable winning positions;
- `2,970,000,000` and `700,000,000` raw collateral units respectively;
- no disagreement between the indexer balance and the direct ERC-6909 balance for any of the eight positions;
- losing holdings in a finalized market that were not included in `getClaimable()`.

For both claimable entries, current chain state independently confirmed:

- market status `Resolved`;
- permanent settlement `finalized = true`;
- the claimed outcome index equals the winning outcome;
- the pool and nonce correspond to the market’s outcome token IDs;
- the wallet still holds the exact amount proposed for redemption.

This is the first real fixture for `listClaimables(address)` and the frontend Claimable section. It was observed only; no transaction was signed or submitted.

## 7. Pool recycling verified as an identity hazard

Pool events show `PoolRecycled(marketNonce, market)` for active and historical markets. A pool address therefore cannot identify a prediction by itself. ClaimRail’s stable key remains:

```text
chainId + binaryModule + marketId + wallet + outcomeIdx
```

The pool and nonce are stored as settlement evidence and checked before claim planning, not used as the primary market identity.

## 8. Uniform void and two-sided refund verified

Market `0x…10dcd` provided a complete void fixture:

- indexer status `Finalized`, `voided = true`, `voidPolicy = 0`;
- market contract numeric status `5` (`Voided`);
- `isVoided = true` while `isResolved = false`;
- payout vector `[5000000, 5000000]` over denominator `10000000`;
- oracle `voidReason = 1` and a separate oracle answer transaction;
- permanent settlement record finalized with the same payout vector.

This proves ClaimRail must not require `isResolved = true` for a valid void refund. Terminal validity is `isResolved || isVoided`, followed by settlement finalization.

A second public fixture, address `0x9E5084c08E234c6F4FF639BAC27E8D5F4Bd02F5B` in market `0x…0304`, holds `2,400,000,000` raw units on each side of a finalized uniform void. Both entries are claimable:

| Side | Held | Payout numerator | Verified expected refund |
| --- | ---: | ---: | ---: |
| Up/YES | `2,400,000,000` | `5,000,000` | `1,200,000,000` |
| Down/NO | `2,400,000,000` | `5,000,000` | `1,200,000,000` |

Every safety check passed: on-chain balance, positive payout, permanent finalization, amount within balance, pool match, and nonce match. The settlement backing was `2,454,000,000`, enough for the combined `2,400,000,000` expected refund.

A direct indexer query for binary markets with `voidPolicy = 2` returned zero rows on the current Shannon venue. The current user documentation describes uniform voids, while the raw SDK types retain an `AMM_SNAPSHOT`/policy-2 slot. ClaimRail will calculate from the deployed payout vector generically, but it must not advertise asymmetric voids as a currently observed venue feature.

## 9. SDK integration defects found during the probe

Two package-level issues are now reproducible:

1. `dist/createClient.d.ts` documents `import { createClient } from "@somnia-chain/markets-sdk"`, but the package root `dist/index.d.ts` does not export it. The probe uses `new SomniaMarkets(...).client` instead.
2. `SomniaMarkets.close()` stops SDK watches but leaves the lazily created viem WebSocket transport open after one-shot reads. The probe explicitly closes the underlying RPC client so the command terminates.

Neither issue blocks ClaimRail, but both belong in the optional SDK/documentation feedback report.

## 10. `redeemMany` validation and atomicity simulated

The read-only simulator used a public wallet that already grants the deployed module ERC-6909 operator permission. It called `eth_call` and `eth_estimateGas`; it did not sign or broadcast a transaction.

| Case | Observed result |
| --- | --- |
| One paying winner | Success; estimated gas `1,457,011` |
| One losing token | Success; estimated gas `1,410,466`, despite zero payout |
| Zero amount | `ZeroAmount` revert |
| Amount above balance | `InsufficientBalance` revert |
| Same position split into two entries within the balance | Success; duplicate entries are processed cumulatively |
| Same full balance included twice | `InsufficientBalance` revert |
| Paying winner plus valid losing token | Success; the loser would be burned for zero |
| Parallel arrays with different lengths | `LengthMismatch` revert |
| Unknown market | `UnknownMarket` revert |
| Valid claim from an unapproved owner | `InsufficientPermission` revert |
| 10 cumulative entries | Success; estimated gas `3,692,491` |
| 50 cumulative entries | Success; estimated gas `18,076,650` |
| 100 cumulative entries | Success; estimated gas `36,066,576` |

The practical consequence is stronger than “filter obvious losers.” ClaimRail must normalize and deduplicate entries, cap their cumulative amount at the fresh balance, exclude zero-paying outcomes, and simulate the complete batch. Because a later invalid entry reverts the whole call, a failed or expired plan must be rebuilt rather than retried blindly.

The 10/50/100 cases deliberately split one real winning balance into duplicate entries. They prove the deployed loop accepts those lengths and provide an upper-overhead sample, but they do not replace profiling across distinct markets. All estimates were far below the observed Shannon block gas limit of `15,000,000,000`.

The canonical result is `probes/event-contracts/evidence/simulations/2026-09-03T10-55-46-125Z/redemption-simulations.json` and can be regenerated with `npm run simulate:redemption`.

## 11. Approval and relayed authorization traced from the SDK ABI

`redeemMany` takes five parallel values: `operatorId`, `venueId`, `marketIds[]`, `outcomeIdxs[]`, and `amounts[]`. The SDK's convenience shape is `entries[]`, but the contract call is all-or-nothing arrays.

The first claim can require `OutcomeToken6909.setOperator(binaryModule, true)`. This is a broad owner-to-module approval across the shared ERC-6909 token contract, not a narrow approval for one market. The UI must disclose that scope accurately.

The optional auto-claim path is narrower at the signed-message layer. `signRedeemAuth` signs EIP-712 data with:

- domain: `SomniaMarkets`, version `1`, chain ID, and the binary module as verifying contract;
- authorization: `owner`, `operatorId`, `venueId`, `marketId`, `outcomeIdx`, `amount`, `nonce`, and `deadline`.

`redeemFor` receives that authorization and pins proceeds to `owner`; the relayer pays gas but cannot choose another payout recipient. It still requires the broad module operator grant underneath. The SDK describes the nonce as any unused per-owner value but exposes no nonce-used read in the module read ABI, so ClaimRail needs a durable nonce ledger and post-state reconciliation for ambiguous submissions rather than interpreting an “already used” error as proof of payment.

Read-only negative-path calls against the deployed module confirmed that an expired authorization reverts with `RedeemAuthExpired`, while a future-dated malformed signature reverts with `RedeemSignatureInvalid`. A valid signed relay and replay still require a funded test identity because public state cannot manufacture the owner's signature.

## 12. Portfolio pagination boundary verified

SDK `getPortfolio(address)` queries at most 200 position rows and exposes no position cursor/offset. `getClaimable(address)` is derived from that portfolio response and inherits the cap. It cannot be the only discovery path for a product promising “all claimable funds.”

The underlying public GraphQL indexer does accept `limit` and `offset` on `OutcomeBalance`. Public wallet `0x3c44…93bc` produced eleven ordered pages: ten pages of 100 and a final page of 44. All 1,044 row IDs and token IDs were unique. The SDK portfolio query would expose only 200 of those current positive balances, so this is a demonstrated omission rather than a theoretical cap. ClaimRail Core should own the paginated adapter, record scan completeness, and never display an unqualified universal total when discovery is capped or degraded.

The canonical pagination capture is `probes/event-contracts/evidence/pagination/2026-09-03T11-01-20-846Z/outcome-balances.json` and can be regenerated with `npm run probe:pagination`.

## 13. Documentation drift is now a first-class adapter concern

The current user lifecycle pages correctly describe uniform voids, finalization, indexer lag, and pool recycling. The raw-integration page and published package declarations contain details that disagree with the live deployment, including an older single-winner finalization event shape and simpler outcome-token identity examples. ClaimRail must version its adapter against deployed addresses/selectors and retain raw evidence instead of treating any one generated document as infallible.

## 14. What is proven and what is not

### Proven by live reads

- Market, module, pool, settlement, oracle, and ERC-6909 data can be reconciled.
- `Finalized` is a derived settlement state rather than market numeric status `6`.
- Indexer lag can occur at the exact boundary ClaimRail cares about.
- The deployed settlement event preserves a payout vector.
- Winning and losing tokens can both be burned, but a loser can return zero.
- A public address can be monitored without wallet connection or a private key.
- Claim candidates can be independently checked against on-chain balances and settlement state.
- A uniform void pays both held sides using `[0.5, 0.5]`, and `isVoided` is terminal even when `isResolved` is false.
- `redeemMany` validation, cumulative duplicate handling, missing-approval behavior, and whole-batch atomicity can be reproduced without broadcasting.
- The operator grant is module-wide, while `redeemFor` authorization is market/outcome/amount/nonce/deadline-specific and pays the owner.
- Exhaustive position discovery requires pagination below `getPortfolio()`/`getClaimable()`.

### Still to prove before implementation claims are complete

- An asymmetric CLOB-snapshot void; no policy-2 market was present in the current public indexer query.
- A stale-state `redeemMany` race between plan simulation and mined execution.
- Batch gas growth across distinct markets and a conservative wallet/provider-safe maximum; duplicate-entry simulations through 100 succeeded.
- A real signed/broadcast `signRedeemAuth`/`redeemFor` flow, including replay rejection and post-receipt reconciliation.
- `PayoutOwed` and `OwedClaimed` fallback behavior.
- Typical indexer-lag distribution across many finalizations, not only one observed race.
- Full historical discovery when the public indexer itself truncates, changes schema, or is unavailable.

## 15. Immediate product consequences

- The backend component is a **Settlement Reconciler**, not a market settler.
- The frontend shows contract lifecycle and settlement readiness separately.
- “Claim all” is built from a short-lived, on-chain-verified plan.
- Losing outcome tokens are shown in history but never included in a paying claim plan.
- A void claim plan can contain both sides from the same market and must use the stored vector rather than a hard-coded winner.
- Every settlement receipt stores the raw payout vector and deployed event selector.
- SDK/indexer disagreements are represented as `syncing` or `verification_pending`, not hidden.
- The claim planner deduplicates entries, excludes zero payouts, and simulates the final batch.
- Approval copy says the DreamDEX module can operate all of the owner’s outcome-token IDs; it is not described as a per-claim approval.
- Wallet scans carry a completeness state so “all claimables” is never promised from a capped page.
- The documentation site includes a protocol-evidence page and an SDK feedback page.
