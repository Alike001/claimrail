# ClaimRail DreamDEX protocol reference

Snapshot date: 2026-09-03

This is the compact implementation contract for ClaimRail Core and the future `/docs/concepts/dreamdex-adapter` page. It describes the deployed Shannon testnet behavior and SDK `0.29.0`, with indexer facts kept separate from chain facts.

## 1. The real-world model

Think of a DreamDEX Event Contract as a two-color claim ticket:

- the market creates an Up/YES ticket and a Down/NO ticket;
- traders exchange those tickets in an on-chain order book;
- the oracle supplies the real-world result after the deadline;
- the protocol freezes a payout recipe, such as `[1, 0]`, `[0, 1]`, or `[0.5, 0.5]`;
- a winning holder still owns a ticket, not the cash;
- redemption burns the ticket and releases its collateral.

DreamDEX provides the market, result, backing, and redemption machinery. ClaimRail is the inbox, verifier, safe claim planner, receipt system, and delivery network around that machinery.

## 2. One market exists in three useful representations

There is no single response that is authoritative and complete for every purpose.

### 2.1 Indexed `BinaryMarket`: rich discovery and display

The SDK's indexed market includes:

| Group | Important fields |
| --- | --- |
| Identity | `id`, `marketId`, `marketType`, `marketAddress` |
| Trading location | `poolAddress`, `nonce`, `yesTokenId`, `noTokenId` |
| Meaning | `asset`, `question`, `oracleQuestion`, `oracleQuestionId`, `mode`, `strike` |
| Window | `tradingStart`, `expiry`, `intervalSec`, `interval` |
| Lifecycle | `status`, `winningOutcome`, `voided`, `voidPolicy`, `finalized` |
| Payout | `payoutNumerators`, `payoutDenominator`, `backing`, `netBacking` |
| Collateral/formatting | `collateral`, `baseDecimals`, `quoteDecimals` |
| Activity | `lastPrice`, `lastTradeAt`, volumes, `tradeCount` |
| Provenance | `creator`, `createdByTx`, `createdAtBlock`, `createdAtTimestamp`, `operatorId`, `venueId`, `context` |

This is the best market list and display source. It can lag chain state, contain null legacy fields, and derive `Finalized` from events.

There is no separate `symbol` field for an Event Contract. `asset` is the underlying label such as `BTC` or `ETH`; `question` is the user-facing market description.

### 2.2 Module `markets(marketId)`: canonical wiring

The module returns this exact tuple:

```text
oracleQuestionId
outcomeSlotCount
voidPolicy
collateral
originOperatorId
originVenueId
oracleAdapter
creator
market
pool
yesId
noId
tradingStart
expiry
```

`marketNonce(marketId)` is a separate read. ClaimRail needs it because pools are recycled and the outcome-token IDs encode the pool generation.

### 2.3 `getMarketOnchain(marketId)`: convenient live state

SDK `0.29.0` returns:

```text
marketAddress, outcomeToken, yesId, noId,
pool, nonce, collateral, status, backing,
finalized, expiry, decimals, winningOutcome,
isResolved, isVoided, voidPolicy
```

Important correction: this convenience result does **not** return the full payout vector. ClaimRail must also read:

- `BinaryMarket.payoutNumerators()` for the market's current vector;
- `BinarySettlement.getSettlement(marketKey)` for permanent finalized backing, void flag, fee data, pool/nonce, and its stored payout vector.

The adapter should reconcile all three representations instead of pretending one response is complete.

## 3. Exact lifecycle model

The contract enum is:

| Number | Contract state | Plain meaning |
| ---: | --- | --- |
| `0` | `Listed` | Created, not yet open |
| `1` | `Trading` | Orders may trade |
| `2` | `Locked` | Trading window closed; waiting for the oracle |
| `3` | `Settling` | Resolution is being processed; often too brief to observe |
| `4` | `Resolved` | A concrete payout vector is known |
| `5` | `Voided` | No ordinary winner; refund uses the void payout vector |

`Finalized` is not state `6`. It is an indexer-derived and settlement-backed fact meaning the permanent `BinarySettlement` record exists. ClaimRail stores `contractStatus` and `settlementFinalized` separately.

Claim readiness is:

```text
(isResolved OR isVoided)
AND settlement.finalized
AND wallet balance > 0
AND payout numerator for that outcome > 0
```

## 4. Position representation

The SDK portfolio position is deliberately small:

```text
market          indexed PortfolioMarket context
outcomeIndex    0 = YES/Up, 1 = NO/Down
tokenId         ERC-6909 position ID as a decimal string
balance         raw token balance as a decimal string
```

The wallet is stored once at the parent `Portfolio.account`; the underlying `OutcomeBalance` indexer row also has `account`.

Several fields in the original product sketch are not native position fields:

| Desired field | How ClaimRail obtains it |
| --- | --- |
| `wallet` | Query owner / `OutcomeBalance.account` |
| `market` | `marketId` plus the joined indexed market |
| `side` | `outcomeIndex` (`0` Up/YES, `1` Down/NO) |
| `quantity` | Current ERC-6909 `balanceOf(owner, tokenId)` |
| `entry` / average cost | Reconstruct from fills, mint/merge/router actions; may be incomplete if history is truncated |
| `current status` | ClaimRail's normalized market and wallet-position state |
| `payout` | Current balance multiplied by the verified payout numerator/denominator, then reconciled with fee behavior |

The SDK's `ClaimablePosition` is a useful candidate shape—`marketId`, `pool`, `outcomeIdx`, `amount`, `estPayout`, `status`—but is not sufficient proof. It is indexer-derived, inherits the 200-position cap, and estimates voids as one-half.

## 5. Resolution path

