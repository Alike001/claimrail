# ADR 0002: PostgreSQL owns durability, jobs, and the transactional outbox

Status: accepted for the first product

## Context

ClaimRail must survive restarts and deduplicate lifecycle events, claim reconciliation, notifications, and webhook attempts. Adding a cache and queue service would increase solo-builder operations before throughput proves it necessary.

## Decision

Use PostgreSQL for canonical records, job leases, attempts, dead letters, and a transactional outbox. Workers will lease work with database row locking. Drizzle owns authored schema and migrations. Redis is not required initially.

## Consequences

- A state change and its outgoing event can commit atomically.
- One database backup contains the audit and delivery history.
- Job SQL and indexes require deliberate load testing.
- A dedicated queue can be added later behind repository interfaces if measured load justifies it.
