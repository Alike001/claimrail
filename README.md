# ClaimRail

ClaimRail is planned as a neutral settlement and notification layer for DreamDEX Event Contracts. It will reconcile indexed data with canonical Somnia contract state, explain market outcomes, identify claimable payouts, prepare safe user-signed redemptions, and publish the same lifecycle information to people, APIs, bots, games, and agents.

## Current status

Phases 1–5 are complete. The Phase 6 manual-claim path and Phase 7 receipt/history path are implementation-complete; their shared final live proof—a controlled owner-signed Shannon claim moving through durable reconciliation—remains pending. The live approval gate and exact `redeemMany` simulation have already passed without a signer on the server. The workspace now supports a dependency-free canonical domain model, lifecycle reconciliation, integer-only payout calculation, a live DreamDEX adapter, durable PostgreSQL persistence, and the approved V3 settlement interface. Any public address can be exhaustively scanned, verified against Somnia and `BinarySettlement`, and converted into normalized positions and safe claim assessments. The responsive inbox, settlement evidence, manual claim planner, claim receipt, honest history, REST API, OpenAPI discovery, and documentation page expose that state to people and software.

The implementation sequence lives in [the implementation plan](.thoughts/plans/2026-09-03-claimrail-implementation.md). The product contract lives in [the specification](.thoughts/specs/2026-09-03-claimrail.md).

## Workspace

- `apps/web`: Next.js App Router shell for the future dashboard, REST API, and documentation pages.
- `apps/worker`: long-running ingestion, reconciliation, outbox, and delivery runtime.
- `packages/core`: dependency-free domain rules and claim mathematics.
- `packages/dreamdex`: versioned DreamDEX SDK and on-chain adapter.
- `packages/db`: PostgreSQL and Drizzle persistence.
- `packages/contracts`: validated public API and event schemas.
- `packages/ui`: shared accessible interface components.
- `fixtures/dreamdex`: immutable, checksummed Shannon testnet evidence for tests only.
- `probes/event-contracts`: independent read-only reverse-engineering tools and evidence.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm probe:typecheck
pnpm --filter @claimrail/dreamdex smoke:shannon
pnpm test:postgres
pnpm test:e2e
```

`pnpm verify` runs formatting, linting, strict TypeScript checks, the dependency-boundary check, fixture integrity verification, Core and DreamDEX coverage gates, unit/integration runners, ephemeral PostgreSQL tests, and the production build. `pnpm test:e2e` runs the desktop/mobile browser gate. The separately named smoke command makes public Shannon indexer/RPC calls with no signer.

## Safety boundary

Fixture data is visibly labelled, disabled in production, and never presented as live funds. The browser can now request owner-signed DreamDEX approval and exact `redeemMany` transactions, but neither frontend nor backend accepts or stores a private key. Server-side preparation has no signer, requires a complete fresh scan, persists every ready plan, and refuses to finalize without passing batch simulations. Submitted hashes remain pending until the worker verifies their transaction envelope, canonical receipt, deployed `Redeemed` logs, post-burn balances, and settlement backing. Reverts fail; absent hashes become superseded only when the owner's mined nonce proves replacement. Owed fallback balances create a separate `wallet.payout_owed` event. Webhook delivery and automated claiming do not exist yet; gas-sponsored claiming remains a later, explicit opt-in mode.
