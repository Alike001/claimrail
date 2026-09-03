# ClaimRail product and technical plan

Based on the reverse-engineering snapshot dated 2026-09-03.

## Current execution status

ClaimRail is past idea validation and in the final part of protocol Phase 0. The market lifecycle, identities, position model, payout evidence, uniform void behavior, SDK boundary, `redeemMany` failure modes, approval scope, relayed-authorization shape, pagination gap, API direction, and frontend surfaces are now documented from implementation evidence.

The safe next build step is the read-only portion of **ClaimRail Core**: canonical types, paginated discovery, on-chain reconciliation, payout calculation, claim-plan construction, and fixture-driven tests. A fixture-backed frontend inbox can begin as soon as those view models compile; the frontend does not need to wait for the relayer.

The remaining Phase 0 write-risk work stays explicit:

- broadcast a controlled manual approval and redemption with a dedicated test wallet;
- broadcast a valid `redeemFor`, then test replay and ambiguous-response reconciliation;
- capture `PayoutOwed`/`OwedClaimed` if the fallback can be induced safely;
- profile distinct-market batches and measure indexer lag across more transitions;
- confirm the exact judged venue/deployment before submission.

## 1. Product definition in plain language

ClaimRail is like combining four familiar services:

- **Parcel tracking:** it tells you where each prediction is—open, locked, finished, voided, or paid.
- **A bank’s pending-deposit screen:** it finds money that belongs to you but has not yet been moved back into spendable collateral.
- **A claims desk:** it prepares the correct forms and lets the actual owner approve payment.
- **A registered-mail receipt:** it shows what decided the result, what was signed, where the money went, and the transaction proving it.

The same information is also delivered to software. A game can show “your reward is ready,” a bot can pause until collateral is released, and an AI agent can receive a verified event instead of repeatedly guessing from raw chain data.

The concise pitch is:

> **ClaimRail is the wallet-addressed post-trade rail for DreamDEX Event Contracts. It turns market lifecycle changes into verified, deduplicated settlement events, safe claim plans, user-signed redemptions, and delivery receipts for people and software.**

## 2. A real-world user story

Ada makes ten Up/Down predictions from DreamDEX, a game, and a trading bot. They all settle at different times.

Without ClaimRail, Ada must remember every market, reopen each application, understand whether it resolved or voided, find the correct outcome token, and submit the correct redemption. A bot developer must build the same polling and retry logic again.

With ClaimRail:

1. Ada enters or connects her public wallet address. Monitoring requires no private key and no spending permission.
2. ClaimRail groups her positions into **Live**, **Waiting for result**, **Claimable**, **Lost**, **Voided**, and **Paid**.
3. When a market finishes, ClaimRail checks the indexed result, then verifies current market state and Ada’s actual token balance on-chain.
4. ClaimRail sends a browser or Telegram message: “BTC 15-minute market resolved Up. You hold 12 winning contracts. Estimated return: 12 USDso.”
5. The detail page shows the opening value, closing value, winning rule, payout vector, oracle question, and transaction evidence.
6. Ada presses **Claim all**. ClaimRail refreshes the plan, explains the exact markets, amounts, recipient, and chain, then asks Ada’s wallet to sign.
7. ClaimRail watches the transaction, confirms the resulting balances, and stores a receipt.
8. A subscribed bot receives `wallet.claimable` and later `claim.confirmed`, so it can recycle the released collateral.

ClaimRail never receives Ada’s private key. For ordinary claims, Ada remains the only signer. Optional future auto-claim requires explicit advance authorization and still pays Ada directly.

## 3. Product boundaries

### Build first

- Read-only address lookup and optional wallet connection.
- Complete position inbox with plain-language lifecycle explanations.
- Claimable total and per-position expected payout.
- A fresh on-chain claim planner.
- User-signed `redeemMany`, with approval orchestration if needed.
- Settlement evidence and claim receipts.
- Browser and Telegram notifications.
- A developer REST API, signed webhooks, retry history, and one Bot Kit adapter demo.
- Prediction, settlement, redemption, and realized-PnL history.

### Do not claim to build

- A new oracle.
- A replacement for DreamDEX finalization.
- A new exchange or trading bot.
- Custodial wallets or stored private keys.
- Universal automatic redemption without prior authorization.
- A new smart contract unless a live integration test proves the official surfaces insufficient.

