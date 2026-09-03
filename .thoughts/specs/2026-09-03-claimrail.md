# Spec: ClaimRail

## Objective

Build a neutral settlement and notification layer for DreamDEX Event Contracts on Somnia. ClaimRail must let a person inspect any public wallet, understand every relevant position, identify funds that are genuinely claimable, review and execute a safe owner-signed redemption, and retain a verifiable receipt. The same normalized settlement information must be available to the web interface, REST clients, webhooks, bots, games, and AI agents.

ClaimRail succeeds when it can truthfully say:

> Here is every position we discovered, how complete the scan was, what the protocol currently says, what can safely pay, why it can pay, what the wallet will authorize, and what actually happened after submission.

## Background And Current Reality

DreamDEX already provides the trading and settlement protocol:

- Event Contract market creation and CLOB trading;
- shared ERC-6909 Up/YES and Down/NO outcome tokens;
- oracle-backed resolution or voiding;
- permanent finalization in `BinarySettlement`;
- manual `redeem` and atomic `redeemMany` calls;
- EIP-712-authorized `redeemFor` for gas-sponsored claims.

The missing layer is post-trade coordination. Raw protocol and SDK information is split between an indexer, module records, per-market contracts, a recyclable pool, the settlement singleton, oracle evidence, outcome-token balances, and transaction logs.

Live Shannon research established these constraints:

- on-chain states are `Listed`, `Trading`, `Locked`, `Settling`, `Resolved`, and `Voided`; indexed `Finalized` is a separate derived settlement fact;
- pools are recycled, so a pool address cannot be used as the stable market identity;
- indexer state can lag current chain state at finalization;
- `getPortfolio()` and `getClaimable()` see at most 200 position rows, while one public wallet held 1,044 unique positive rows;
- `getMarketOnchain()` does not include the full payout vector;
- a losing outcome can be redeemed successfully for zero;
- a mixed winner/loser batch can succeed and burn both;
- duplicate batch entries are cumulative, and one invalid entry reverts the complete batch;
- the required ERC-6909 operator approval grants the DreamDEX module access across all owner IDs in the shared token contract;
- relayed authorization is narrower and pins payout to the signed owner;
- deployed settlement-finalization event data disagrees with the SDK `0.29.0` event declaration.

## Users

### Trader

A person who traded or received DreamDEX outcome tokens and wants to know what happened and recover available collateral without understanding protocol internals.

### Public wallet observer

A person who wants to monitor an address without connecting or proving ownership. Observation is read-only; ownership is required to claim or configure private delivery channels.

### Application developer

A builder who needs normalized position, settlement, claimability, receipt, and lifecycle events without independently reconciling the DreamDEX protocol.

### Bot or AI-agent developer

A builder whose automated trader must pause at expiry, receive a settlement event, redeem safely, and recycle released collateral.

### ClaimRail operator

The person operating indexers, workers, notifications, webhook delivery, and an optional isolated gas-sponsoring relayer.

## Goals

1. Make DreamDEX settlement understandable to ordinary users.
2. Find positions exhaustively when the available indexer supports pagination and state clearly when exhaustive discovery cannot be proven.
3. Reconcile indexed discovery with canonical chain state before proposing a financial action.
4. Prevent zero-paying, stale, duplicated, excessive, or otherwise invalid entries from entering a claim transaction.
5. Provide an honest guided manual-claim experience without storing private keys.
6. Produce durable, machine-readable settlement evidence and claim receipts.
7. Deliver the same canonical lifecycle events to the frontend, webhooks, notifications, bots, games, and agents.
8. Support narrowly authorized, opt-in gas-sponsored redemption as a later capability.
9. Provide public documentation that explains the adapter, API, event schemas, security boundaries, and known SDK drift.

## Non-goals

- Replacing DreamDEX's CLOB, oracle, market contracts, or settlement contracts.
- Deciding, disputing, or manually overriding a market outcome.
- Custodying user private keys, seed phrases, or ordinary wallet funds.
- Automatically claiming arbitrary historical wallets without prior authorization.
- Promising that every address scan is complete when an upstream source is capped, unavailable, or inconsistent.
- Treating estimated or indexed PnL as complete when cost history is truncated.
- Building a new trading strategy or another single-process trading bot as the primary product.
- Hiding the scope of ERC-6909 module approval behind a generic “continue” button.
- Supporting email in the initial product; browser and Telegram delivery are sufficient for the first release.
- Claiming current support for asymmetric snapshot-policy voids until such a venue fixture is observed; the calculation must remain vector-generic for compatibility.

