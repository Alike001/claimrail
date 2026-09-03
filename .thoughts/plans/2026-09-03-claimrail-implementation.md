# Plan: ClaimRail Implementation

## Inputs

### Accepted research

- [`context/claimrail-reverse-engineering.md`](../../context/claimrail-reverse-engineering.md): protocol, SDK, Bot Kit, competitor, and ecosystem findings.
- [`context/claimrail-phase0-evidence.md`](../../context/claimrail-phase0-evidence.md): live Shannon state, ABI drift, void, redemption, approval, batch, and pagination evidence.
- [`context/claimrail-dreamdex-protocol-reference.md`](../../context/claimrail-dreamdex-protocol-reference.md): exact market, position, lifecycle, resolution, redemption, and event fields.
- [`context/claimrail-frontend-blueprint.md`](../../context/claimrail-frontend-blueprint.md): required frontend routes, states, and signing UX.
- [`context/claimrail-product-plan.md`](../../context/claimrail-product-plan.md): product boundaries, APIs, events, safety model, and judging fit.
- [`context/dreamdex-bot-kit.md`](../../context/dreamdex-bot-kit.md): reusable Bot Kit behavior and limitations.
- [`probes/event-contracts`](../../probes/event-contracts/README.md): reproducible read-only protocol probes.

### Accepted specification and quality gates

- [`ClaimRail specification`](../specs/2026-09-03-claimrail.md): requirements R1–R17 and acceptance criteria AC1–AC20.
- [`Project quality profile`](../quality/2026-09-03-project-quality-profile.md): stack, checks, CI gates, file policy, coverage, and security rules.

### Current repository state

- pnpm application workspace, not a root Git repository.
- Phases 1–3 complete: fixture foundation, canonical Core, and live read-only DreamDEX adapter.
- Approved V3 high-fidelity frontend direction; the application UI remains a shell until Phase 5.
- One preserved npm TypeScript probe project plus the production adapter, both pinned to SDK `0.29.0`.
- Node 24, pnpm 10, Git, and Docker are available locally.

### Current framework documentation decisions

- Use Next.js `16.2.x` App Router. Server Components fetch server data directly; Client Components own wallet and other browser interactions. Route Handlers expose browser/API endpoints and run on the Node runtime where database and SDK compatibility requires it.
- Use Drizzle with PostgreSQL schemas, generated migrations, and explicit transactions. Migration execution remains a separate deployment step rather than an incidental web request.
- Use Wagmi React and viem for connectors, chain switching, WalletClient access, typed-data signatures, writes, and receipt observation.
- Keep `@somnia-chain/markets-sdk` exactly pinned behind `packages/dreamdex`; do not allow its types or known defects to spread through product code.

## Assumptions

1. The first judged deployment targets Somnia Shannon testnet, chain ID `50312`, until judge configuration is confirmed.
2. The first useful release deploys no ClaimRail smart contract.
3. PostgreSQL is available to both the Next.js server and a long-running worker.
4. The web host supports Node Route Handlers; blockchain subscriptions and retries run in the worker, not a short-lived request process.
5. Browser and Telegram notifications are included; email is deferred.
6. Manual user-signed claims are part of the judged path. Gas-sponsored `redeemFor` is a later phase unless controlled testing finishes early.
7. Public fixture addresses and captured JSON may be used for deterministic development/tests, but shipped testnet views must query real sources and clearly report freshness/completeness.
8. No production behavior may report a fake claim confirmation, fake oracle answer, fake notification delivery, or synthetic payout as live truth.
9. A high-fidelity prototype does not exist. The frontend is implemented from the accepted surface blueprint and later refined through browser review.
10. Root Git initialization and remote creation are operational choices outside this plan unless explicitly requested.

## Open Questions

