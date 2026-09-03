# ClaimRail: Event Contract reverse-engineering brief

Snapshot date: 2026-09-03

This document records verified behavior before product decisions. Facts, interpretations, and unknowns are deliberately separated.

## Executive finding

ClaimRail should be described as **post-trade settlement infrastructure**, not as the system that decides or finalizes DreamDEX markets.

DreamDEX and Somnia already handle the protocol settlement rail: the oracle produces the answer, the market resolves or voids, and finalization moves the backing to the permanent settlement contract. What is still fragmented is the user and developer “last mile”:

- discovering every wallet position across old and current markets;
- distinguishing locked, settled, claimable, losing, voided, redeemed, and payout-owed states;
- reconciling fast indexer data against authoritative on-chain state;
- explaining the result with oracle and transaction evidence;
- preparing a safe, understandable redemption transaction;
- delivering reliable notifications and webhooks;
- preserving a durable history that dashboards, bots, games, and agents can consume.

That is the viable ClaimRail layer.

## 1. Verified DreamDEX protocol facts

### 1.1 What an Event Contract is

An Event Contract is a short-lived two-outcome market. For a BTC or ETH “Up or Down” window:

- an Up position pays if the closing reference price is greater than or equal to the opening reference price;
- a Down position pays if the closing price is lower;
- the winning position redeems for 1 unit of collateral per contract;
- a currently documented uniform void pays 0.5 per contract to both sides; the SDK retains a second snapshot-policy enum slot, but no such market was found on the live Shannon venue scan;
- the market price between 0 and 1 acts like the market’s probability estimate;
- positions are fully collateralized, so there is no leverage or liquidation.

This is closer to buying a digital yes/no ticket than buying BTC itself.

