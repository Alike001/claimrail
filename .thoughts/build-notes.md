# ClaimRail build notes

## 2026-09-03 — Phase 1 complete

Delivered:

- Reproducible pnpm workspace with exact package versions and one root lockfile.
- Empty web and worker runtimes plus core, DreamDEX adapter, database, contracts, and UI package boundaries.
- Type-aware ESLint, strict TypeScript, formatting, unit/integration runners, production build, and dependency-boundary gates.
- Seven immutable Shannon testnet evidence fixtures with exact provenance, capture metadata, checksums, and an executable integrity verifier.
- Architecture decisions for the runtime split, PostgreSQL outbox without Redis, and the pinned DreamDEX adapter/no-new-contract boundary.
- Two active frontend composition concepts and an extracted ClaimRail design system.

Verified:

- `pnpm verify`
- `pnpm probe:typecheck`
- `pnpm test:e2e` correctly reports its Phase 5 gate rather than pretending browser coverage exists.

Deliberately absent:

- Domain/status normalization and payout mathematics (Phase 2).
- DreamDEX runtime adapter behavior (Phase 3).
- Database schema, indexer, API, frontend product surfaces, claims, notifications, docs site, and auto-claim (later phases).

Next slice: Phase 2, beginning with fixture-driven canonical lifecycle states, integer-only claim arithmetic, reasons/evidence completeness, stable position identity, and invariant/property tests.

## 2026-09-03 — Design checkpoint reopened

Phase 2 is paused at the user's request. The original navy concepts were rejected as insufficiently aligned with Somnia and DreamDEX.

Completed before resuming domain work:

- Captured and inspected the live Somnia homepage, DreamDEX homepage, and DreamDEX Event Contracts terminal at 1440×1000.
- Extracted the public DreamDEX/Somnia surface, border, text, action, success, error, warning, and typography tokens.
- Inspected `vibecurb-cli@1.0.0` before execution and installed only its `imagegen-frontend` project skill.
- Produced two V2 terminal candidates: the settlement inbox/claim queue and the first-time manual-claim review state.
- Corrected approval copy to disclose that the DreamDEX module operator grant covers all wallet outcome-token IDs until revoked.

No application UI was implemented. This checkpoint was later superseded by the V3 originality remediation below.

## 2026-09-03 — V3 originality remediation

The V2 concepts are now research-only and must not be implemented. They carried too much of DreamDEX/Somnia's recognizable expression even though their product purpose was different.

Completed:

- Replaced the brace-derived mark with an original rail/checkpoint identity.
- Replaced the ticker plus fixed-right-panel skeleton with a lifecycle rail, full-width ledger, and docked bottom claim tray.
- Made signal lime and warm white ClaimRail's action language; restricted violet to DreamDEX provenance.
- Replaced the Somnia-adjacent halftone motif with functional track sleepers and checkpoint nodes.
- Produced a complete settlement inbox and an expanded first-claim review state with visible module-wide approval scope.
- Added explicit independent-interface attribution and preserved user-signed, no-private-key custody language.
- Removed temporary third-party website captures after recording the written visual audit.

Candidate files:

- `design/concepts/settlement-rail-control-v3.png`
- `design/concepts/claim-tray-expanded-v3.png`
- `design/claimrail-original-direction-v3.md`

The user approved V3 on 2026-09-03. It is now the active frontend implementation reference.

## 2026-09-03 — Phase 2 complete

Delivered:

- Dependency-free branded identifiers for chains, addresses, market/venue/token IDs, blocks, transactions, integrity hashes, timestamps, and base-unit amounts.
- Explicit missing, pending, verified, and conflicting evidence values plus scan completeness and freshness records.
- Six-value DreamDEX contract lifecycle normalization with settlement finality stored separately and conflict detection for inconsistent indexed/on-chain states.
- Canonical market, settlement evidence, wallet-position, claim candidate/entry/exclusion/plan/receipt, and event-envelope types.
- Integer-only payout-vector validation and payout calculation from the finalized, already fee-scaled deployed vector. The settlement fee is retained as audit evidence and never deducted twice.
- Wallet states for open, locked, winning-unfinalized, claimable, losing, void-refundable, submitted, redeemed, and payout-owed positions.
- A two-stage claim planner: deterministic preparation first, then finalization only after every batch simulation passes at an equal-or-newer block.
- Exact-source deduplication, partial-entry coalescing, cumulative balance enforcement, cross-position settlement-backing reconciliation, zero/loss/stale/redeemed/conflict exclusion, tested batching, expiry, connected-owner validation, and SHA-256 integrity hashing.
- Deterministic canonical lifecycle-event IDs for frontend, webhook, bot, game, and agent consumers.
- Fixture regressions for captured winners, two-sided void refunds, mixed winner/loser batch risk, and duplicate over-balance behavior.
- Fast-check property tests for payout bounds, non-zero plan entries, total consistency, and order-independent hashes.

