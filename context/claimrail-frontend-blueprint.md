# ClaimRail frontend blueprint

The frontend is one of ClaimRail’s two main products. It is the human-facing consumer of the same ClaimRail Core records used by the API, webhooks, Telegram integration, bots, and agents.

It must never invent a separate claimability calculation in React. The service returns normalized states, evidence, and a short-lived claim plan; the browser renders them and obtains the owner’s signature.

## 1. The frontend promise

> Enter any wallet address to see where its DreamDEX predictions stand. Connect only when you want to prove ownership, manage alerts, or claim.

In ordinary language, the application answers six questions:

1. What predictions does this address still hold?
2. Which ones are still trading or waiting for a result?
3. Which ones won, lost, or were voided?
4. How much can be claimed now?
5. Why did each market settle that way?
6. What exactly will the wallet sign and what happened afterwards?

## 2. Route and surface map

```text
/
├── /wallet/:address
│   ├── inbox tabs: All, Live, Waiting, Claimable, History
│   ├── position detail drawer
│   └── claim-plan review
├── /markets/:marketId
│   └── settlement evidence and lifecycle timeline
├── /claims/:claimId
│   └── submitted/confirmed/failed receipt
├── /notifications
│   └── browser and Telegram subscriptions
├── /developers
│   ├── API keys and webhook endpoints
│   ├── delivery attempts and replay
│   └── event playground
└── /docs
    ├── concepts
    ├── REST API
    ├── webhook events and verification
    ├── TypeScript helpers
    ├── Bot Kit adapter
    └── protocol evidence / SDK feedback
```

The hackathon MVP can combine `/notifications` into wallet settings and keep developer administration simple, but `/docs` is a real product surface from the start.

## 3. Primary screen: Settlement Inbox

### Header

- Address search that accepts any valid public address.
- `Connect wallet` when browsing read-only.
- Network badge fixed to the supported Somnia network.
- Compact sync indicator: `Verified at block …`, `Refreshing`, or `Indexer catching up`.

### Summary strip

- **Claimable now** — verified expected collateral.
- **Waiting for result** — locked or settling positions.
- **Live positions** — still tradable.
- **Realized result** — returned collateral and realized PnL where enough cost data exists.

### Inbox groups

| Group | Plain-language label | Main action |
| --- | --- | --- |
| Trading | `Still live` | View on DreamDEX |
| Locked/Settling | `Waiting for the final result` | View evidence timeline |
| Winning but not finalized | `You won; payout is being prepared` | Notify me |
| Claimable | `Ready to claim` | Review claim |
| Losing | `Finished — this side did not pay` | View result |
| Voided | `Market cancelled; refund depends on the payout rule` | Review refund |
| Submitted | `Claim sent` | Track transaction |
| Redeemed | `Paid` | Open receipt |
| Payout owed | `Claim succeeded; payout is in fallback balance` | Claim owed balance |

Each card shows asset, interval, Up/Down side, amount held, close time, result, expected return, verification freshness, and one clear next action.

## 4. Market and settlement evidence view

This screen explains the decision before exposing raw protocol details.

### Human sentence

Example:

> ETH finished at $2,397.845, above the $2,397.15 strike, so Up won. The market resolved and its payout was finalized on Somnia.

### Evidence ladder

1. Market rule and expiry.
2. Opening/strike value and closing oracle value.
3. Result: Up, Down, or Voided.
4. Payout vector in both friendly and raw form.
5. Market resolution transaction.
6. Settlement finalization transaction.
7. Oracle question and explorer link.

Fields have explicit evidence states: `verified`, `indexer_pending`, `unavailable`, or `conflicting`. ClaimRail never replaces a missing oracle answer with a guess.

## 5. Claim-plan review

This is the most security-sensitive frontend surface.

Before opening the wallet, it shows:

- owner and recipient addresses;
- Somnia chain and collateral token;
- each market, side, amount burned, payout rate, and expected collateral;
- entries excluded because they lose, are stale, or already redeemed;
- total expected return in raw and formatted units;
- whether discovery completed across every available position page;
- whether the final batch simulation passed;
- whether the DreamDEX module's ERC-6909 operator approval is required;
- plain-language approval scope: the module can operate all of this wallet's IDs in the shared outcome-token contract, not only the positions in this claim;
- plan creation block and expiry;
- a warning that any state change causes the plan to refresh.

The action is a guided flow, not a misleading universal one-click promise:

```text
Review -> Connect/switch network -> Approve if needed -> Sign claim -> Confirm -> Receipt
```

Once approval exists, several positions can be sent in one `redeemMany` transaction.

The review model receives coalesced entries from ClaimRail Core. Duplicate market/outcome rows are never rendered as independent burns, and a losing token is never hidden inside a paying batch. If position discovery is incomplete, the primary total reads `Verified from scanned positions` rather than `All claimable funds`.

