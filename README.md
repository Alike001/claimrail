# ClaimRail

ClaimRail is a neutral settlement and notification layer for DreamDEX Event Contracts. It reconciles indexed data with canonical Somnia contract state, explains market outcomes, identifies claimable payouts, prepares safe user-signed redemptions, and publishes the same lifecycle information to people, APIs, bots, games, and agents.

## Current status

Phases 1–5 and 8 are complete. The Phase 6 manual-claim path and Phase 7 receipt/history path are implementation-complete; their shared final live proof—a controlled owner-signed Shannon claim moving through durable reconciliation—remains pending. Phase 9 now includes generated OpenAPI/JSON Schema, a runtime-validated TypeScript client, a framework-neutral signed-webhook receiver, a DreamDEX Bot Kit settlement adapter, and an interactive canonical-event playground. Its remaining live proof is an actual external HTTP delivery. The live approval gate and exact `redeemMany` simulation have already passed without a signer on the server.

Any public address can be exhaustively scanned, verified against Somnia and `BinarySettlement`, and converted into normalized positions and safe claim assessments. The responsive inbox, settlement evidence, manual claim planner, claim receipt, honest history, REST API, delivery console, browser/Telegram notifications, and developer documentation expose that state to people and software.

The implementation sequence lives in [the implementation plan](.thoughts/plans/2026-09-03-claimrail-implementation.md). The product contract lives in [the specification](.thoughts/specs/2026-09-03-claimrail.md).

## Workspace

- `apps/web`: Next.js App Router shell for the future dashboard, REST API, and documentation pages.
- `apps/worker`: long-running ingestion, reconciliation, outbox, and delivery runtime.
- `packages/core`: dependency-free domain rules and claim mathematics.
- `packages/dreamdex`: versioned DreamDEX SDK and on-chain adapter.
- `packages/db`: PostgreSQL and Drizzle persistence.
- `packages/contracts`: validated public API and event schemas.
- `packages/client`: runtime-validated, fetch-based public TypeScript client and webhook verifier.
- `packages/ui`: shared accessible interface components.
- `examples/webhook-consumer`: framework-neutral signed webhook receiver.
- `examples/bot-kit-adapter`: DreamDEX strategy pause/claim/confirm handoff.
- `fixtures/dreamdex`: immutable, checksummed Shannon testnet evidence for tests only.
- `probes/event-contracts`: independent read-only reverse-engineering tools and evidence.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm api:check
pnpm probe:typecheck
pnpm --filter @claimrail/dreamdex smoke:shannon
pnpm test:postgres
pnpm test:e2e
```

`pnpm verify` runs formatting, linting, strict TypeScript checks, the dependency-boundary check, fixture integrity verification, Core and DreamDEX coverage gates, unit/integration runners, ephemeral PostgreSQL tests, and the production build. `pnpm test:e2e` runs the desktop/mobile browser gate. The separately named smoke command makes public Shannon indexer/RPC calls with no signer.

## Safety boundary

Fixture data is visibly labelled, disabled in production, and never presented as live funds. The browser can request owner-signed DreamDEX approval and exact `redeemMany` transactions, but neither frontend nor backend accepts or stores a private key. Server-side preparation has no signer, requires a complete fresh scan, persists every ready plan, and refuses to finalize without passing batch simulations. Submitted hashes remain pending until the worker verifies their transaction envelope, canonical receipt, deployed `Redeemed` logs, post-burn balances, and settlement backing. Reverts fail; absent hashes become superseded only when the owner's mined nonce proves replacement. Owed fallback balances create a separate `wallet.payout_owed` event. Signed webhook, browser-push, and Telegram delivery exist; live external credentials are still required for end-to-end deployment proof. Gas-sponsored claiming remains a later, explicit opt-in mode.
