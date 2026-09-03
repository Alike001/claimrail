# ClaimRail database

This package owns ClaimRail's PostgreSQL schema, Drizzle migration, transaction boundaries, and durable outbox queue.

## Guarantees

- EVM base-unit amounts, token IDs, nonces, and block numbers use `numeric(78,0)` and map to JavaScript `bigint`; floating-point storage is never used.
- Stable deployment, market, position, observation, scan, event, subscription, and delivery identities have database uniqueness constraints.
- A canonical transition and its outbox job commit in one transaction or both roll back.
- Jobs are leased with `FOR UPDATE SKIP LOCKED`, recover after lease expiry, use bounded exponential backoff, and eventually enter `dead` state.
- Health and readiness results expose only reachability, schema state, timestamps, and error classes—not connection strings.

## Migrations and tests

```bash
DATABASE_URL=postgresql://... pnpm --filter @claimrail/db db:migrate
pnpm --filter @claimrail/db db:generate
pnpm test:postgres
```

`pnpm test:postgres` starts an ephemeral PostgreSQL 17 container and removes it afterward. It verifies migration replay, process-restart persistence, event/job deduplication, atomic rollback, exact uint256 round-tripping, concurrent leasing, lease recovery, backoff, and dead-letter behavior.