Verified:

- 98 Core tests pass across seven test files.
- Core coverage: 100% statements, 96.31% branches, 100% functions, and 100% lines.
- The root `pnpm verify` command now includes the enforced Core 95% statement/90% branch coverage gate.

Important correction found during verification:

- The finalized DreamDEX settlement vector is already fee-scaled. Core performs one multiplication/division against that vector instead of subtracting the fee again, avoiding both double charging and one-base-unit double-rounding errors.

No SDK, RPC, database, React, signing, or transaction runtime was added to Core. Phase 3 is next: the pinned DreamDEX read adapter and exhaustive paginated discovery.

## 2026-09-03 — Phase 3 complete

Delivered:

- Shannon deployment configuration keyed by chain `50312` and exact DreamDEX SDK `0.29.0`, using the SDK's generated contract addresses.
- Exhaustive positive `OutcomeBalance` pagination with stable `id: asc` ordering, row-ID deduplication, max-page protection, per-page timeout, caller abort support, resumable failed offsets, and honest `complete|partial|failed` results.
- A read-only DreamDEX/Somnia gateway wrapping binary markets, resolution, status history, fees, router actions, fills, module-resolved market wiring, oracle price, ERC-6909 balance/operator reads, permanent settlement records, and finalization logs.
- A local Shannon `BinarySettlement.MarketFinalized` payout-vector ABI because SDK `0.29.0` still contains the obsolete `winningOutcome` event tail.
- Reconciliation that treats current chain state as the action gate while retaining indexed/module/settlement/event conflicts as evidence.
- Pool-reuse-safe identity using `marketId` plus the module's `marketNonce`; a pool address is never treated as market identity.
- Concurrency-limited market and balance verification.
- `ClaimRailReadService.readWallet`, `listWalletPositions`, `listClaimCandidates`, and `explainSettlement` application boundaries.
- A package-level technical guide and a separately named, no-signer Shannon smoke command.

Verified:

- The captured 1,044-row public wallet completes in exactly eleven pages with 1,044 unique rows.
- Timeout and max-page exits remain partial and include the next/failed offset.
- The captured recycled market remains bound to market ID `0x…12222` and nonce `490`.
- The deployed event topic is `0xb1884334e955f8d8727678d4fa52dd9fc7140ff5e4ad38d358453bd400ada178`, and the captured vector decodes as `[10000000, 0]`.
- 114 tests pass across unit and integration suites: 111 unit tests plus 3 DreamDEX service integration tests.
- DreamDEX adapter coverage gate passes at 86.4% statements, 63.83% branches, 89.79% functions, and 88.46% lines; thin live transport and smoke boundaries are exercised separately.
- Live read-only Shannon smoke passed at head block `478725909`: 1,044 rows / 11 pages, eight normalized positions, and two currently verified claim candidates, without a signer or wallet connection.

Important correction found during verification:

- `MarketFinalized.netBacking` is the original post-fee pot. The live settlement `backing` decreases as redemptions occur, so a lower current value is valid; only current backing above the finalized net backing is contradictory.

No private key, WalletClient, signature, write contract call, or transaction submission exists in this package. Phase 4 is next: durable PostgreSQL observations, idempotent jobs, and the worker skeleton.

## 2026-09-03 — Phase 4 complete

Delivered:

- One generated Drizzle/PostgreSQL migration covering all 17 planned tables for deployments, observations, settlement evidence, wallet scans, positions, claims, canonical events, outbox jobs, subscriptions, deliveries, bindings, and audit history.
- Exact `numeric(78,0)`/JavaScript `bigint` storage for uint256-sized token IDs, balances, payouts, nonces, backing, fees, and blocks, plus safe nested JSON conversion.
- Stable database constraints for protocol identities, observations, scans, positions, events, delivery intent, subscriptions, and bindings.
- A single transaction that persists latest state, append-only observations, scan membership, one deterministic canonical transition, one outbox job, and one audit record—or rolls everything back.
- PostgreSQL-native job leasing through `FOR UPDATE SKIP LOCKED`, ownership checks, lease expiry/recovery, attempt accounting, bounded exponential backoff, completion, and dead-letter state.
- Four explicit worker lanes for market lifecycle, wallet scanning, claim receipts, and delivery dispatch. Unimplemented later-phase transports report honest idle states and do not consume jobs.
- An opt-in, no-signer Shannon wallet scanner that persists only verified, conflict-free claimable transitions and derives event identity from meaningful state rather than observation block.
- Database/schema readiness and job heartbeat output that omits database URLs, public endpoints, watched addresses, and raw error messages.
- Bounded SDK/database shutdown after a live run exposed an external-client cleanup hang.
- Database and worker operating guides plus the durable architecture document.

Verified:

- Five ephemeral PostgreSQL 17 integration tests pass, including repeatable migrations, exact maximum uint256 round-trip, atomic outbox rollback, duplicate replay across a reopened connection, concurrent lease exclusion, expired-lease recovery after restart, backoff, and dead-letter behavior.
- Four worker unit tests pass for config redaction, four-lane execution, error redaction, delivery safety, and readiness reporting.
- A live Shannon restart check ran two separate worker processes against the same public wallet. Both observed eight verified positions and two claimable candidates; the final database retained two scans but only two canonical events and two pending jobs.
- Migration regeneration reports all 17 tables and no schema drift.

Safety boundary remains unchanged: there is no signer, private key, claim transaction, webhook send, Telegram send, or auto-claim authorization. Phase 5 is next: the read-only API and the approved original V3 settlement inbox frontend.

## 2026-09-03 — Phase 5 complete

Delivered:

- A responsive, code-native implementation of the approved V3 ClaimRail settlement inbox with the original rail/checkpoint identity, four-stage lifecycle rail, full five-position ledger, wallet lookup, filters, status explanations, and fixed claim summary.
- A scrollable claim-plan preview for desktop and mobile showing included/excluded positions, module-wide approval scope, passed simulation evidence, payout, plan hash, custody language, and disabled Phase 6 transaction controls.
- A settlement evidence screen with six verifiable steps, canonical payout vector, block provenance, contract/oracle/transaction proof values, and functional copy controls.
- Live read-only server integration through the DreamDEX adapter, plus visibly labelled development fixtures that are unavailable in production.
- Versioned Zod contracts and no-store REST endpoints for positions, claimables, honest settled-position history, and market settlement explanations.
- An OpenAPI 3.1 discovery endpoint and a developer-facing read API guide.
- Coordinated evidence and mobile extraction concepts, plus a written fidelity ledger documenting code mappings and intentional differences from the approved mockups.
- A Next.js 16 Webpack resolver boundary for the workspace's explicit Node ESM `.js` specifiers.
- Automated Playwright coverage for desktop and mobile inbox filtering, claim-plan review, evidence/copy behavior, mobile navigation, OpenAPI discovery, and invalid-input errors.

Verified:

- Browser QA at `1536×1024` and `390×844`, including mobile tray overflow and menu interaction.
- 120 unit tests pass, including new API-schema and integer-only inbox-formatting regressions.
- 9 Playwright checks pass across desktop and mobile Chromium; one desktop skip is intentional for the mobile-only menu.
- The production Next.js build compiles the root page, wallet/market screens, four wallet/market API routes, history, and OpenAPI discovery.

Safety boundary remains unchanged: Phase 5 stores no private key, requests no wallet signature, and submits no transaction. The visible approval and redemption controls are disabled until the separately verified Phase 6 write path exists.

## 2026-09-03 — Phase 6 implementation complete; controlled broadcast pending

Delivered:

- Added the shared ERC-6909 outcome-token address to every candidate and plan so approval names both the token contract and DreamDEX binary-module operator.
- Added a live claim service that requires complete/fresh discovery, a verified block, a known operator-approval result, at least one paying entry, and exact owner-only recipient semantics.
- Preserved all assessable finalized positions for claim planning while keeping worker `wallet.claimable` candidates limited to winners/refunds. Finalized losers now appear as explicit `zero_payout` exclusions and never enter calldata.
- Added exact live `redeemMany` simulation and gas estimation at a named block, with a 50,000,000-gas ceiling above the captured 36,066,576-gas 100-entry regression.
- Added versioned Zod contracts and `POST /api/v1/claims/prepare` for approval-required drafts or persisted, fully simulated, 90-second ready plans.
- Added a second PostgreSQL migration and `claim_transactions` table for one durable, idempotent pending transaction per plan batch.
- Persisted ready plans, evidence snapshots, plan-created/submitted canonical events, transactional outbox work, and immutable audit records without signatures or keys.
- Added `POST /api/v1/claims/submissions`. Before persistence, the server fetches the broadcast transaction and verifies sender, module target, zero native value, function selector, operator, venue, ordered markets, outcomes, and amounts against the stored plan.
- Configured Wagmi 3 with SSR cookie hydration, an injected connector, and Somnia Shannon chain `50312`.
- Replaced the live tray's disabled Phase 5 control with wrong-owner and wrong-chain gates, explicit module-wide `setOperator` approval, post-approval replanning, exact user-signed `redeemMany`, immediate pending-hash delivery, explorer links, calldata inspection, and no-key custody copy. Fixture controls remain disabled and visibly non-live.
- Added `/docs` with the ClaimRail architecture, real-world explanation, API map, approval scope, manual flow, custody boundary, and future opt-in auto-claim distinction.

Verified:

- An unapproved live Shannon wallet produced a two-entry approval-required plan for `3,670,000,000` base units at block `478852540`; no simulation or write was attempted before approval.
- An already-approved live Shannon wallet produced one safe entry for `303,030,000` base units and its exact deployed `redeemMany` call simulated at `1,457,011` gas.
- A winner-plus-loser integration regression submits only the winning outcome and records the losing outcome as `zero_payout`.
- 121 root unit tests, 19 DreamDEX coverage tests, six PostgreSQL integration tests, and 11 desktop/mobile Playwright checks pass; one desktop skip remains intentional for the mobile-only navigation control.
- Desktop and mobile documentation plus the live claim tray were visually inspected against the approved original V3 direction.

Remaining Phase 6 stop condition:

- A dedicated funded owner wallet must approve if necessary and broadcast one controlled Shannon `redeemMany` transaction. Until its real hash enters durable reconciliation, Phase 6 is not marked fully complete.

## 2026-09-03 — Phase 7 implementation complete; controlled live receipt pending

Delivered:

- Added deployed `Redeemed`, `PayoutOwed`, and `OwedClaimed` receipt decoding plus direct `owed(owner, token)` reads.
- Added signer-free receipt reconciliation that requires a successful canonical receipt, exact market/outcome/owner/recipient event matches, planned burn and payout amounts, post-burn ERC-6909 balances, and conservative settlement-backing agreement.
- Added pending, reverted/failed, confirmed, and nonce-proven superseded handling. New submissions store the nonce fetched from the already-broadcast transaction; legacy nonce-less submissions stay pending instead of being guessed.
- Added durable claim-transaction leasing, attempt counters, delayed retry, expired-lease recovery, atomic aggregate completion, actual payout/gas/block storage, audit records, canonical claim events, and a dedicated `wallet.payout_owed` outbox event.
- Added lossless stored-plan decoding so worker reconciliation restores exact bigint and branded domain values only after Zod validation.
- Added `GET /api/v1/claims/:claimId`, downloadable versioned receipt JSON, and a responsive `/claims/:claimId` evidence page showing delivery checkpoints, expected versus actual payout, block, gas, batches, and Somnia transaction links.
- Added `/wallet/:address/history`, linked navigation, durable claim receipts, current position outcomes, amount returned, and explicit incomplete-PnL treatment when full cost basis is absent.
- Added a captured DreamDEX historical receipt fixture for deterministic receipt/event/post-state regression and visibly labelled UI demonstration. It is not represented as a new ClaimRail-originated transaction.