- Which hosted PostgreSQL and deployment providers will be used?
- Which wallet connectors must appear in the judged demo?
- Will judges use the current Shannon contracts and SDK version?
- What distinct-market batch size works reliably across target wallets and providers?
- Can `PayoutOwed` be safely induced for a real fallback fixture?
- Is a machine-readable oracle evidence API supported beyond indexed fields?
- What public-source fallback is acceptable if direct `OutcomeBalance` pagination changes?
- Should unauthenticated public API access use only rate limits or issue developer API keys immediately?
- Does the final platform support a continuously running worker or only scheduled jobs?

These do not block Phases 1–5. Deployment-provider and worker-runtime decisions must be resolved before Phase 7 production deployment. Valid `redeemFor` execution blocks Phase 9 only.

## Prototype Reintegration Gate

No UI prototype exists, so broad implementation is not blocked by reintegration work.

Mock policy for the entire project:

- Captured testnet JSON is allowed in unit, integration, component, Storybook-style, and browser tests.
- Fixture-backed UI must display a development/test-data label outside automated tests.
- The judged read path must query live ClaimRail endpoints backed by DreamDEX/Somnia.
- A deterministic captured-event replay may be used to make a short demo reliable, but must be labeled “replaying verified testnet evidence.”
- Claim signing, submitted transactions, receipts, and notification delivery shown as live must be real. Unimplemented paths are disabled and labeled, not simulated as successful.

## Target Architecture

```text
Somnia RPC + DreamDEX indexer + oracle evidence
                       │
               packages/dreamdex
                       │
                 packages/core
                  /           \
          apps/worker       apps/web
               │             /     \
          PostgreSQL    Route API   UI/wallet
               │             │
        event outbox ─────────┘
          /       |       \
      webhook  Telegram  browser/API consumers
```

Workspace layout:

```text
apps/
  web/                 Next.js pages, Route Handlers, wallet UI, docs
  worker/              ingestion, reconciliation, outbox, deliveries
packages/
  core/                pure domain models and financial state machines
  dreamdex/            SDK, GraphQL, viem, ABI, and evidence adapter
  db/                  Drizzle schema, migrations, repositories, leases
  contracts/           API/event runtime schemas and generated OpenAPI
  ui/                  reusable accessible presentation components
fixtures/
  dreamdex/            sanitized canonical Phase 0 fixtures and manifests
probes/
  event-contracts/     preserved research-only live probes
```

Dependency direction:

```text
ui -> contracts -> core
web -> ui + contracts + core + db
worker -> dreamdex + core + db + contracts
dreamdex -> core
db -> core + contracts
core -> no framework, database, SDK, or React dependency
```

## Phase 1: Workspace Foundation And Fixture Contract

### Goal

Create a strict, reproducible pnpm workspace without implementing product behavior.

### Work

- Add root `package.json`, `pnpm-workspace.yaml`, pinned package manager, Node engine, shared scripts, TypeScript base configurations, formatter/linter configuration, ignore files, and environment example.
- Scaffold empty `apps/web`, `apps/worker`, and the five packages with package boundaries and project references.
- Keep the existing npm probe functional; do not rewrite its lockfile during this phase.
- Copy only the canonical, sanitized evidence needed for tests into `fixtures/dreamdex`, with a manifest recording source run, chain, block, adapter version, and whether the fixture is live-captured or synthetic.
- Add an architecture decision record for one database/no Redis, no new smart contract, and exact SDK pinning.
- Add root commands from the quality profile.

Likely areas:

- `/package.json`
- `/pnpm-workspace.yaml`
- `/tsconfig.base.json`
- `/apps/*`
- `/packages/*`
- `/fixtures/dreamdex/*`
- `/docs/decisions/*`

### Real Integration Path

No external runtime integration yet. The fixture manifest links each real capture to the probe that produced it.

### Mock/Simulation Policy

Only test fixtures are introduced. No application screen or API may claim they are live.

### Checks

- Clean `pnpm install` from one root lockfile.
- Root format, lint, typecheck, test, and build commands run, even if initial packages contain only boundary tests.
- Existing probe `npm run typecheck` still passes independently.
- Dependency-boundary test proves `packages/core` imports no framework/SDK/database module.