### Later, after the core is trustworthy

- Gas-sponsored `redeemFor` using advance EIP-712 authorizations.
- Email, mobile push, Farcaster, Discord, and generic Push Protocol channels.
- Account abstraction and policy-controlled agent wallets.
- Other prediction-market adapters.

## 4. One core, three product surfaces

```text
DreamDEX indexer + Somnia chain + oracle evidence
                      |
              Protocol adapters
                      |
       Normalizer and reconciliation engine
                      |
     Event store + claim planner + receipt store
              /          |           \
      Trader inbox   API/webhooks   Agent adapter
```

The three surfaces must not calculate settlement independently. They consume the same normalized records.

## 5. Source-of-truth rules

| Question | Preferred source | Safety rule |
| --- | --- | --- |
| Which markets/positions might matter? | Paginated indexer adapter plus SDK portfolio/claimable/history reads | Discovery may be stale or incomplete; record scan completeness and do not sign from it alone |
| Is the market terminal? | `getMarketOnchain(marketId)` / settlement record | Must be terminal before claim preparation |
| What does the wallet hold now? | ERC-6909 on-chain balance by outcome ID | Re-read immediately before building the transaction |
| Why did it resolve this way? | `getMarketResolution`, oracle question, oracle explorer | Show missing indexed evidence as pending |
| Did the claim succeed? | Confirmed receipt plus `Redeemed` event and post-write balances | A submitted hash is not confirmation |
| Was the user notified? | ClaimRail delivery record | Notification success says nothing about financial state |

## 6. Canonical states

### Market state

`listed | trading | locked | resolved | voided | finalized`

“Finalized” is preserved separately because the SDK/events distinguish the permanent settlement record from only knowing the market result.

### Wallet-position state

`open | locked | winning_unfinalized | claimable | losing | void_refundable | claim_submitted | redeemed | payout_owed`

### Delivery state

`pending | delivered | retrying | dead_lettered`

These must not be collapsed into one generic `status`; a market state, a wallet’s financial state, and a notification’s delivery state describe different things.

## 7. Stable identifiers and idempotency

Recommended position identity:

```text
chainId + binaryModule + marketId + outcomeIdx + walletAddress
```

Recommended emitted-event identity:

```text
hash(chainId, eventType, walletAddress, marketId, outcomeIdx, stateVersion, txHash?)
```

Every worker should be safe to run twice. A restart, duplicate WebSocket event, slow indexer, webhook timeout, or lost HTTP response must not create a second financial action or an endless notification loop.

## 8. API surface

### User/developer reads

```http
GET /v1/wallets/:address/positions
GET /v1/wallets/:address/claimables
GET /v1/wallets/:address/history
GET /v1/markets/:marketId/settlement
GET /v1/claims/:claimId
```

### Claim planning

```http
POST /v1/claims/prepare
POST /v1/claims/:claimId/submitted
```

`prepare` returns a short-lived plan containing fresh, normalized entries, expected payout, required chain, recipient, discovery completeness, approval requirement and scope, a successful simulation result, calldata/typed request, expiry, and an integrity hash. The server never signs for an ordinary external wallet.

### Subscriptions

```http
POST   /v1/subscriptions
GET    /v1/subscriptions/:id
DELETE /v1/subscriptions/:id
GET    /v1/deliveries?subscriptionId=:id
```

Webhook subscriptions should require a verification challenge. Wallet-to-Telegram binding should use a one-time link code or wallet signature rather than trusting an entered address.

## 9. Standard events

```text
market.locked
market.resolved
market.finalized
market.voided
wallet.claimable
wallet.payout_owed
claim.plan_created
claim.submitted
claim.confirmed
claim.failed
```

Every webhook envelope should include:

- unique event ID and schema version;
- creation time and chain ID;
- wallet, market ID, outcome, and human-readable market label;
- raw integer amounts, decimals, and formatted amounts;
- settlement/evidence links;
- relevant transaction hashes;
- an HMAC signature and timestamp for recipient verification.

Webhook delivery needs exponential backoff, a maximum-attempt policy, delivery logs, and manual replay.

## 10. Claim planner algorithm