Verified:

- 125 root unit tests and 23 DreamDEX coverage tests pass, including captured winner confirmation, pending/revert behavior, post-state refusal, and nonce-proven replacement.
- Seven ephemeral PostgreSQL tests pass, including exclusive claim leases, delayed retry, restart recovery, idempotent terminal completion, exact payout/gas round-trip, and one owed-fallback event.
- Receipt, history, invalid API, and signing-boundary browser flows pass on desktop and mobile Chromium; both new pages were visually inspected against the approved V3 direction.
- The production build exposes the receipt API/page and wallet history page without adding a signer to the worker or server.

Remaining live stop condition:

- A dedicated funded owner must broadcast a controlled Shannon claim through ClaimRail. That real hash must progress from pending to its evidence-backed terminal receipt. No private key will be supplied to ClaimRail.

## 2026-09-03 — Phase 8 in progress

Delivered:

- Added one versioned canonical delivery-event schema covering market, wallet, claim, failure, and superseded transitions.
- Added a versioned webhook envelope carrying delivery identity, attempt number, timestamp, and the canonical event without recalculating settlement state.
- Added framework-neutral Web Crypto HMAC-SHA256 signing and verification using the `timestamp.rawBody` construction, a `v1=` signature prefix, constant-work comparison, a five-minute default replay window, and a 32-byte minimum secret.
- Added regressions proving intact timely payload acceptance plus tampered-body and stale-timestamp rejection.
- Added short-lived, one-use webhook ownership challenges whose readable EIP-191 message pins the owner, Somnia chain, HTTPS destination, selected canonical events, expiry, and random nonce while explicitly granting no financial permission.
- Added viem public-client verification for EOA, ERC-1271, ERC-6492, and ERC-8010-compatible account signatures against Shannon.
- Added durable notification bindings and filtered webhook subscriptions, authenticated AES-256-GCM encryption for stored signing secrets, hashes for secret identification, and immutable subscription audit entries.
- Added `POST /api/v1/subscriptions/challenges` and `POST /api/v1/subscriptions/verify`, OpenAPI discovery, and negative validation for insecure destinations and malformed ownership proofs.
- Added the responsive `/notifications` delivery-control frontend with a working wallet-signature webhook flow and honest next-adapter states for browser and Telegram.
- Added idempotent canonical-event fan-out that derives the subscribed owner from wallet payloads or durable wallet/position/claim relationships and creates one delivery per matching route.
- Added independent PostgreSQL delivery leases, attempt counters, expired-lease recovery, bounded exponential backoff, terminal dead-letter state, and 2xx-only completion so one failed endpoint never duplicates successful peers.
- Activated the worker's signed webhook transport when the shared encryption key is configured. It decrypts only for an attempt, signs the exact versioned envelope, sends delivery/timestamp/signature headers, refuses redirects, and rejects non-HTTPS or non-public destinations.
- Added end-to-end transport regressions that verify the receiver can authenticate the exact request body and that non-2xx responses remain retryable.

Verified:

- 138 root tests pass, including subscription schema, message, HMAC, encrypted-secret, request-forgery guard, receiver verification, replay, retry, and tamper regressions.
- Nine ephemeral PostgreSQL integration tests pass, including atomic single-use challenge consumption, encrypted webhook persistence, idempotent fan-out, independent retry, and successful completion.
- Seventeen desktop/mobile Playwright checks pass with one intentional desktop skip; the notification page was visually inspected at `1536×1024` and `390×844`.
- Root formatting, lint, typecheck, production build, and the isolated Event Contract probe typecheck pass.

Not yet active:

- Manual dead-letter replay, browser push, Telegram linking, the developer delivery console, and live multi-surface delivery remain the next Phase 8 slice.

## 2026-09-03 — Phase 8 developer delivery operations complete

Delivered:

- Added durable per-attempt delivery evidence with status, HTTP status, provider message ID,
  signature version, request timestamp, safe error, and start/finish times. Leasing creates the
  attempt atomically; completion and failure close the exact worker-owned attempt.
- Added single-use, ten-minute developer-console challenges and 15-minute owner-scoped access
  tokens. The readable signature explicitly grants no trade, claim, approval, or gas authority; only
  the token hash is stored.
