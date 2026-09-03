# ClaimRail worker

The worker is the long-running boundary between live DreamDEX/Somnia reads and ClaimRail's durable state. It has four independent lanes:

- `wallet-scan`: opt-in live Shannon wallet discovery, chain verification, and claimable-transition persistence.
- `market-lifecycle`: scaffold for broader market polling in the read API phase.
- `claim-receipt`: leases submitted hashes and verifies receipt, replacement, deployed redemption events, post-balances, settlement backing, actual payout, gas, and owed fallback state.
- `delivery-dispatch`: durable outbox consumer; it refuses to lease work until a real delivery transport is configured.

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

For a continuous worker, use `pnpm dev:worker`. Optional settings are `CLAIMRAIL_WORKER_ID`, `CLAIMRAIL_POLL_INTERVAL_MS`, and `CLAIMRAIL_LEASE_MS`.
