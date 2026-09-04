# ClaimRail API

ClaimRail exposes a small, versioned HTTP surface for dashboards, bots, games, and agents. All
amounts returned by these endpoints are integer base-unit strings. Every wallet scan includes
`completeness`, `observedAt`, and `verifiedBlock`, so a consumer can distinguish a complete answer
from a partial or failed scan.

## Endpoints

- `GET /api/v1/wallets/:address/positions` — all normalized positions found for a wallet.
- `GET /api/v1/wallets/:address/claimables` — claimable and void-refundable positions plus a total.
- `GET /api/v1/wallets/:address/history` — settled and post-settlement entries. `realizedDelta` is
  `null` until complete cost-basis history is available; ClaimRail does not estimate missing PnL.
- `GET /api/v1/markets/:marketId/settlement` — the reconciled market record and plain settlement
  explanation.
- `GET /api/v1/openapi.json` — the OpenAPI 3.1 discovery document.
- `GET /api/v1/schemas.json` — the Draft 2020-12 JSON Schema bundle generated from the same runtime
  contracts.
- `POST /api/v1/claims/prepare` — refreshes the complete wallet scan and returns either the exact
  module-wide approval requirement or a short-lived, simulated, integrity-hashed `redeemMany` plan.
- `POST /api/v1/claims/submissions` — records a wallet-broadcast batch hash immediately as
  `pending`; it does not claim that a transaction succeeded.
- `GET /api/v1/claims/:claimId` — returns the aggregate claim state and every batch receipt,
  including nonce, attempts, block, gas, actual collateral, owed fallback, and proof metadata.
  Add `?download=1` for a JSON attachment.
- `GET /api/v1/subscriptions/browser/config` — reports whether VAPID browser delivery is configured
  and returns only the public application-server key.
- `POST /api/v1/subscriptions/browser/challenges` — encrypts a standards-shaped PushSubscription and
  returns a readable wallet challenge pinned to its endpoint fingerprint and event preferences.
- `POST /api/v1/subscriptions/browser/verify` — consumes the ownership proof and activates delivery
  to that browser. Raw endpoint and browser encryption keys are never returned by list APIs.
- `POST /api/v1/subscriptions/telegram/challenges` — creates a readable, owner-bound Telegram
  notification challenge.
- `POST /api/v1/subscriptions/telegram/verify` — verifies the wallet proof and returns a ten-minute
  one-time `/start` link. Only the link-token hash is stored.
- `POST /api/v1/subscriptions/telegram/webhook` — accepts Telegram updates only with the configured
  secret header, consumes the one-time token, and stores the resulting chat ID encrypted.
- `POST /api/v1/access/challenges` — creates a short-lived, non-financial ownership message for the
  delivery console.
- `POST /api/v1/access/verify` — consumes that message once and returns a 15-minute opaque token
  scoped to delivery reads, a non-financial notification test, and dead-letter replay. Only its hash
  is stored.
- `GET /api/v1/deliveries` — lists delivery states for the authenticated route owner.
- `GET /api/v1/deliveries/:deliveryId` — returns the exact canonical event plus every stored send
  attempt, HTTP status, signing version, timestamp, and failure reason.
- `POST /api/v1/deliveries/:deliveryId/replay` — requeues an owned delivery only when it is dead. It
  adds a bounded retry allowance; it does not duplicate the canonical event or authorize finance.
- `POST /api/v1/notifications/test` — queues one explicit `notification.test` event for every active
  verified route owned by the authenticated wallet. It has a 60-second cooldown and can never be
  interpreted as a settlement or payout.

Invalid addresses or market IDs receive a `400`. Upstream DreamDEX/Somnia failures receive a `503`.
Read responses use `Cache-Control: no-store` because settlement and wallet state can change.

## Manual claim boundary

Claim preparation is server-side and signer-free. A ready plan is persisted with its exact entries,
exclusions, verified block, simulations, expiry, and evidence versions. The browser then checks that
the connected address is the plan owner and that the wallet is on Somnia Shannon (`50312`).

If approval is absent, the browser requests `setOperator(binaryModule, true)` from the owner. This is
a broad approval across every ID that owner holds in the shared DreamDEX ERC-6909 outcome-token
contract. The approval receipt must be confirmed before ClaimRail rebuilds and simulates the plan.

The browser broadcasts exact `redeemMany` calldata from the fresh plan and immediately posts the
transaction hash to `/api/v1/claims/submissions`. ClaimRail stores it as pending. The worker calls it
confirmed only when the canonical receipt, deployed `Redeemed` entries, amounts, post-burn balances,
and settlement backing agree. Reverts become failed. A missing hash becomes superseded only when the
owner's mined transaction count proves its nonce was consumed. A mined receipt alone is not enough.

`GET /api/v1/wallets/:address/history` includes current terminal positions and durable ClaimRail
receipts. Returned funds are exact. `realizedDelta` remains `null` and the UI says PnL is incomplete
when the indexer does not provide complete cost basis.

Neither endpoint accepts a private key or signature. Production claim preparation requires
`DATABASE_URL`; ClaimRail refuses to issue an ephemeral ready plan when durable storage is absent.

## Delivery-console boundary

Public wallet monitoring remains signature-free, but webhook destinations and failures are private
operational data. Delivery endpoints therefore reject address parameters as authority. The owner
first signs a readable challenge that explicitly excludes trades, claims, token approvals, and gas
spending. A successful proof yields a 15-minute token with `deliveries:read`,
`notifications:test`, and `deliveries:replay` scopes. The web app keeps it only in memory, so a
refresh requires a new proof.

Replay is deliberately narrow: the delivery must belong to the authenticated owner and already be
in the terminal `dead` state. The original delivery and canonical event identities stay unchanged;
the worker receives eight additional bounded attempts and writes an immutable replay audit record.

The explicit test endpoint bypasses each route's financial event preferences only for
`notification.test`. It writes an auditable canonical service event, queues the same encrypted or
signed delivery records used by real events, and rate-limits each owner. Its fixed copy says that it
is not a market settlement or claimable payout.

## Generated contracts and TypeScript client

The checked-in [OpenAPI document](openapi.generated.json) and
[JSON Schema bundle](json-schemas.generated.json) are generated from `packages/contracts`. The root
verification command runs `pnpm api:check`, so a runtime-schema change fails until both artifacts are
regenerated with `pnpm api:generate`.

`@claimrail/client` validates both inputs and responses at runtime and exposes the focused settlement
operations:

```ts
const rail = new ClaimRailClient({ baseUrl: "https://claimrail.example" });

const claimables = await rail.listClaimables(owner);
const settlement = await rail.explainSettlement(marketId);
const plan = await rail.buildRedemptionPlan(owner);
const route = await rail.subscribeToWallet({ owner, destination, eventTypes, signMessage });
```

The signer callback receives only ClaimRail's readable, non-financial subscription challenge. The
client never accepts a private key. Save the returned webhook secret once; ClaimRail does not expose
it again.

## Receiving events and handing off to DreamDEX Bot Kit

`examples/webhook-consumer` reads the exact raw request bytes, verifies the timestamped HMAC, then
parses the versioned envelope. A receiver must not parse and reserialize JSON before verification.

`examples/bot-kit-adapter` demonstrates the strategy handoff. Configure the Bot Kit with
`AUTO_CLAIM=false`, pause a market after `market.locked` or `wallet.claimable`, request an
owner-approved ClaimRail plan, and resume only after the matching `claim.confirmed`. Duplicate
events are ignored; failed and superseded claims stay paused for operator review. This keeps the Bot
Kit trading key outside ClaimRail and avoids coupling a strategy's trade nonce flow to settlement.