- Added owner-filtered delivery list and detail repositories, plus dead-only replay that preserves
  the delivery/event identities, grants eight bounded attempts, and writes an immutable audit.
- Added versioned access, delivery, attempt, and replay schemas plus authenticated REST endpoints
  for challenge, verification, list, detail, and replay.
- Added the responsive `/developers/deliveries` console with route and delivery totals, state tabs,
  a full-width ledger, newest-first attempt timeline, exact canonical event JSON, and guarded
  dead-letter replay.
- Added a complete development-only console fixture with a visible non-live banner. Production
  starts behind wallet proof and never exposes another owner's destinations or failures.
- Updated OpenAPI, developer documentation, primary navigation, and the design fidelity ledger.

Verified:

- 140 unit tests pass across 21 files.
- Eleven ephemeral PostgreSQL integration tests pass, including durable attempt metadata,
  owner-filtered reads, wrong-owner replay refusal, dead-letter requeue/audit, challenge
  single-consumption, scope enforcement, and token expiry.
- Nineteen Playwright checks pass across desktop and mobile Chromium with one intentional
  desktop skip for the mobile navigation test. The console filter and inspector interaction work at
  both viewports; unauthenticated delivery APIs and invalid IDs fail closed.
- The console was captured at `1536×1024` and `390×844` and inspected beside the generated concept.

Not yet active:

- Browser push, Telegram linking, and a real external receiver demonstration remain the next Phase
  8 delivery adapters. A controlled live ClaimRail claim and receipt is still required for the Phase
  6/7 live stop condition.

## 2026-09-03 — Phase 8 human notification adapters complete

Delivered:

- Added standards-based browser push with a public VAPID discovery endpoint, explicit user-action
  permission request, service-worker subscription, owner-signed endpoint fingerprint, encrypted
  PushSubscription storage, user-visible canonical-event copy, and focus/open click behavior.
- Added Telegram private-chat linking through an owner-signed challenge and ten-minute one-time
  `/start` link. Only the start-token hash is stored before Telegram's authenticated webhook returns
  the chat ID, which is then encrypted before persistence.
- Added worker transports for browser and Telegram alongside signed webhooks. VAPID `404/410` and
  Telegram `403` responses dead-letter and deactivate the stale destination instead of retrying it
  forever; other failures retain bounded retry behavior.
- Generalized the authenticated delivery console to identify webhook, browser, and Telegram routes
  without exposing raw push endpoints, browser keys, chat IDs, or bot tokens.
- Replaced the notification roadmap placeholders with working browser and Telegram setup controls,
  while retaining the explicit “permission to notify, nothing financial” boundary.
- Documented all adapter endpoints, environment requirements, Telegram webhook registration, and
  the VAPID generation path in OpenAPI, the web documentation, and worker operations guide.

Verified:

- 148 unit tests pass across 25 files, including PushSubscription contracts, VAPID delivery,
  one-time Telegram challenges, Telegram transport copy, secret redaction, and revoked-destination
  classification.
- Thirteen ephemeral PostgreSQL integration tests pass, including encrypted browser activation,
  kind-specific leasing, terminal route deactivation, single-use Telegram linking, and proof that
  raw endpoint/chat destinations are absent from subscription rows.
- Core coverage remains 100% statements/lines; 23 DreamDEX coverage tests and six signer-free
  integration tests pass. The production build exposes all browser and Telegram routes.
- Nineteen Playwright checks pass across desktop and mobile Chromium with one intentional desktop
  skip. A cold-compiler rerun confirmed the previously timing-bound mobile history assertion.
- The updated notification page was inspected at `1536×1024` and `390×844` beside the approved V3
  concept: the monospaced rail identity, black/lime hierarchy, violet trust boundary, rectangular
  controls, and mobile single-column sequencing remain aligned. The intentional deviation is that
  Browser and Telegram now show real connect actions instead of roadmap labels.

Still requires external credentials/live proof:

- VAPID keys and a Telegram bot/webhook must be configured before a real device can receive either
  channel. No live delivery is claimed from deterministic transport tests alone.
- A controlled live ClaimRail claim and evidence-backed receipt remains the Phase 6/7 live stop
  condition.