## 6. Claim receipt

The receipt is useful to both ordinary users and technical judges.

It shows:

- `Paid`, `Failed`, `Pending`, or `Superseded` prominently;
- expected versus actual collateral returned;
- each redeemed entry and decoded `Redeemed` event;
- transaction hash, block, timestamp, gas, sender, and recipient;
- before/after ERC-6909 balances;
- settlement and oracle evidence links;
- notification and webhook events triggered by the claim;
- downloadable JSON for developers.

A submitted transaction hash is displayed as pending, never as successful payment.

## 7. Notifications UI

The user can watch any public address read-only. Ownership is required before changing private delivery settings.

MVP channels:

- browser notifications;
- Telegram linking with a one-time code or wallet signature.

Subscription choices:

- market locked;
- result available;
- funds claimable;
- claim confirmed or failed;
- fallback payout owed.

The UI includes last delivery, retries, and a test notification so alerts are observable rather than magical.

## 8. Developer frontend and documentation

The developer area proves ClaimRail is reusable infrastructure.

- Copyable examples for `listClaimables`, `explainSettlement`, `buildRedemptionPlan`, and `subscribeToWallet`.
- Interactive REST responses using the same testnet fixtures as the dashboard.
- Webhook event catalog with JSON Schema.
- HMAC verification examples.
- Delivery timeline, failure reason, retry count, and manual replay.
- A live console where the demo emits `wallet.claimable` and `claim.confirmed`.
- Bot Kit adapter guide showing how an agent waits, receives settlement, claims, and resumes.

## 9. Required frontend states

The design and tests must cover more than a happy path:

- no address entered;
- invalid address;
- valid address with no positions;
- wallet browsing without connection;
- wrong connected wallet;
- wrong network;
- indexer loading, RPC loading, partial evidence, and source disagreement;
- live, locked, settling, resolved-unfinalized, finalized, voided, losing, and redeemed positions;
- one claimable, many claimables, and an expired claim plan;
- approval required;
- complete multi-page scan and capped/degraded scan;
- simulation passed and simulation failed after a state change;
- rejected signature;
- transaction pending, confirmed, reverted, replaced, and connection lost after broadcast;
- Telegram linked, unlinked, failed, and retrying;
- API/webhook empty, successful, retrying, and dead-lettered.

The Phase 0 JSON captures become deterministic fixtures for these screens. Artificial fixtures are added only for states not yet observed live, such as an asymmetric snapshot-policy void and payout fallback, and are clearly labeled until captured.

## 10. Mobile and accessibility requirements

- The wallet inbox and claim review must work at phone width; cards collapse before financial fields are hidden.
- Amounts never rely on color alone; Up/Down and success/failure use text and icons.
- Transaction steps and status changes are announced to assistive technology.
- Raw hashes have copy controls and readable labels.
- Countdown timers include an absolute date/time and do not imply settlement is guaranteed at expiry.
- The signing summary remains readable inside common wallet-browser layouts.

## 11. Frontend implementation boundary

Implementation begins after the ClaimRail Core contracts and fixtures are stable enough to prevent UI rework. The sequence is:

1. Build a fixture-backed, read-only inbox and settlement evidence view.
2. Replace fixture adapters with ClaimRail API calls while preserving the same view models.
3. Add wallet connection and safe claim-plan signing.
4. Add transaction receipt reconciliation.
5. Add browser/Telegram subscription management.
6. Add developer dashboard and documentation playground.

This still gives frontend work an early start: visual structure can be implemented against captured states while protocol-write tests continue, but no mock payout calculation is allowed to become production logic.

### Browser SDK binding

SDK `0.29.0` supports a browser `WalletClient` directly. The frontend can construct the exported `SomniaMarkets` exchange without a signer for public reads, then call `setSigner({ walletClient })` on wallet connect and `setSigner({})` on disconnect. Its lazy `trader` can execute the already-reviewed `redeemMany` entries or produce EIP-712 authorization without a private key entering ClaimRail.

The package's documented root `createClient` export is missing in `0.29.0`, so the frontend should use the actually exported `SomniaMarkets` surface until that package defect is fixed. ClaimRail's tests must pin the SDK version and compile the browser binding; documentation examples alone are not enough.

## 12. Hackathon frontend proof

The strongest demo uses one verified state transition across several surfaces:

1. Search a public wallet without connecting.
2. Watch a market move from waiting to claimable.
3. Open the human explanation and raw evidence.
4. Review a plan that excludes a losing token.
5. Connect the owner, sign, and show a confirmed receipt.
6. Show the Telegram alert and webhook console receiving the same canonical events.
7. End on `/docs` with a second consumer integration.

That demonstrates UX, technical depth, and ecosystem reuse in one story.