## Requirements

### R1. Public wallet lookup

- Accept a valid public EVM address without requiring wallet connection.
- Reject malformed addresses before querying upstream services.
- Separate the watched address from the currently connected wallet.
- Never describe a public watch as proof of ownership.

### R2. Exhaustive position discovery

- Page through positive `OutcomeBalance` rows using stable ordering and offset/cursor semantics supported by the active indexer.
- Deduplicate rows by stable indexer identity and positions by chain, module, market ID, wallet, and outcome index.
- Combine paginated rows with market metadata, router actions, fills, and claim history as available.
- Return a discovery state of `complete`, `partial`, or `failed`, including page count, row count, source, and evidence time.
- Never label a partial total as “all claimable funds.”

### R3. Canonical market normalization

- Use `chainId + binaryModule + marketId` as market identity.
- Store pool and market nonce as time-varying settlement evidence, not primary identity.
- Preserve the market contract state separately from settlement-finalized state.
- Normalize indexed market metadata, module wiring, live market reads, and permanent settlement reads into one `MarketRecord`.
- Represent missing, pending, conflicting, and verified fields explicitly.

### R4. Wallet-position normalization

- Represent the wallet, market ID, outcome index, token ID, current verified balance, side label, lifecycle state, expected payout, and evidence version.
- Treat `outcomeIdx = 0` as Up/YES and `outcomeIdx = 1` as Down/NO for current binary markets.
- Reconstruct entry and cost basis only from available fills and router actions.
- Carry a cost-history completeness flag and avoid definitive realized-performance claims when history is incomplete.

### R5. Settlement reconciliation

- Use indexed reads for discovery and current chain reads for action eligibility.
- Require `isResolved || isVoided` and a finalized settlement record before manual claim preparation.
- Read the current wallet ERC-6909 balance for the exact outcome token ID.
- Read the actual payout vector from deployed market/settlement state.
- Verify pool, nonce, collateral, token IDs, backing, and payout evidence against the selected market ID.
- Calculate expected payout using integer base units and the verified payout vector and fee behavior.
- Never use JavaScript floating point for financial values.

### R6. Plain-language settlement evidence

- Explain the market rule, opening/fixed threshold, closing oracle answer, result, payout rule, and finalization state in ordinary language.
- Provide the oracle question ID/link and resolution/finalization transaction evidence when available.
- Preserve raw payout numerators, denominator, deployed event selector, block, and transaction hashes.
- Mark unavailable or lagging evidence instead of guessing it.

### R7. Safe manual claim plan

- Build a short-lived plan for the connected owner only.
- Exclude losing, zero-paying, zero-balance, already redeemed, stale, and non-finalized entries.
- Coalesce duplicate market/outcome entries before calldata generation.
- Ensure each cumulative amount is no greater than the freshly read balance.
- Split large sets only according to a tested batch policy.
- Simulate every final `redeemMany` call from the owner's address.
- Return the exact chain, module, owner, recipient, entries, exclusions, expected payout, approval requirement/scope, verified block, expiry, simulation result, and integrity hash.
- Refresh or reject a plan whose state or expiry is no longer valid.

### R8. Approval and wallet signing

- Support a viem browser `WalletClient`; no private key may enter the frontend or backend.
- Explain that `setOperator(binaryModule, true)` is module-wide across the owner's IDs in the shared ERC-6909 outcome token.
- Present approval and redemption as two on-chain steps for a fresh wallet.
- Show the exact claim entries and expected return immediately before the redemption signature.
- Reject a connected wallet that does not match the plan owner.
- Prompt for the supported Somnia chain before signing.

### R9. Claim tracking and receipt

- Persist a submitted transaction hash as `pending`, never immediately as success.
- Confirm receipt status and decode deployed `Redeemed` events.
- Re-read outcome-token balances and relevant settlement backing after confirmation.
- Record expected versus actual collateral, owner, recipient, entries, gas, block, timestamp, evidence links, and triggered product events.
- Treat ambiguous transport responses as reconciliation jobs, not permission to resubmit blindly.
- Support `pending`, `confirmed`, `failed`, and `superseded` receipt states.

### R10. Fallback payout tracking

- Detect `PayoutOwed` and `OwedClaimed` events.
- Distinguish a successful burn with fallback credit from direct collateral receipt.
- Surface current fallback balance and the appropriate follow-up action once its live read is verified.

### R11. Inbox frontend

