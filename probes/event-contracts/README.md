# ClaimRail Event Contract probe

This is an isolated, read-only Phase 0 evidence collector. It does not trade, approve tokens, redeem positions, or accept a private key.

It records:

- network and deployed SDK addresses;
- indexed binary-market rows and status counts;
- current on-chain state for selected markets;
- raw payout vectors and settlement records;
- indexed resolution evidence and status history;
- relevant lifecycle/finalization/redemption logs;
- optional indexed and on-chain wallet-position evidence.

## Run

```bash
npm install
npm run typecheck
npm run probe
npm run probe:pagination
npm run simulate:redemption
```

Optional arguments:

```bash
npm run probe -- --wallet 0xYourPublicAddress
npm run probe -- --market 0xBytes32MarketId
npm run probe -- --markets 8 --list-limit 100
npm run probe -- --wallet 0xYourPublicAddress --wallet-event-lookback 250000
npm run probe -- --market 0xBytes32MarketId --terminal-event-tail 25000
npm run probe -- --wallet 0xYourPublicAddress --verify-position-limit 25
npm run probe:pagination -- --wallet 0xYourPublicAddress --page-size 100
```

Environment overrides are optional:

```bash
RPC_URL=https://api.infra.testnet.somnia.network \
WS_RPC_URL=wss://api.infra.testnet.somnia.network/ws \
INDEXER_URL=https://dev.smk.somnia.host/v1/graphql \
npm run probe
```

Each run creates `evidence/runs/<UTC timestamp>/`. Big integers are serialized as decimal strings. An individual failed read is captured as an error record instead of discarding the rest of the run.

Wallet-level `PayoutOwed` and `OwedClaimed` log discovery is deliberately bounded to the latest 100,000 blocks by default; override it with `--wallet-event-lookback`. Position and claimable discovery still comes from the indexed portfolio APIs. A production ClaimRail indexer will persist events from its configured deployment/start block instead of rescanning from genesis for every request.

The probe verifies up to 200 portfolio rows directly against ERC-6909 balances by default. `--verify-position-limit` can shorten an exploratory run. Every claimable candidate is always checked separately against its current outcome balance, settlement record, payout vector, pool, and nonce.

For an old terminal market, lifecycle/redemption event collection ends 10,000 blocks after its indexed resolution block by default. Override this with `--terminal-event-tail` when investigating a later claim. This keeps a one-shot probe bounded on Somnia's fast block cadence; it is not the retention policy for the planned durable event ingester.

## Safety boundary

The probe intentionally has no write client and no private-key configuration. Broadcast/receipt behavior—including real approval UX and `redeemFor` execution—will be tested later with a separately funded test wallet after the read model is understood.

`npm run simulate:redemption` exercises known public testnet fixtures using `eth_call` and `eth_estimateGas`. It supplies a public address as the simulated caller but has no key and cannot broadcast or mutate chain state. These simulations establish validation and atomicity behavior; a funded test wallet is still required to verify real receipts, approval UX, and relayed authorization execution.