### Acceptance Criteria Covered

- Foundation for AC18 and AC19.

### Stop Condition

All workspace packages compile through documented root commands, fixture provenance is explicit, and the existing probe remains intact.

## Phase 2: Canonical Domain And Claim Mathematics

Status: complete on 2026-09-03.

### Goal

Implement the framework-free truth model used by every consumer.

### Work

- Define branded chain, address, market ID, token ID, block, transaction, and base-unit types.
- Define `MarketRecord`, `SettlementEvidence`, `WalletPosition`, `PositionScan`, `ClaimCandidate`, `ClaimExclusion`, `ClaimPlan`, `ClaimReceipt`, and canonical event envelopes.
- Implement contract/indexer lifecycle normalization while preserving `contractStatus` and `settlementFinalized` separately.
- Implement payout-vector validation and integer payout calculation.
- Implement wallet-position state derivation: live, locked, winning-unfinalized, claimable, losing, void-refundable, submitted, redeemed, and payout-owed.
- Implement duplicate coalescing, cumulative-balance validation, losing/zero/stale exclusion, deterministic ordering, plan expiry, and integrity hashing.
- Implement plain-language explanation inputs as structured data; presentation copy remains outside financial calculations.
- Define completeness/freshness/conflict states for position scans and evidence.

Likely areas:

- `packages/core/src/identity/*`
- `packages/core/src/markets/*`
- `packages/core/src/positions/*`
- `packages/core/src/settlement/*`
- `packages/core/src/claims/*`
- `packages/core/src/events/*`

### Real Integration Path

Pure functions consume normalized inputs designed from the verified deployment. The DreamDEX adapter in Phase 3 supplies them.

### Mock/Simulation Policy

Use canonical captured winner, loser, void, stale-indexer, recycled-pool, redemption, and pagination fixtures. Synthetic fixtures are allowed only for labeled unobserved branches such as snapshot-policy void and payout fallback.

### Checks

- Table-driven tests for all six contract states plus derived `Finalized`.
- Winner `[D,0]`, loser, void `[D/2,D/2]`, malformed vector, rounding, and mixed-decimal tests.
- Property tests: no plan entry has zero payout; cumulative burn never exceeds balance; ordering/hash is deterministic; total expected payout equals entry totals.
- Regression test for mixed winner/loser success risk.
- Regression test for duplicate cumulative over-balance.
- Coverage meets core 95% statement/90% branch target.

### Acceptance Criteria Covered

- AC3–AC8, AC11, and the calculation portion of AC14.

### Stop Condition

All financial and lifecycle decisions are deterministic from inputs, pass the fixture matrix, and require no SDK, network, database, or React runtime.

## Phase 3: DreamDEX Read Adapter And Exhaustive Discovery

Status: complete on 2026-09-03.

### Goal

Turn live DreamDEX/indexer/Somnia data into canonical Phase 2 records with explicit evidence quality.

### Work

- Build deployment configuration keyed by chain and adapter version.
- Pin SDK `0.29.0` inside `packages/dreamdex`.
- Implement paginated `OutcomeBalance` discovery with stable ordering, deduplication, max-page policy, abort/timeout handling, and `complete|partial|failed` result.
- Wrap SDK market lists, resolution/status history, fees, router actions, and fills.
- Combine module `markets`, `marketNonce`, `getMarketOnchain`, direct market payout-vector reads, settlement `getSettlement`, ERC-6909 balances/approval, and oracle reads.
- Override the incompatible deployed settlement `MarketFinalized` event locally and assert its topic in a regression test.
- Reconcile indexed market context against current chain wiring and surface mismatches.
- Add batched/concurrency-limited reads and per-source freshness metadata.
- Build `listWalletPositions`, `explainSettlement`, and verified `listClaimCandidates` application services.

Likely areas:

- `packages/dreamdex/src/config/*`
- `packages/dreamdex/src/indexer/*`
- `packages/dreamdex/src/chain/*`
- `packages/dreamdex/src/events/*`
- `packages/dreamdex/src/reconcile/*`
- `packages/dreamdex/src/services/*`