- Provide public address search and optional wallet connection.
- Show claimable total, positions waiting for results, live positions, and history/performance with completeness indicators.
- Group positions into plain-language live, waiting, won-unfinalized, claimable, losing, voided/refundable, submitted, redeemed, and payout-owed states.
- Provide market evidence, claim-plan review, transaction receipt, notifications, developer console, and documentation routes.
- Work at mobile width and meet basic keyboard, screen-reader, contrast, and non-color-only status requirements.
- Render only ClaimRail Core view models; do not reimplement settlement mathematics in React.

### R12. Notifications and subscriptions

- Allow read-only monitoring of any public wallet.
- Require ownership proof before binding private Telegram or browser-delivery settings to a wallet.
- Support `market.locked`, `market.resolved`, `market.finalized`, `market.voided`, `wallet.claimable`, `wallet.payout_owed`, `claim.submitted`, `claim.confirmed`, and `claim.failed` events.
- Deduplicate notifications by canonical event identity.
- Show delivery state, last attempt, retry count, and terminal failure.

### R13. REST API and webhooks

- Expose versioned endpoints for wallet positions, claimables, history, market settlement, claim plans, claims, and subscriptions.
- Return raw integer amounts with decimals and formatted display values.
- Version event envelopes and JSON schemas.
- Sign webhook deliveries with an HMAC and timestamp.
- Retry failed deliveries with bounded exponential backoff, dead-letter terminal failures, and support manual replay.
- Demonstrate at least one independent consumer receiving the same canonical event as the web interface.

### R14. Developer and agent integration

- Provide helpers equivalent to `listClaimables`, `explainSettlement`, `buildRedemptionPlan`, and `subscribeToWallet`.
- Publish a Bot Kit adapter example that pauses after lock, consumes finalized/claimable events, executes an owner-approved action, and resumes after confirmed reconciliation.
- Keep the API useful without importing ClaimRail's private implementation modules.

### R15. Optional gas-sponsored claim

- Obtain an owner-signed EIP-712 authorization scoped to owner, operator, venue, market, outcome, amount, nonce, deadline, chain, and verifying module.
- Store authorization and per-owner nonce state durably.
- Isolate the gas-paying relayer from read-only and notification workers.
- Verify that the contract-recognized recipient is the signed owner.
- Reject expired, malformed, mismatched, replayed, or already-reconciled authorizations.
- Resolve ambiguous or nonce-used responses through receipts and post-state checks before declaring success.
- Describe automatic redemption as opt-in and prospective, never universal or retroactive.

### R16. Documentation

- Publish concepts, lifecycle, identities, source-of-truth rules, approval scope, manual versus auto-claim behavior, API endpoints, webhook schemas, signature verification, TypeScript helpers, Bot Kit integration, protocol evidence, and SDK feedback.
- Distinguish verified deployment behavior from compatibility assumptions and planned functionality.
- Pin the supported chain, contract addresses, and SDK adapter version.
- Document known SDK/indexer limitations and ClaimRail's fallback behavior.

### R17. Operational integrity

- Make ingestion, reconciliation, event creation, notification delivery, and receipt processing idempotent.
- Persist source block, transaction, log index, observed time, and adapter version for financial state changes.
- Recover safely after restarts, duplicate WebSocket logs, indexer lag, and lost HTTP responses.
- Rate-limit public scans and subscription creation.
- Encrypt Telegram identifiers, webhook secrets, and relayer material at rest.
- Keep an immutable audit trail for claim-plan, signing, submission, reconciliation, and delivery transitions.

## Acceptance Criteria

1. A user can enter an unconnected public address and see normalized positions plus an explicit scan-completeness state.
2. A fixture with more than 200 positions is fully paginated, returns 1,044 unique rows, and does not silently use the SDK-limited total.
3. A locked market is displayed as waiting even when an indexed label disagrees with current chain state.
4. A resolved winner is not marked claimable until the permanent settlement record is finalized.
5. A uniform void with balances on both sides produces two positive expected refunds using the verified `[5,000,000, 5,000,000] / 10,000,000` vector.
6. A resolved losing position remains visible in history but never appears in claim calldata.
7. A mixed winner/loser candidate set produces a plan containing only the paying entry.
8. Duplicate rows for one market/outcome are coalesced, and cumulative amount above balance is rejected.
9. Zero amount, unknown market, over-balance, missing approval, length mismatch, and stale-state simulations prevent submission and produce understandable errors.
10. A fresh wallet sees a truthful module-wide approval explanation followed by the separate redemption step.
11. A valid plan includes a successful simulation, integrity hash, verification block, expiry, exact recipient, exclusions, and discovery completeness.
12. A transaction remains pending until a successful receipt, deployed `Redeemed` event, and post-state reconciliation agree.
13. An ambiguous response does not create a duplicate claim submission.
14. Settlement evidence shows the human explanation, raw vector, oracle evidence state, and resolution/finalization transactions without guessed values.
15. One canonical `wallet.claimable` event updates the inbox and reaches a webhook or Bot Kit demo consumer without separate settlement calculations.
16. Browser and Telegram subscriptions deduplicate delivery and expose retry/failure state.
17. A relayed authorization with an expired deadline is rejected; a malformed signature is rejected; a later funded test proves valid relay, owner-pinned payout, and replay rejection.
18. The `/docs` surface contains working request/event examples derived from the same deterministic fixtures used by the frontend tests.
19. Type checking, unit tests, adapter fixture tests, and critical frontend interaction tests pass from documented commands.
20. The demo can show public lookup, waiting-to-claimable transition, evidence, clean claim review, confirmed receipt, notification, independent webhook/bot consumer, and documentation in 2–3 minutes.