1. Normalize and validate the address and chain.
2. Use the dedicated paginated `OutcomeBalance` adapter, plus `getClaimable(address)` and portfolio/history data, to discover candidates. Mark the scan incomplete if any source cap or page failure is encountered.
3. For every candidate, read `getMarketOnchain(marketId)`.
4. Reject a non-terminal or mismatched pool/nonce record.
5. Read the wallet’s current ERC-6909 balance for the specific outcome ID.
6. Recompute whether the outcome pays from `payoutNumerators / payoutDenominator`; never assume every void is 50/50.
7. Read settlement fee configuration rather than hardcoding zero.
8. Compute the expected payout in base units.
9. Remove zero, losing, already-redeemed, or stale entries.
10. Coalesce duplicate market/outcome entries and prove each cumulative amount is within the fresh balance.
11. Split very large sets into gas-safe batches after profiling.
12. Determine whether the binary module’s shared ERC-6909 operator approval exists.
13. Simulate every final `redeemMany` batch from the owner address and reject any revert.
14. Return a short-lived, integrity-hashed plan and a plain-language explanation.
15. Immediately before wallet submission, refresh or reject an expired plan.
16. After broadcast, track the receipt, decode `Redeemed`, reread balances, and generate the receipt.

If a batch reverts, rebuild from chain state. Do not blindly resend the old calldata.

## 11. Settlement receipt

A receipt should contain:

- chain, module, venue, market ID, pool, and market nonce;
- asset, interval, opening time, lock/expiry time;
- position side and amount held;
- opening value, closing value, payout vector, and winning side;
- void status/reason when applicable;
- oracle question ID and explorer link;
- resolution/finalization transaction hashes;
- expected payout and actual collateral received;
- approval transaction if one was required;
- claim transaction, block, status, gas, and timestamp;
- recipient wallet;
- ClaimRail plan/event IDs and evidence snapshot time.

This is both user reassurance and machine-readable audit data.

## 12. Security and trust rules

- Never request or store a wallet private key.
- Do not imply that entering an address proves ownership; it only creates a public watch.
- Require ownership proof before exposing private subscription management or binding Telegram identity.
- Render exact recipient, chain, markets, sides, amounts, expected payout, and approval scope before signing.
- Describe `setOperator(binaryModule, true)` honestly as permission for the module across all of the owner's IDs in the shared ERC-6909 outcome-token contract.
- For auto-claim, store each EIP-712 authorization and nonce durably; never infer financial success from an “already used” error without receipt or post-state evidence.
- Keep relayed authorizations narrow to operator, venue, market, outcome, amount, nonce, and deadline; verify that the payout recipient is the signed owner.
- Treat indexer values as hints until reconciled with chain state.
- Preserve raw integers and decimals; never use JavaScript floating point for claim amounts.
- Check receipt status and decoded events; a transaction hash alone is insufficient.
- Rate-limit public address scans and subscription creation.
- Sign outbound webhooks and protect against replay.
- Encrypt Telegram/chat identifiers and webhook secrets at rest.
- Separate read-only workers from any future relayer key.
- Keep an immutable audit trail of plan creation, submission, confirmation, delivery attempts, and manual replay.

## 13. Build sequence without deadline pressure

### Phase 0: protocol probe

Build a small test harness against the judged testnet and capture fixtures for resolved winner, loser, void, already redeemed, stale indexer, mixed decimals, recycled pool, pagination, and reverted transaction. Profile batch gas and confirm broadcast approval/authorization behavior.

Exit condition: the team can explain and reproduce every claim transition from raw chain/indexer data.

### Phase 1: ClaimRail core

Implement typed DreamDEX adapters, canonical domain records, reconciliation, claimability calculation, claim planner, and receipt parser. Use fixture-driven tests before UI work.

Exit condition: `listClaimables(address)`, `explainSettlement(marketId)`, and `buildRedemptionPlan(address)` return correct deterministic results.

### Phase 2: durable service

Add the database, lifecycle ingestion, idempotent workers, event store, REST endpoints, subscription model, signed webhook delivery, retry/backoff, and reconciliation jobs.

Exit condition: restarts and duplicate source events do not duplicate financial events or deliveries.

### Phase 3: trader inbox