### Real Integration Path

Integration tests replay captured responses. A separately named read-only smoke suite calls Shannon RPC/indexer with no key and validates configured addresses, chain ID, selector topics, pagination, and one known market.

### Mock/Simulation Policy

Network clients are injected. Fixtures emulate transport responses only in tests; production services always use configured live clients. A partial fixture cannot be reported as complete.

### Checks

- The 1,044-row fixture returns eleven pages, 1,044 unique rows, and `complete`.
- A page timeout returns partial data plus the failed cursor/offset and never claims an exhaustive total.
- Recycled pool fixture stays attached to the correct market ID and nonce.
- Indexed/on-chain disagreement selects chain state for action gates while preserving the conflict.
- Deployed event topic regression catches the SDK ABI mismatch.
- Read-only Shannon smoke command passes without any signer configuration.

### Acceptance Criteria Covered

- AC1–AC5, AC9 discovery errors, and AC14.

### Stop Condition

A public address can be read through one service call into normalized, evidence-bearing records, including an honest completeness result, without wallet connection.

## Phase 4: PostgreSQL Persistence, Idempotency, And Worker Skeleton

### Goal

Make observations, jobs, canonical events, and later claims durable across restarts and duplicate inputs.

### Work

- Define Drizzle schemas and generated migrations for deployments, markets, market observations, settlement evidence, watched wallets, scan runs, positions, position observations, claims, claim entries, canonical events, outbox jobs, subscriptions, deliveries, notification bindings, and audit records.
- Store raw base-unit values as PostgreSQL numeric/text representations that round-trip to BigInt without floating point.
- Add unique constraints for stable market/position/event/claim identities.
- Implement repository interfaces and transaction boundaries.
- Implement job leasing with `FOR UPDATE SKIP LOCKED`, lease expiry, attempts, bounded backoff, and dead-letter state.
- Add transactional outbox creation whenever a canonical state transition is persisted.
- Scaffold worker processes for market lifecycle, wallet scans, claim receipt reconciliation, and delivery dispatch.
- Add health/readiness output without leaking endpoints or secrets.

Likely areas:

- `packages/db/src/schema/*`
- `packages/db/src/repositories/*`
- `packages/db/src/jobs/*`
- `packages/db/drizzle/*`
- `apps/worker/src/*`

### Real Integration Path

Integration tests run against ephemeral PostgreSQL. The worker can perform an opt-in read-only Shannon sync and persist observations.

### Mock/Simulation Policy

No in-memory repository is accepted for the judged durable path. In-memory fakes may support isolated unit tests only and must implement the same repository contracts.

### Checks

- Empty-database migration and upgrade migration succeed.
- Replaying the same source log twice yields one canonical event.
- Two workers cannot lease the same active job.
- Expired leases become recoverable.
- State transition plus outbox record commit atomically.
- BigInt values round-trip exactly.
- Restart tests preserve scan, event, delivery, and audit state.

### Acceptance Criteria Covered

- AC13 foundation, AC15–AC16 foundation, and operational portions of AC19.

### Stop Condition

The worker can ingest one verified market/wallet transition twice, restart, and still persist exactly one canonical event and one pending delivery job.

## Phase 5: Read-Only API And Settlement Inbox Frontend

### Goal

Deliver the first complete human product: public address lookup, lifecycle inbox, and settlement evidence.

### Work

- Define runtime API schemas and OpenAPI descriptions for wallet positions/claimables/history and market settlement.
- Implement Next.js Node Route Handlers that call application services directly rather than making Server Components fetch through localhost HTTP.
- Build `/`, `/wallet/[address]`, and `/markets/[marketId]` using Server Components for initial reads and small Client Components for search, refresh, tabs, drawers, and live status.
- Implement summary totals with completeness wording.
- Implement inbox groups and every loading, empty, partial, conflict, and error state.
- Implement the evidence ladder: rule, opening/fixed threshold, closing answer, result, payout vector, resolution, finalization, and oracle link.
- Add responsive/mobile layouts, keyboard support, focus management, text-plus-icon status, copy controls, and accessible live announcements.
- Expose fixture mode only in development/tests with a visible label.

