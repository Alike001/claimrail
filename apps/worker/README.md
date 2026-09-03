# ClaimRail worker

The worker is the long-running boundary between live DreamDEX/Somnia reads and ClaimRail's durable state. It has four independent lanes:

- `wallet-scan`: opt-in live Shannon wallet discovery, chain verification, and claimable-transition persistence.
- `market-lifecycle`: scaffold for broader market polling in the read API phase.
- `claim-receipt`: leases submitted hashes and verifies receipt, replacement, deployed redemption events, post-balances, settlement backing, actual payout, gas, and owed fallback state.
- `delivery-dispatch`: materializes one delivery per matching verified subscription, then leases,
  sends, retries, and dead-letters signed webhooks, encrypted browser-push routes, and encrypted
  Telegram chats independently.

The worker stores no private key and submits no transaction. Its health output excludes database URLs, public endpoints, watched addresses, and error messages.

## One-shot Shannon sync

Apply migrations first, then explicitly provide the public address to monitor:

```bash
DATABASE_URL=postgresql://... pnpm --filter @claimrail/db db:migrate
DATABASE_URL=postgresql://... \
  CLAIMRAIL_SYNC_WALLET=0x... \
  pnpm --filter @claimrail/worker sync:shannon
```

`sync:shannon` sets one-shot mode. Repeating it records a new scan but does not create another canonical event or outbox job unless the position's meaningful settlement state changed. The same cycle also reconciles one pending claim transaction, if present.

Claim transactions use expiring PostgreSQL leases. A missing receipt is retried. A reverted or evidence-conflicting receipt fails. A dropped hash is marked `superseded` only when a verified submission nonce is lower than the owner's latest mined transaction count. Legacy submissions without a stored nonce remain pending rather than being guessed.

For a continuous worker, use `pnpm dev:worker`. Set the same base64-encoded 32-byte `CLAIMRAIL_SECRET_ENCRYPTION_KEY` on the web and worker processes to activate signed webhook delivery. Generate a new key with `openssl rand -base64 32`; do not commit its value. Optional settings are `CLAIMRAIL_WORKER_ID`, `CLAIMRAIL_POLL_INTERVAL_MS`, and `CLAIMRAIL_LEASE_MS`.

Browser delivery additionally requires one persistent VAPID key pair. Generate it once with
`pnpm --filter @claimrail/worker exec web-push generate-vapid-keys`, then set
`CLAIMRAIL_VAPID_SUBJECT`, `CLAIMRAIL_VAPID_PUBLIC_KEY`, and `CLAIMRAIL_VAPID_PRIVATE_KEY`. The web
process receives only the public key; the worker receives the full pair. Push endpoints and browser
encryption keys are encrypted with `CLAIMRAIL_SECRET_ENCRYPTION_KEY` before storage. Missing or
partial VAPID configuration leaves browser delivery visibly unavailable and never affects webhook
leasing.

Telegram delivery requires a bot created through BotFather. Set `CLAIMRAIL_TELEGRAM_BOT_USERNAME`
on the web process and set `CLAIMRAIL_TELEGRAM_BOT_TOKEN` on both the web process and worker. Also
set a random `CLAIMRAIL_TELEGRAM_WEBHOOK_SECRET` on the web process and register
`/api/v1/subscriptions/telegram/webhook` with Telegram using that value as `secret_token`. A wallet
signature creates a ten-minute `/start` link; ClaimRail stores only the link-token hash and encrypts
the resulting private chat ID at rest. Telegram `403` responses permanently deactivate that route.

The outbound transport accepts HTTPS only, rejects credential-bearing or local/internal destinations, resolves every hostname before sending, and refuses any address set containing a non-public IP. It never follows redirects. A receiver gets `claimrail-delivery-id`, `claimrail-timestamp`, and `claimrail-signature` headers; the signature covers the exact `timestamp.rawBody` bytes.