## Constraints

- Target chain during development is Somnia Shannon testnet, chain ID `50312`; judge configuration must be rechecked before submission.
- Current research adapter targets `@somnia-chain/markets-sdk@0.29.0` while the starter used `^0.28.1`.
- Contract addresses and deployed ABI selectors are versioned configuration, not hard-coded business assumptions.
- Indexer data is discovery evidence and may lag; financial action gates use current chain state.
- Current official user documentation describes uniform voids; policy-2 snapshot support remains an unobserved compatibility path.
- Financial amounts remain integer base units until display formatting.
- Manual claims are owner-signed. Automatic claims require prior explicit authorization and operator approval.
- The first useful version should not require a new smart contract.
- The frontend, API, webhooks, and agent adapter must consume one shared domain model.
- SDK package declarations and live deployments can drift; raw logs and direct reads must remain inspectable.

## Stories Needed

- Public observer explores a wallet without connecting.
- Trader understands a live, locked, winning-unfinalized, claimable, losing, and voided position.
- Trader reviews a clean multi-position claim and handles first-time approval.
- Trader recovers from a stale plan or failed simulation.
- Trader follows a pending transaction through confirmed receipt reconciliation.
- Trader receives a browser and Telegram claimable notification.
- Developer creates a signed webhook subscription and verifies delivery.
- Bot pauses at lock and resumes after a confirmed claim event.
- Operator diagnoses indexer lag, delivery retry, and ambiguous transaction state.
- Opted-in owner authorizes one future gas-sponsored redemption.

## Open Questions

- Which exact chain, venue, SDK version, and deployed addresses will judges use?
- What batch size is safe across distinct markets in common browser wallets and RPC providers?
- How should ClaimRail discover historical positions when direct `OutcomeBalance` pagination is unavailable or its schema changes?
- Can a payout fallback be induced safely enough to capture real `PayoutOwed` and `OwedClaimed` receipts?
- What is the measured indexer-lag distribution over a meaningful sample of locks, finalizations, and redemptions?
- Is there a supported machine-readable oracle evidence API beyond indexed resolution fields and the explorer deep link?
- Will any judged venue enable policy-2 snapshot voids?
- What nonce-allocation policy best coordinates multiple devices when the current SDK exposes no nonce-used read?
- Which parts of PnL history can be declared complete under public fill/router-action retention limits?

## Source References

- [ClaimRail reverse-engineering brief](../../context/claimrail-reverse-engineering.md)
- [ClaimRail Phase 0 evidence](../../context/claimrail-phase0-evidence.md)
- [DreamDEX protocol reference](../../context/claimrail-dreamdex-protocol-reference.md)
- [ClaimRail product plan](../../context/claimrail-product-plan.md)
- [ClaimRail frontend blueprint](../../context/claimrail-frontend-blueprint.md)
- [DreamDEX Bot Kit research](../../context/dreamdex-bot-kit.md)
- [Somnia organization research](../../context/somnia-chain-organization.md)
- [Read-only Event Contract probes](../../probes/event-contracts/README.md)
- [DreamDEX market lifecycle](https://app.dreamdex.io/docs/developers/event-contracts/market-structure)
- [DreamDEX settlement and voids](https://app.dreamdex.io/docs/trading/event-contracts/settlement-and-voids)
- [DreamDEX raw contract integration](https://prd.smk.somnia.host/docs/contracts/raw-integration)
- [SDK `RedeemAuthorization`](https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/RedeemAuthorization)