Likely areas:

- `packages/contracts/src/http/*`
- `packages/ui/src/inbox/*`
- `packages/ui/src/evidence/*`
- `apps/web/app/page.tsx`
- `apps/web/app/wallet/[address]/*`
- `apps/web/app/markets/[marketId]/*`
- `apps/web/app/api/v1/*`

### Real Integration Path

The judged UI calls live server-side ClaimRail services. Public lookup needs no connected wallet. Refresh or worker updates reconcile against current chain state.

### Mock/Simulation Policy

Component/E2E tests use fixtures. Fixture mode is excluded from production configuration and visually labeled in development.

### Checks

- Public wallet works without connection.
- Invalid, empty, 1-position, many-position, partial-scan, and 1,044-position states render correctly.
- Live, waiting, won-unfinalized, claimable, losing, void, redeemed, and payout-owed cards use plain language.
- Evidence never fills unavailable oracle data with a guess.
- Mobile and keyboard E2E cover lookup, tabs, drawer, and evidence navigation.
- Accessibility scan has no critical violations.
- Production Next.js build passes.

### Acceptance Criteria Covered

- AC1–AC6, AC14, and the read-only part of AC18–AC20.

### Stop Condition

A new user can enter a live public address, understand each position and scan completeness, and audit one settlement without knowing ERC-6909 or connecting a wallet.

## Phase 6: Manual Claim Planning And Wallet Flow

### Goal

Turn verified claimable records into transparent, simulated, owner-signed manual redemptions.

### Work

- Implement `POST /v1/claims/prepare` with owner/address validation, complete candidate refresh, direct chain verification, duplicate coalescing, exclusions, gas policy, simulation, expiry, and integrity hash.
- Persist the plan and evidence snapshot without any signature or private key.
- Build the claim review route/modal with exact entries, exclusions, expected payout, recipient, chain, verified block, expiry, simulation, and completeness.
- Configure Wagmi for Shannon and selected connectors.
- Bind the browser viem `WalletClient` to the exported `SomniaMarkets` signer surface or use exact prepared ABI calls where plan integrity requires it.
- Implement wrong-wallet and wrong-chain gates.
- Read `isOperator`; if false, show the module-wide permission explanation and execute/confirm `setOperator` before rebuilding/simulating the claim plan.
- Submit `redeemMany` only from a fresh matching plan.
- Notify the server of the transaction hash immediately for durable receipt tracking.

Likely areas:

- `packages/core/src/claims/*`
- `packages/dreamdex/src/claims/*`
- `packages/contracts/src/http/claims.ts`
- `apps/web/app/api/v1/claims/*`
- `apps/web/src/wallet/*`
- `packages/ui/src/claims/*`

### Real Integration Path

Plan reads and simulations use live Shannon. The first broadcast is performed only with a dedicated funded test wallet. The judged claim path is real and owner-signed.

### Mock/Simulation Policy

Automated E2E may stub the connector and receipt transport, but the UI must label local fixture mode. No production/demo button may fabricate a submitted or confirmed transaction.

### Checks

- Losing and zero-paying entries never reach calldata.
- Mixed winner/loser candidates submit only the winner.
- Duplicates coalesce and over-balance fails before wallet opening.
- All prepared batches simulate successfully.
- Expired/stale plan refreshes instead of submitting.
- Wrong wallet and wrong chain block submission.
- First-time approval copy names the shared module-wide scope and requires its confirmed receipt before claim.
- Controlled testnet manual claim yields a real hash.

### Acceptance Criteria Covered

- AC6–AC11 and the manual transaction portion of AC20.

### Stop Condition

