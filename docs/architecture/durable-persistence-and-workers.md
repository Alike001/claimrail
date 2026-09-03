# Durable persistence and worker architecture

Status: implemented in Phase 4 on 2026-09-03

## Purpose

DreamDEX tells ClaimRail what exists now. ClaimRail must also remember what it has already seen, what changed, and which notifications remain to be delivered. PostgreSQL is that durable memory.

In everyday terms, each live scan is a new inspection sheet. The current market and position rows are the latest master record. Canonical events are the important changes worth announcing. Outbox jobs are sealed delivery slips created in the same database transaction as those announcements.

```text
DreamDEX indexer + Somnia chain
              |
              v
       wallet scan worker
              |
              v
 market / position observations
              |
              v
 deterministic canonical event
              |
              v
 transactional outbox job
              |
              v
 signed webhook delivery
```

## Schema

The generated migration creates 17 tables:

- Protocol truth: `deployments`, `markets`, `market_observations`, `settlement_evidence`.
- Wallet truth: `watched_wallets`, `scan_runs`, `positions`, `position_observations`, `position_scan_members`.
- Claim history: `claims`, `claim_entries`.
- Event delivery: `canonical_events`, `outbox_jobs`, `subscriptions`, `deliveries`, `notification_bindings`.
- Audit: `audit_records`.

Every EVM integer that can exceed JavaScript's safe number range uses PostgreSQL `numeric(78,0)` and Drizzle's `bigint` mapping. JSON serialization converts nested bigint values to decimal strings.

## Idempotency

An event ID is derived from stable semantic state: chain, event type, wallet, market, outcome, and a settlement-state version. Observation block numbers are intentionally not part of that version. Therefore a newer scan can be retained as evidence without sending the same “claimable” notification again.

The repository transaction upserts the latest market and position state, appends source observations, inserts the canonical event, inserts its unique `(event_id, topic)` outbox job, and writes an audit record. A failure anywhere—including the outbox insert—rolls back all of it.

## Leasing and recovery

Workers claim one ready job using an atomic Common Table Expression with `FOR UPDATE SKIP LOCKED`. Concurrent workers skip a row already locked by a peer. A lease has an owner and expiry; if a process dies, another worker can reclaim it after expiry. Failures return with bounded exponential backoff until `max_attempts`, then become `dead` for operator inspection. Outbox jobs only materialize subscriber-specific delivery rows. Every delivery then receives its own lease and attempt counter, so retrying one failed endpoint never duplicates a delivery that another endpoint already accepted.

No Redis or second queue is required for this first product. PostgreSQL owns state, delivery intent, retry history, and audit history together.

## Worker lanes

The runtime always reports four named lanes: market lifecycle, wallet scan, claim receipt, and delivery dispatch. Wallet scan, claim receipt reconciliation, and signed webhook delivery are active when their required configuration is present. Webhook delivery remains idle—and does not lease outbox work—without the shared secret-encryption key.

For webhooks, the worker decrypts each route secret only for the duration of one attempt, builds the versioned canonical envelope, signs the exact serialized body with HMAC-SHA256, and sends the timestamp and signature in dedicated headers. HTTPS, no-redirect behavior, and public-destination checks reduce request-forgery exposure. Success is recorded only for a 2xx response.

Startup readiness checks both database reachability and the migrated schema. Output contains no connection string, SDK endpoint, watched address, private data, or raw error message. SDK/database cleanup is bounded so orchestrator restarts cannot hang forever.

## Verification evidence

The automated PostgreSQL suite proves migration replay, exact uint256 storage, duplicate-event suppression across a reopened database connection, atomic state/outbox rollback, two-worker lease exclusion, expired-lease recovery, backoff, dead-letter state, idempotent subscription fan-out, and independent webhook retry/completion.

An opt-in live Shannon verification ran two separate worker processes against the same public wallet. Each process found eight verified positions and two claimable candidates. After the restart, PostgreSQL contained two scans but still only two canonical events and two pending outbox jobs. This proves that observation history grows while unchanged settlement notifications remain singular.
