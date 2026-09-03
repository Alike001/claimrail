# Project Quality Profile: ClaimRail

## Detected Stack

### Current workspace

- The workspace root is not currently a Git repository and has no root package manifest, workspace file, CI workflow, application code, or deployment configuration.
- Existing implementation is intentionally limited to `probes/event-contracts`, an npm-managed strict TypeScript project.
- The probe uses Node ESM, TypeScript `5.9`, viem `2.x`, and exact `@somnia-chain/markets-sdk@0.29.0`.
- Available local tooling includes Node `24.14.1`, npm `11.13.0`, pnpm `10.33.1`, Git `2.53.0`, and Docker `29.1.3`. A local `psql` client is not installed.
- Product research, evidence, specification, and frontend blueprint exist; no high-fidelity UI prototype exists, so there is no prototype-reintegration gate.

### Proposed implementation stack

- pnpm workspace with one lockfile and shared TypeScript configuration.
- `apps/web`: Next.js `16.2.x` App Router, React, Tailwind CSS, and accessible headless components/shadcn where useful.
- `apps/worker`: long-running Node 24 TypeScript process for position ingestion, settlement reconciliation, notifications, webhook retries, and claim receipt reconciliation.
- `packages/core`: framework-free financial domain types and pure reconciliation/claim-planning functions.
- `packages/dreamdex`: pinned SDK/viem adapter, deployed ABI overrides, GraphQL pagination, and evidence materialization.
- `packages/db`: PostgreSQL schema and migrations through Drizzle ORM.
- `packages/contracts`: runtime-validated API/event schemas shared by web, worker, and external examples.
- `packages/ui`: reusable presentational components that consume normalized view models only.
- PostgreSQL as the durable state, idempotency, outbox, job-lease, subscription, delivery, and audit store. No Redis requirement for the first product.
- Wagmi React plus viem for connection, chain switching, typed-data signing, contract writes, and receipt tracking. The pinned DreamDEX SDK remains the protocol adapter and may receive the browser `WalletClient` through `SomniaMarkets.setSigner`.

The stack is optimized for a solo builder: one language, one database, no new smart contract, no separate cache/queue dependency, and one shared model across the frontend and workers.

## Existing Commands

Only the probe currently exposes commands:

```text
cd probes/event-contracts
npm run typecheck
npm run probe
npm run probe:pagination
npm run simulate:redemption
```

The new workspace must preserve these probes as research tools without silently folding their hard-coded public fixtures into production code.

## Required Local Checks

The root workspace should eventually expose:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

Required behavior:

- `format:check`: deterministic formatting across authored TypeScript, TSX, JSON, YAML, and Markdown.
- `lint`: framework and accessibility rules, no floating promises, no unsafe financial number conversions, and no server secrets imported into client modules.
- `typecheck`: strict mode, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` across all packages.
- `test`: pure domain, claim-plan, normalization, API schema, and UI component tests.
- `test:integration`: DreamDEX fixture adapters, PostgreSQL migrations/repositories, job leasing, idempotency, receipt decoding, and webhook signing.
- `build`: production Next.js build plus worker/package compilation.
- `test:e2e`: critical public lookup, settlement evidence, claim review, wrong-wallet/wrong-chain, and receipt flows.

Fast pre-push minimum:

```text
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

No test command may require a funded private key by default. Live write tests must be separately named and opt-in.

## Required CI Gates

### Every pull request

1. Clean dependency install from the pnpm lockfile.
2. Formatting check.
3. Lint and dependency-boundary rules.
4. Strict typecheck.
5. Unit tests with coverage.
6. PostgreSQL-backed integration tests in an ephemeral service container.
7. Production builds for web and worker.
8. Migration drift check from an empty database and from the prior schema snapshot.
9. Dependency vulnerability scan, license inventory, and secret scan.

### Main branch or release candidate

1. Browser end-to-end tests against deterministic fixtures.
2. Read-only Shannon smoke tests for indexer, RPC, deployed addresses, ABI selectors, and one known market.
3. API/OpenAPI and webhook-schema compatibility check.
4. Container build and health-check verification for the worker.
5. Verification audit against the ClaimRail acceptance criteria.

### Opt-in live-write job

- Requires an explicitly configured dedicated Shannon test wallet.
- Runs approval, manual redemption, valid `redeemFor`, replay rejection, and receipt reconciliation scenarios.
- Never runs on ordinary pull requests, forks, or untrusted contributions.
- Publishes transaction hashes and post-state evidence without logging secrets.

## Suggested Hooks

The root is not yet a Git repository, so hooks should not be installed during planning.

Once Git is initialized:

- Pre-commit: format/lint only staged authored files and reject obvious secrets.
- Pre-push: root typecheck plus affected unit tests.
- Do not run builds, database integration suites, live RPC probes, or browser E2E in pre-commit; CI owns those slower gates.
- Bypass remains possible for emergencies, but CI is authoritative.

## File Size Policy

- Target: 200 source lines.
- Warning: above 200 source lines.
- Hard cap: above 300 authored source lines unless the file has a written exception.
- Exclusions: generated GraphQL/OpenAPI code, migrations, ABI snapshots, lockfiles, build output, vendored code, and immutable test fixtures.
- Large protocol adapters should be split by responsibility: discovery, market reads, settlement reads, claims, events, and evidence.
- React route files should compose feature components instead of holding business logic.

## Coverage And Financial Safety Policy

- `packages/core`: target at least 95% statement and 90% branch coverage.
- `packages/dreamdex`: target at least 85% statement and 80% branch coverage, with every known live defect represented by a regression fixture.
- Web/API/worker combined: target at least 80% statement coverage; critical claim and webhook state machines require explicit branch tests regardless of aggregate percentage.
- BigInt-to-string serialization, payout rounding, duplicate coalescing, batch exclusion, stale-plan rejection, and idempotency keys are mandatory test areas.
- Snapshot tests alone cannot approve financial behavior; assertions must inspect normalized values and state transitions.

## Commit Policy

- Adopt Conventional Commits after root Git initialization: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, and `ci`.
- Keep protocol-evidence changes separate from product-behavior changes when practical.
- Any change to payout calculation, claim calldata, approval copy, nonce policy, receipt reconciliation, or webhook signature format requires tests and a short rationale in the commit body or pull request.
- Generated outputs should be committed only when they are required inputs to builds, migrations, or public schemas.

## AGENTS.md Notes

A future root `AGENTS.md` should encode:

- Context7 is required for current framework/SDK/API documentation.
- Financial logic belongs in `packages/core`, never in React components or route handlers.
- Indexer data is discovery-only until reconciled with chain state.
- No private key or relayer secret may be added to browser-visible environment variables, fixtures, logs, or ordinary tests.
- Use exact DreamDEX SDK versions and versioned deployed ABI overrides.
- Use `apply_patch` for authored file edits and preserve the research evidence/probes.
- Run the smallest relevant verification during development and the root gate before handoff.

## Open Questions

- Which PostgreSQL host and application/worker deployment target will be used?
- Will the root be initialized as a new Git repository or moved into an existing remote repository?
- Should public read endpoints require API keys at launch or begin with IP/address-scan rate limits only?
- Which wallet connectors are required for the judged demo?
- What exact coverage service, vulnerability scanner, and secret scanner are available in the eventual repository host?
- Does the judged environment permit long-running workers, or must scheduled ingestion be adapted to platform cron invocations?