A dedicated wallet can review, approve if necessary, submit a clean batch, and hand a real transaction hash to durable reconciliation without ClaimRail handling its key.

## Phase 7: Receipt Reconciliation, History, And Fallbacks

### Goal

Prove what happened after submission and preserve a trustworthy financial history.

### Work

- Implement a claim reconciliation worker that observes receipt state, replacement/revert, deployed `Redeemed` events, post-balance, and settlement backing.
- Represent pending, confirmed, failed, and superseded claims.
- Reconcile expected versus actual collateral per entry.
- Detect `PayoutOwed`/`OwedClaimed` and current fallback balance when the relevant live read exists.
- Build `/claims/[claimId]` with transaction, block, gas, owner, recipient, entries, before/after state, settlement evidence, and triggered events.
- Build wallet history with prediction outcome, amount returned, and cost/PnL completeness.
- Provide downloadable receipt JSON conforming to a versioned schema.

Likely areas:

- `packages/dreamdex/src/receipts/*`
- `packages/core/src/receipts/*`
- `apps/worker/src/jobs/reconcile-claim.ts`
- `packages/contracts/src/receipts/*`
- `apps/web/app/claims/[claimId]/*`
- `apps/web/app/wallet/[address]/history/*`

### Real Integration Path

Use real testnet receipts for at least winner/manual claim. Historical public receipts cover zero-payout behavior. Fallback stays visibly unsupported until a verified read/event path is captured.

### Mock/Simulation Policy

Pending/reverted/replaced/connection-loss states use transport fixtures in automated tests. Synthetic fallback is test-only and cannot appear as observed protocol evidence.

### Checks

- Submitted hash remains pending before confirmed receipt.
- Reverted receipt never becomes paid.
- Confirmed receipt requires expected deployed events and post-state agreement.
- Lost response finds existing receipt/state before considering any resubmission.
- Already redeemed balance disappears after reconciliation.
- PnL displays incomplete when cost history is truncated.
- Receipt JSON validates against its public schema.

### Acceptance Criteria Covered

- AC12–AC14 and history portions of AC20.

### Stop Condition

Every submitted claim reaches a durable terminal or visibly pending state supported by receipt and post-state evidence, and users can open a machine-readable receipt.

## Phase 8: Canonical Events, Webhooks, Browser, And Telegram

### Goal

Make one verified settlement transition reliably reach human and machine consumers.

### Work

- Finalize versioned canonical event schemas and deterministic event IDs.
- Emit events transactionally through the outbox when market, wallet, claim, or fallback state changes.
- Implement subscription ownership proof and verification challenges.
- Implement HMAC-signed webhook envelopes, timestamp/replay checks, delivery attempts, bounded exponential backoff, dead-letter state, and manual replay.
- Implement browser notification permission/subscription and Telegram one-time linking.
- Implement delivery preferences and `/notifications` UI.
- Build the developer delivery console with payload, signature metadata, attempts, error, next retry, and replay.
- Add a test endpoint/action that emits a clearly labeled non-financial test notification.

Likely areas:

- `packages/contracts/src/events/*`
- `packages/db/src/repositories/events.ts`
- `apps/worker/src/jobs/deliver-*`
- `apps/web/app/api/v1/subscriptions/*`
- `apps/web/app/notifications/*`
- `apps/web/app/developers/deliveries/*`

### Real Integration Path

At least one live `wallet.claimable` or verified event replay reaches the UI, a real webhook receiver, and Telegram/browser. Financial event payloads come only from canonical persisted state.

### Mock/Simulation Policy

Provider clients are faked in unit tests. The demo may replay a verified captured transition with an explicit replay label; delivery results shown as successful must come from actual provider/webhook responses.

### Checks

- Duplicate source events create one event and one delivery per subscription.
- HMAC verification accepts intact timely requests and rejects tampered/stale requests.
- Failed deliveries retry, dead-letter, and replay without duplicating successful deliveries.
- Telegram linking cannot bind a private destination without ownership proof.
- Notification UI shows last attempt and failure state.
- One canonical event is consumed by at least two independent surfaces.

