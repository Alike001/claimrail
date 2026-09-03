# ADR 0001: One TypeScript workspace with separate web and worker runtimes

Status: accepted for Phase 1

## Context

ClaimRail needs a browser application, server-rendered public pages, REST endpoints, and long-running ingestion/retry work. A solo builder also needs shared financial types without duplicating them between services.

## Decision

Use a pnpm TypeScript workspace. `apps/web` owns Next.js pages and Node Route Handlers. `apps/worker` owns continuous ingestion, reconciliation, and delivery work. Framework-free packages hold domain, adapter, persistence, contracts, and UI code.

## Consequences

- One language and lockfile reduce operational overhead.
- The worker is not constrained by serverless request duration.
- Shared packages require explicit dependency-direction checks.
- Deployment must support both a web process and a worker process.