Source: [DreamDEX Event Contract overview](https://app.dreamdex.io/docs/trading/event-contracts) and [settlement documentation](https://app.dreamdex.io/docs/trading/event-contracts/settlement-and-voids).

### 1.2 Lifecycle

The documented lifecycle is:

```text
Listed (0) -> Trading (1) -> Locked (2) -> Resolved (4) or Voided (5)
```

- **Listed:** created but not open.
- **Trading:** orders are accepted.
- **Locked:** the window ended; no new orders, but cancellations still work.
- **Resolved:** the winning side is fixed.
- **Voided:** the market did not produce an ordinary one-hot winner. The actual payout must be read from its payout vector. `voidPolicy = 0` is uniform. The SDK retains a policy-2 snapshot slot, but a direct query found no policy-2 binary market on the current public Shannon indexer.
- **Settling (3):** exists in the enum but is normally too brief to observe.

The indexed status may lag the chain. Any transaction must be gated using current on-chain status. Source: [market structure and lifecycle](https://app.dreamdex.io/docs/developers/event-contracts/market-structure).

### 1.3 Contract family and stable identity

The public documentation and SDK expose these roles:

| Component | Role |
| --- | --- |
| `BinaryMarketsModule` | Registry and user-facing route for markets, mint/merge, redemption, and keeper backstops |
| Per-window market contract | Holds lifecycle, expiry, resolution state, payout vector, and void state |
| CLOB pool | Holds the order book and trading escrow; can be recycled for a later market window |
| `OutcomeToken6909` | One shared ERC-6909 contract holding every market’s Up/Down token IDs |
| `BinarySettlement` | Permanent finalization and redemption home after a pool is drained/recycled |
| Oracle hub/adapter | Supplies the opening/closing values and void decision |

The stable identifier is `marketId`, not the pool address. Pool addresses are reusable and therefore time-varying. The ERC-6909 outcome ID encodes the pool, its market nonce, and the outcome index. Any ClaimRail database key must include the chain and market identity and must never treat a pool address alone as a market.

Sources: [market structure](https://app.dreamdex.io/docs/developers/event-contracts/market-structure), `markets-sdk@0.29.0/src/ids.ts`, `eventsAbi.ts`, `readsAbi.ts`, and `moduleAbi.ts` in the local SDK snapshot.

### 1.4 Resolution and finalization are not redemption

These are separate moments:

1. **Resolution:** the market learns its payout vector or becomes void.
2. **Finalization:** backing and the resolution snapshot move from the recyclable pool into `BinarySettlement`.
3. **Redemption:** a holder burns a paying outcome token and receives collateral.

A user can have a settled winning position that remains unredeemed. Conversely, a market can be settled without a particular wallet having anything claimable.

The SDK’s `MarketFinalized` event is emitted at module and settlement layers. `BinarySettlement` then emits `Redeemed`, containing the market key, holder, recipient, outcome, amount burned, and collateral paid. It also exposes `PayoutOwed` and `OwedClaimed` for a failed push-payout fallback.

### 1.5 How the oracle decision can be explained

DreamDEX publishes the market’s `oracleQuestionId`. Its oracle explorer deep link is:

```text
https://prd.oracle.somnia.host/questions/{oracleQuestionId}?view=graph
```

The graph is documented to expose the question, price sources, source receipts, median, required source count, and interval. The SDK additionally provides `getMarketResolution(marketId)`, returning:

- lifecycle resolution events and transaction hashes;
- the reference/opening question link;
- the opening answer;
- the closing answer;
- outcome label, void reason, timestamp, and answer transaction hash when indexed.

ClaimRail can therefore make evidence a structured object rather than only a paragraph or outbound link. The explorer itself remains the best deep audit view.

### 1.6 What the current SDK can do

The latest npm version observed was `@somnia-chain/markets-sdk@0.29.0`; the hackathon starter pins `^0.28.1`. The relevant claim surface is materially the same across those two versions.

Read/discovery capabilities relevant to ClaimRail include:

- `getPortfolio(address)` for a wallet’s binary positions, orders, and recent trades;
- `getClaimable(address)` for indexer-derived settled positions that should pay;
- `listPastBinaryMarkets({ limit, offset, ... })` and `listBinaryMarkets(...)` for paginated history;
- `getMarketOnchain(marketId)` for authoritative current market, pool/nonce, token IDs, status, expiry, resolved, and void state; it does not expose the full payout vector, so ClaimRail combines it with the market and settlement reads;
- `getOutcomeBalance(outcomeToken, owner, id)` and batched balance reads for authoritative ERC-6909 holdings;
- `getMarketResolution(marketId)` and `getMarketStatusHistory(marketId)` for indexed evidence/history;
- `getRouterActions(address, ...)` for mint, merge, and redemption action history.

`getPortfolio()` hard-caps the position query at 200 rows and exposes no position offset. Because `getClaimable()` derives from that response, it inherits the same completeness risk. The underlying GraphQL `OutcomeBalance` entity supports `limit` plus `offset`; a live public address returned 1,044 unique positive rows across eleven 100-row pages. ClaimRail therefore needs its own paginated discovery adapter and an explicit completeness flag.

Write capabilities include:

- `redeem(...)` for one market/outcome;
- `redeemMany({ entries })` for an all-or-nothing batch paid to the signer;
- `signRedeemAuth(...)` to create a market/outcome/amount-specific EIP-712 authorization;
- `redeemFor({ authorization })` for a relayer to pay gas while the owner receives the payout;
- `redeemDirect(...)` for low-level settlement tooling;
- permissionless recovery actions including `pokeOracle`, `voidExpired`, `finalizeMarket`, and `syncSettlement`.

Important limits:

- The documented HTTP API does not expose Event Contract endpoints; the TypeScript SDK is the official surface.
- `getClaimable()` is built from indexed portfolio rows and indexed fee configuration. It is excellent for discovery but not sufficient as the final pre-transaction truth check.
- In SDK 0.29.0, `getClaimable()`/`estPayoutFor()` estimates every void as `amount / 2`. That matches the currently documented and observed uniform policy, but ClaimRail must still read and apply the deployed `payoutNumerators / payoutDenominator`. This avoids hard-coding policy and remains correct if another vector is deployed later.
- `redeemMany()` is all-or-nothing. One stale entry can fail the whole batch, so a plan must be rebuilt from fresh on-chain balances immediately before signing.
- Redeeming a losing position may succeed while paying zero. ClaimRail must validate the payout side before spending gas.
- Duplicate entries are processed cumulatively. ClaimRail must coalesce each market/outcome before calldata construction and reject a cumulative amount above the current balance.
- The first redemption may require `setOperator(binaryModule, true)` on the shared ERC-6909 contract. This is a module-wide approval across all of the owner's outcome-token IDs, not a per-market allowance. “One click” can mean one claim action in the product, but a fresh wallet may see an approval transaction followed by redemption.
- `redeemFor` is protected by an owner-signed EIP-712 authorization scoped to operator, venue, market, outcome, amount, nonce, and deadline. The relayer pays gas and the contract sends proceeds to the signed owner. The narrow authorization sits on top of the broader module operator grant.
- Mainnet and testnet collateral decimals differ in the docs. All amounts must remain integer base units until display formatting.

Sources: [developer overview](https://app.dreamdex.io/docs/developers/event-contracts), [recipes](https://app.dreamdex.io/docs/developers/event-contracts/recipes), [gotchas](https://app.dreamdex.io/docs/developers/event-contracts/gotchas), and the two local npm package snapshots.

## 2. What the official starter and Bot Kit already solve

### 2.1 Starter template

The starter provides the protocol “Lego pieces”:

- choose a market;
- fund/mint a complete set;
- trade;
- wait for expiry;
- redeem a known position.

It persists one selected market to a local JSON file and later polls/redeems it. It is an integration example, not a multi-wallet discovery service, evidence index, notifier, or durable API.

### 2.2 Bot Kit Event Contract core

The Bot Kit already knows how to:

- discover Event Contract markets;
- read settlement state and fees;
- determine which held outcomes pay after a resolution or void;
- redeem a single outcome;
- periodically sweep claims for the bot’s configured signer;
- serialize claim work with the bot loop to reduce nonce races;
- assert receipt success because some SDK write paths can return a reverted receipt;
- retry a failed sweep during a later loop.

Observed boundaries in `packages/ec-core`:

- it is scoped to one configured signer/process, not arbitrary subscribed wallets;
- its default sweep scans 25 rows every ten minutes;
- its helper caps a query at 200 and does not exhaustively paginate all history;
- sweep memory such as `lastSweepAt` is process-local;
- errors are logged/swallowed and retried later, not persisted in a delivery/claim job ledger;
- it exposes no multi-tenant subscription, webhook delivery, settlement receipt, or wallet inbox service;
- it intentionally keeps claim execution inside the bot loop rather than offering shared infrastructure to many applications.

ClaimRail should adapt these safety lessons, not duplicate the bot loop.

## 3. Existing DreamDEX projects close to ClaimRail

### 3.1 Settled

`ZubeidHendricks/settled` is the closest direct competitor found. It already includes:

- portfolio and claimable views;
- batched `redeemMany` claims;
- performance/calibration views;
- an automatic-claim queue;
- a relayer using `redeemFor`;
- safe retry behavior that rereads remaining claimables before resubmission.

Its strongest innovation is pre-authorized auto-claim: the user signs an EIP-712 redemption authorization when a fill is known, and a relayer submits it after settlement. No user private key is stored, and payout is pinned on-chain to the owner.

Its boundary creates ClaimRail’s opportunity:

- auto-claim works for positions that entered its own authorization flow; it cannot retroactively auto-claim any arbitrary public wallet;
- its manual route is coupled to an application session wallet;
- it does not demonstrate a neutral multi-tenant subscription API, signed webhook product, delivery log, or settlement-evidence standard for other applications.

### 3.2 Somnus

`zachbuilds26/somnus` is an agent backend with:

- portfolio-based claim discovery;
- settlement/PnL reconciliation separated from redemption;
- `redeemMany` execution with receipt validation;
- REST claim endpoints, MCP tools, and an SSE event stream;
- a generic operational alert webhook;
- reconciliation reports that detect but do not silently repair ledger divergence.

Its boundary is a single agent/signer runtime. Alerts use process-memory deduplication and a single configured destination; there is no durable multi-wallet subscription service or delivery queue.

### 3.3 Cleave and the starter

Cleave has a practical claim script that constructs claimable inputs and calls `redeemMany`. The starter shows the single-market lifecycle. Both confirm that claims are a necessary operational task, but neither is a settlement notification rail.

### 3.4 PredicTrader implementation check

PredicTrader’s README describes `listBinaryMarkets({ status: "Finalized" }) -> getMarketOnchain() -> redeem(outcomeIdx)` and correctly highlights finalized-market discovery as a gotcha. At cloned commit `169feb3c5f65`, however, the executable bot contains the on-chain trading gate but no implemented finalized-market scan or redemption call. It pins `@somnia-chain/markets-sdk` `^0.25.0`, compared with npm `0.29.0` in this research snapshot.

PredicTrader is therefore a useful lead and documentation checklist, not implementation evidence for ClaimRail’s claim path. Source: [PredicTrader repository](https://github.com/binasalama12/predictrader-ai).

### 3.5 Competitive conclusion

“A dashboard that finds and claims winnings” is no longer differentiated by itself.

A directional GitHub search on 2026-09-03 found 66 repositories matching the broad DreamDEX Event Contract hackathon query. Keyword refinements returned roughly 30 AI/agent matches, 22 settlement/redeem/claim matches, 12 portfolio matches, 5 MCP matches, 3 webhook matches, and 2 notification matches. These are search-result counts, **not** verified DoraHacks submissions: repositories can be duplicated, incomplete, irrelevant to the word, or never submitted. They are only useful as a crowding signal.

That signal says the relatively open area is not “claims” in general. It is the operational product around claims: a neutral event schema, multi-wallet subscriptions, durable signed webhook delivery, evidence receipts, and a clean adapter for other teams’ apps and agents.

Landscape source: [broad GitHub repository search](https://github.com/search?q=%22DreamDEX%22+%22Event+Contracts%22+hackathon&type=repositories).

The defensible wedge is:

> A wallet-addressed, multi-tenant settlement event and delivery layer that reconciles on-chain truth, produces verifiable claim plans/receipts, and serves the same state to a consumer inbox, webhooks, and agents.

That combines capabilities the inspected DreamDEX projects currently keep inside separate applications.

## 4. What other ecosystems teach us

| Ecosystem/reference | Existing behavior | Lesson for ClaimRail |
| --- | --- | --- |
| Polymarket conditional tokens | Yes/No token holders explicitly redeem after oracle resolution | Manual redemption is a general self-custody problem, not unique to DreamDEX |
| Polymarket resolution subgraph | Resolution status, disputes, prices, timestamps, tx hashes, and revisions are first-class indexed entities | Evidence should be structured and queryable, not only a UI link |
| Kalshi | The centralized account is automatically credited after finalization | ClaimRail’s UX goal is “Kalshi-like convenience without surrendering wallet custody” |
| Push Protocol SDK | Separates producers/channels, subscribers, notification delivery, feed history, and real-time sockets | Model subscriptions and deliveries separately from financial events; a notification is not the source of truth |
| PolyPOP | Uses worker leases, in-flight guards, transaction serialization, post-write rereads, and claim orchestration | Durable settlement workers need idempotency, leases, and reconciliation |
| Underlay | Reads finalized truth, deduplicates settlement work, and batches independently checked items | Distinguish fast observation from final truth and make retry safe |
| Polyledger | Converts opaque signing payloads into human-readable, verified context | ClaimRail should show exactly what a claim signature will do before the user signs |

Sources: [Polymarket resolution](https://docs.polymarket.com/concepts/resolution), [Polymarket positions](https://docs.polymarket.com/concepts/positions-tokens), [Kalshi settlement](https://docs.kalshi.com/getting_started/market_settlement), [Push SDK](https://github.com/pushchain/push-sdk), [PolyPOP showcase](https://ethglobal.com/showcase/polypop-qjuge), and [Polyledger showcase](https://ethglobal.com/showcase/polyledger-u5k4j).

## 5. Open-source hackathon winner lessons

The most useful winners were not copied for features; they were inspected for product shape and operational patterns.

- **PolyPOP** won an ETHGlobal prediction-market prize by connecting social content, market creation, participation, settlement workers, and claims into one demonstrable journey. Lesson: an end-to-end workflow is more compelling than an isolated API method.
- **Polyledger** won a Ledger AI-agent prize by making an opaque financial signature understandable and independently verifiable. Lesson: the settlement receipt and “what you are about to sign” screen can be a technical feature, not decoration.
- **Underlay** was useful as an orchestration reference even though the inspected showcase page did not establish a prize. Its finality, batching, and deduplication patterns are directly relevant.

The cloned reference manifest is in [`research/reference-repos/README.md`](../research/reference-repos/README.md).

## 6. Inferences for ClaimRail

The following are product/architecture inferences, not claims made by DreamDEX.

### 6.1 ClaimRail is a read model plus an action planner

The core asset is not the dashboard. It is a normalized record that answers:

- What happened to this market?
- What does this wallet currently hold?
- Is any amount actually redeemable now?
- Why is it redeemable?
- What exact transaction should be signed?
- Was it submitted, confirmed, reverted, superseded, or already redeemed?
- Which consumers were notified and which deliveries failed?

The inbox, Telegram bot, webhook, and agent adapter are consumers of the same record.

### 6.2 Discovery and truth need different sources

A sound approach is:

- use the indexer/SDK for broad discovery, joins, history, and fast UI;
- use on-chain state and ERC-6909 balances to rebuild the final claim plan;
- use confirmed transaction receipts and post-write rereads to decide whether the action completed;
- use oracle/indexed evidence for explanation, while marking missing indexed fields as pending rather than inventing them.

### 6.3 The product has two claim modes

1. **Universal manual claim:** watch any address; when claimable, the owner connects the wallet and signs a fresh `redeemMany` plan.
2. **Opt-in auto-claim:** the owner grants the shared module operator approval and signs a market/outcome/amount/nonce/deadline-specific EIP-712 authorization; ClaimRail later relays `redeemFor` and pays gas, while proceeds remain pinned to the owner.

The first works for arbitrary historical positions. The second only works where authorization was obtained before execution and is best treated as a later feature.

### 6.4 “One click” needs honest wording

After the ERC-6909 operator approval exists, several claims can be redeemed in one `redeemMany` transaction. For a fresh wallet, the safe flow may need one approval transaction and one redemption transaction. The UI can orchestrate this as one guided action, but should neither conceal the two on-chain steps nor describe the operator grant as narrower than it is.

## 7. Live-probe progress and remaining questions

The first read-only testnet captures have now verified a complete resolution/finalization transaction, a temporary indexer/on-chain disagreement, recycled pool identity, successful and zero-payout `Redeemed` events, a public wallet with two independently verified winning claimables, and a uniform void wallet where both sides are independently claimable at one-half. Read-only calls also verified `redeemMany` success/revert cases, operator approval requirements, cumulative duplicate handling, mixed winner/loser behavior, and pagination beyond one hundred position rows. The detailed evidence is in [`claimrail-phase0-evidence.md`](claimrail-phase0-evidence.md).

The probe also found that the deployed settlement `MarketFinalized` event contains `uint256[] payoutNumerators`, while the SDK 0.29.0 event ABI declares `uint8 winningOutcome`. ClaimRail must follow the deployed selector and preserve the raw vector.

Remaining questions:

- What is the exact gas growth and practical maximum batch size across 1, 10, 50, and 100 entries?
- Does the first real browser integration expose wallet/provider quirks beyond the SDK's verified `SomniaMarkets.setSigner({ walletClient })` support?
- How should unused EIP-712 nonces be coordinated across multiple ClaimRail devices when the current SDK exposes no nonce-used reader?
- Does a real relayed `redeemFor` receipt and replay attempt match the ABI-derived recipient, deadline, nonce, and authorization guarantees?
- Is there a supported machine-readable oracle explorer API beyond the indexer fields returned by `getMarketResolution`, or should ClaimRail only deep-link the source receipt graph?
- Will the judged venue enable snapshot void policy later? None was returned by the current public indexer, so it remains an unobserved compatibility case rather than a current feature claim.
- What is the distribution of indexer lag at lock, finalization, redemption, and reconnect boundaries? One live finalization race is now confirmed, but one observation is not a service-level measurement.
- What fallback discovers historical positions if direct paginated `OutcomeBalance` queries are capped, unavailable, or change schema?
- Which precise chain/venue configuration will the hackathon judges use?

These should become integration tests before promising production reliability.

## 8. Final factual boundary

ClaimRail is technically feasible without deploying a new smart contract for its first useful version. The official SDK already exposes discovery, market truth, resolution evidence, batch claims, and relayed claims. The difficult and differentiated work is reliable normalization, reconciliation, idempotent delivery, transparent signing, and multi-consumer product design.