### Acceptance Criteria Covered

- AC15–AC16 and notification portions of AC20.

### Stop Condition

One verified settlement event updates the inbox and is observably delivered to both a human channel and an external webhook consumer with idempotent retry history.

## Phase 9: Developer Documentation And Bot Kit Adapter

### Goal

Prove ClaimRail is reusable infrastructure rather than a private backend for its own UI.

### Work

- Build `/docs` pages for concepts, lifecycle, identity, source-of-truth rules, approval scope, manual/auto claim boundaries, REST endpoints, schemas, webhook verification, TypeScript helpers, protocol evidence, and SDK feedback.
- Generate OpenAPI and JSON Schema from `packages/contracts` and fail CI on drift.
- Publish a small TypeScript client with `listClaimables`, `explainSettlement`, `buildRedemptionPlan`, and `subscribeToWallet`.
- Add a webhook verification example with no framework dependency.
- Add a DreamDEX Bot Kit adapter/example that pauses after lock, consumes a finalized/claimable event, invokes owner-approved claim handling, and resumes only on `claim.confirmed`.
- Build a live event playground that uses canonical stored fixture/live events.

Likely areas:

- `apps/web/app/docs/*`
- `apps/web/app/developers/*`
- `packages/contracts/openapi/*`
- `packages/client/*` if a separate public client package is justified
- `examples/webhook-consumer/*`
- `examples/bot-kit-adapter/*`

### Real Integration Path

Examples call a running ClaimRail service and consume real signed webhook events. Documentation examples are compiled/tested in CI.

### Mock/Simulation Policy

Docs may show static captured responses when labeled. The integration proof must receive an actual HTTP delivery from ClaimRail.

### Checks

- Every copyable TypeScript example typechecks.
- OpenAPI examples validate against runtime responses.
- Webhook example verifies a real signature.
- Bot adapter receives `wallet.claimable`, waits, and responds to `claim.confirmed` without importing private modules.
- `/docs` is navigable and responsive.

### Acceptance Criteria Covered

- AC15, AC18, and developer portions of AC20.

### Stop Condition

An independent example application receives and verifies a ClaimRail event using only public docs/contracts, and the Bot Kit example demonstrates the settlement handoff.

## Phase 10: Optional Gas-Sponsored `redeemFor`

### Goal

Add honest opt-in automatic redemption without custody or recipient redirection.

### Work

- Implement EIP-712 authorization construction with exact domain and field order.
- Add durable authorization and per-owner nonce tables with unique `(chain,module,owner,nonce)` constraints.
- Add deadline, amount, market/outcome, chain, module, signature-recovery, position-balance, finalization, and prior-reconciliation checks.
- Isolate the relayer deployment, key, gas policy, rate limits, balance monitoring, and audit log.
- Implement `redeemFor` submission and the same receipt/post-state reconciliation as manual claims.
- Build opt-in authorization UX explaining the narrow signed message and broader pre-existing ERC-6909 operator grant.
- Add authorization revoke/expiry visibility even if the on-chain nonce cannot be queried directly.

Likely areas:

- `packages/core/src/authorizations/*`
- `packages/dreamdex/src/redeem-for/*`
- `packages/db/src/schema/authorizations.ts`
- `apps/worker/src/relayer/*`
- `apps/web/app/wallet/[address]/auto-claim/*`

### Real Integration Path

Requires a dedicated funded owner and separated relayer on Shannon. A valid signed transaction, owner-pinned payout, deadline rejection, invalid-signature rejection, and replay rejection must all be captured.

### Mock/Simulation Policy

No judged auto-claim claim until valid relay and replay behavior is proven live. Until then the UI labels it unavailable/coming later; negative-path `eth_call` evidence alone is not presented as full auto-claim support.

### Checks