```text
market window ends
        ↓
oracle adapter answers or declares a void
        ↓
BinaryMarket freezes status + payout vector
        ↓
BinaryMarketsModule finalizes the market
        ↓
BinarySettlement stores permanent backing + payout evidence
        ↓
wallet outcome token becomes redeemable if its numerator is positive
```

ClaimRail does not decide the winner and does not settle the protocol. It observes this path, reconciles it, explains it, and safely delivers the resulting action.

## 6. Exact redemption surface

### Manual single claim

```solidity
redeem(
  uint32 operatorId,
  bytes32 venueId,
  bytes32 marketId,
  uint8 outcomeIdx,
  uint256 amount
)
```

### Manual batch

```solidity
redeemMany(
  uint32 operatorId,
  bytes32 venueId,
  bytes32[] marketIds,
  uint8[] outcomeIdxs,
  uint256[] amounts
)
```

The three arrays are parallel and the batch is atomic. The deployed module accepts a valid losing burn and can return zero, so “call succeeded” does not mean “every entry paid.” ClaimRail coalesces duplicates, removes zero-paying entries, checks cumulative balances, and simulates the complete batch before signing.

The module must be an ERC-6909 operator for the owner. `setOperator(binaryModule, true)` applies across the owner's IDs in the shared outcome-token contract; it is not a per-market allowance.

### Opt-in relayed claim

```solidity
redeemFor(
  address owner,
  uint256 nonce,
  uint256 deadline,
  bytes sig,
  uint32 operatorId,
  bytes32 venueId,
  bytes32 marketId,
  uint8 outcomeIdx,
  uint256 amount
)
```

The owner signs an EIP-712 `RedeemAuthorization` with exactly those economic fields. Domain:

```text
name              SomniaMarkets
version           1
chainId           active Somnia chain
verifyingContract BinaryMarketsModule
```

The authorization is narrow, replay-protected by `(owner, nonce)`, and deadline-bound. Payout is pinned to `owner`; the caller only sponsors gas. The broader module operator approval must already exist.

## 7. Events ClaimRail consumes

| Event family | Use in ClaimRail |
| --- | --- |
| `StatusChanged` / `Resolved` / `Voided` | Lifecycle and outcome transition |
| Pool and module finalization events | Detect permanent settlement readiness |
| Settlement `MarketFinalized` | Canonical backing, void flag, and deployed payout vector |
| `Redeemed` | Amount burned, holder, recipient, and actual collateral paid |
| `PayoutOwed` | Push transfer failed; owner has fallback credit |
| `OwedClaimed` | Fallback credit was withdrawn |
| ERC-6909 transfer/operator events | Position balance and approval reconciliation |

The live settlement `MarketFinalized` event ends in `uint256[] payoutNumerators`. SDK `0.29.0` declares an incompatible `uint8 winningOutcome` event. ClaimRail uses the deployed topic and preserves the raw log.

## 8. SDK boundary

### Reuse

- market listing and history;
- resolution/status evidence;
- module/market/settlement reads;
- ERC-6909 balance reads;
- `redeem`, `redeemMany`, EIP-712 signing, and `redeemFor` transaction construction;
- router action and fill history where complete.

For browser use, the exported `SomniaMarkets` class can start without a signer, accept a viem `WalletClient` later through `setSigner({ walletClient })`, and remove it with `setSigner({})`. This supports public address browsing followed by user-signed approval/redemption without handling a private key. The package's documented root `createClient` export is absent in `0.29.0`, so ClaimRail should not import that path until the SDK fixes it.

### Wrap or replace

- paginate `OutcomeBalance` directly because `getPortfolio()` and therefore `getClaimable()` stop at 200 positions; one live wallet held 1,044 unique positive rows across eleven pages;
- combine `getMarketOnchain()` with direct payout-vector and settlement reads;
- use deployed settlement event topics rather than the mismatched SDK event declaration;
- calculate payout from the actual vector instead of treating every void as a hard-coded half;
- add completeness, freshness, conflict, and evidence state;
- simulate and integrity-hash claim plans;
- persist nonce, submission, receipt, notification, and webhook state.

## 9. ClaimRail normalized records

ClaimRail Core should expose stable product records rather than raw SDK objects:

```text
MarketRecord
  identity: chainId + module + marketId
  display: asset + question + interval
  lifecycle: contractStatus + settlementFinalized
  wiring: market + pool + nonce + outcomeToken + tokenIds
  settlement: resolved/voided + payoutVector + backing + fees
  evidence: oracle + resolutionTx + finalizationTx + freshness/conflicts

WalletPosition
  identity: market + wallet + outcomeIdx
  tokenId + verifiedBalance
  costBasis/completeness
  state + expectedPayout
  evidenceVersion

ClaimPlan
  owner + recipient + chain + approvalScope
  normalized entries + exclusions
  expectedPayout + discoveryCompleteness
  verifiedBlock + expiresAt + simulation
  integrityHash
```

These records feed the frontend, REST API, webhooks, Telegram, games, bots, and agents. None of those consumers should independently reimplement payout logic.

## 10. Documentation status

This file is already the content source for a real documentation page. The planned frontend includes `/docs` pages for concepts, REST endpoints, webhook schemas and verification, TypeScript helpers, the Bot Kit adapter, protocol evidence, and SDK feedback.

Primary public references: [DreamDEX market structure](https://app.dreamdex.io/docs/developers/event-contracts/market-structure), [settlement and voids](https://app.dreamdex.io/docs/trading/event-contracts/settlement-and-voids), [raw contract integration](https://prd.smk.somnia.host/docs/contracts/raw-integration), and [SDK `RedeemAuthorization`](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/RedeemAuthorization). Deployment-sensitive statements above were checked against the installed package and live Shannon state rather than copied uncritically from generated documentation.