Build address lookup, wallet connection, lifecycle sections, claim total, explanation drawer, clear-signing screen, approval/claim transaction flow, and receipt/history pages.

Exit condition: a new user can understand and safely claim without knowing ERC-6909, payout vectors, or market nonces.

### Phase 4: notifications

Add browser notifications and Telegram linking/delivery. Reuse the same subscription/event system used by webhooks.

Exit condition: claimable alerts are sent once, failures are visible/retryable, and alerts link to the verified claim plan.

### Phase 5: developer and agent proof

Publish the API schema, webhook verification example, TypeScript helper functions, and a small Bot Kit adapter that pauses until settlement and resumes after `claim.confirmed`.

Exit condition: a second tiny application receives `wallet.claimable` without importing ClaimRail’s internal code.

### Phase 6: opt-in sponsored redemption

Add narrowly scoped EIP-712 authorization capture, a durable per-owner nonce ledger, a separated relayer, gas policies, post-state reconciliation, and `redeemFor` execution. The interface must disclose that the underlying ERC-6909 module approval is broader than the individual signed authorization.

Exit condition: the relayer cannot redirect payout or exceed the signed market/outcome/amount/deadline.

## 14. Minimum verification matrix

- Resolved winner becomes claimable with correct payout.
- Resolved loser is shown as lost and never included in calldata.
- Uniform void includes both held sides at half payout.
- Any future snapshot-policy void uses the actual `[p, 1-p]` payout vector; keep this as a labeled compatibility fixture until one is observed live.
- Locked market remains pending even if the indexer briefly disagrees.
- Finalized market older than one page is still discovered.
- Recycled pool does not attach an old position to a new market.
- Mixed 6/18-decimal fixtures format correctly.
- Already redeemed position disappears after post-write reconciliation.
- One stale batch entry causes a plan refresh, not a blind retry.
- Duplicate entries are coalesced; their cumulative amount can never exceed the fresh balance.
- A winner/loser mixed candidate set emits calldata only for the paying entry.
- An unapproved wallet receives a clearly explained module-wide approval step before claim simulation/submission.
- A wallet with more than one position page reports complete pagination or an explicit degraded total.
- Connection loss after broadcast finds the transaction outcome before resubmitting.
- Duplicate source events emit one canonical event.
- Failed webhooks retry, then dead-letter, and can be replayed.
- Wrong-chain wallet is prompted to switch before signing.
- Wallet without gas receives a clear explanation, not a generic failure.
- Settlement evidence distinguishes unavailable, pending, and verified fields.

## 15. Hackathon demonstration

A strong 2–3 minute demo should show one settlement powering multiple consumers:

1. Open a watched wallet containing live, locked, claimable, voided, and historical positions.
2. Let one market finalize or replay a captured testnet event deterministically.
3. Show the inbox update and a Telegram alert.
4. Open the evidence view and explain the result in one sentence.
5. Press Claim all, show the clear-signing summary, sign, and confirm the receipt.
6. Show a small bot or webhook console receiving `wallet.claimable` and `claim.confirmed`.
7. End on the API docs to prove this is reusable infrastructure, not only one dashboard.

## 16. How this maps to judging

| Criterion | ClaimRail proof |
| --- | --- |
| Innovation — 20% | A standardized post-trade settlement/delivery rail rather than another isolated trading bot |
| Technical implementation — 25% | SDK plus on-chain reconciliation, ERC-6909 balances, payout vectors, batched claims, receipt decoding, idempotent events, signed webhooks |
| UX/design — 20% | Plain-language lifecycle, transparent claim plan, one guided action, evidence, and receipts |
| Business/ecosystem impact — 20% | One integration benefits traders, dashboards, games, bots, and agents and helps collateral return to use |
| Presentation — 15% | One market transition visibly updates the UI, Telegram, webhook consumer, and on-chain receipt |

## 17. Differentiation checklist

ClaimRail should be rejected or re-scoped if it becomes only:

- a prettier version of `getClaimable()`;
- another single-wallet auto-claim bot;
- a polling cron with one webhook;
- a portfolio dashboard with no on-chain reconciliation;
- an oracle explorer link with no structured receipt;
- a private API used only by its own frontend.

It earns the “rail” name only when at least two independent consumers use the same durable, verified settlement events and claim records.