- Typed-data hash matches SDK and independent viem encoding.
- Expired and malformed signatures fail with deployed errors.
- Nonce uniqueness survives concurrent workers.
- Relayer cannot alter signed economic fields or payout recipient.
- Valid relay pays the owner and records confirmed evidence.
- Replayed authorization is rejected and post-state prevents duplicate action.
- Ambiguous response reconciles before any retry.

### Acceptance Criteria Covered

- AC17 and the optional automatic-claim portion of R15.

### Stop Condition

A funded Shannon owner opts in, a separate relayer pays gas, the owner receives the verified payout, and replay cannot produce a second financial action.

## Phase 11: Deployment, Verification Audit, And Demo Hardening

### Goal

Prove the implementation matches the specification and can be demonstrated reliably without overstating incomplete features.

### Work

- Resolve hosted PostgreSQL, web, worker, domain, secrets, RPC, indexer, Telegram, and webhook-demo configuration.
- Apply migrations as an explicit release step.
- Add health, readiness, structured logs, metrics, and redacted error reporting.
- Configure rate limits, CORS, CSP, secure cookies where applicable, and secret separation.
- Run load tests for a large wallet scan and delivery burst.
- Run the full quality profile and a requirement-by-requirement verification audit.
- Prepare the 2–3 minute demo path with a real live path plus labeled verified-event replay fallback.
- Produce SDK/documentation feedback with reproduction steps for ABI/export/socket issues.
- Record deferred items plainly.

Likely areas:

- deployment manifests and environment documentation
- CI workflows
- operational runbooks
- verification report
- demo script and submission assets

### Real Integration Path

The deployed web/API/worker/database use live Shannon sources. A real owner-signed manual claim and real external delivery are mandatory demo evidence. Replay is only a timing fallback for market transition.

### Mock/Simulation Policy

No unlabeled fixture mode in production. No screenshot or demo narration may call a simulated confirmation real.

### Checks

- Root format, lint, typecheck, unit, integration, build, E2E, migration, security, and schema-drift gates pass.
- Read-only Shannon smoke passes against the judged configuration.
- Controlled live-write suite passes or any excluded optional feature is disabled.
- Verification audit maps evidence to AC1–AC20.
- Fresh-browser demo rehearsal completes inside three minutes.
- Mobile and desktop critical paths pass accessibility checks.
- Worker restart and duplicate-event recovery are demonstrated.

### Acceptance Criteria Covered

- AC1–AC20.

### Stop Condition

Every claimed feature has passing evidence, incomplete optional features are disabled/labeled, and the deployed demo proves one settlement across the inbox, evidence, claim receipt, notification, webhook/bot consumer, and docs.

## Verification Checkpoint

Before declaring ClaimRail complete, run the dedicated `verification-audit` workflow against:

- specification requirements R1–R17;
- acceptance criteria AC1–AC20;
- quality-profile local and CI gates;
- live Phase 0 and controlled-write evidence;
- frontend required states and accessibility requirements;
- API/OpenAPI and webhook-schema conformance;
- security rules for approval scope, signatures, nonces, relayer separation, secrets, and idempotency;
- demo claims versus actual deployed functionality.

The audit report must classify every item as `verified`, `partially verified`, `deferred`, or `failed`, cite the exact test/file/transaction evidence, and prevent a `deferred` feature from appearing as complete in product copy.

## Handoff Notes

### First executable item

Begin with Phase 1 only: workspace foundation and fixture provenance. Do not implement protocol behavior in the scaffold task.

### First behavior slice after foundation

Implement the smallest vertical domain slice in Phase 2:

```text
captured finalized winner/loser/void inputs
            ↓
canonical MarketRecord + WalletPosition
            ↓
claimability and payout calculation
            ↓
clean ClaimPlan entries + exclusions
```

This unlocks both the DreamDEX adapter and fixture-backed frontend without duplicating financial logic.

### Decisions that require user input later

- hosted database/deployment provider;
- wallet connector set;
- whether public API keys enter the first release;
- whether Phase 10 auto-claim is included in the judged build;
- root Git repository/remote handling.

None should be assumed during Phase 1.
