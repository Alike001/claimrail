# Verification Audit: ClaimRail Project

## Verdict

**Conditional pass.** ClaimRail is a coherent, tested working prototype with a real DreamDEX read
adapter, deterministic settlement/claim rules, durable workers, user-signed manual redemption,
notifications, developer APIs, and an original responsive frontend. It is not yet a submission-ready
live product because deployment and the two mandatory external proofs remain incomplete. Optional
gas-sponsored `redeemFor` is deliberately deferred.

The 2026-09-07 frontend pass now gives non-technical users a plain-language landing page and working
position/claim experience, while placing API schemas, signed-event testing, and delivery operations
behind one secondary developer hub. Technical evidence remains available without leading the trader
journey.

## Artifacts Checked

- `.thoughts/specs/2026-09-03-claimrail.md` (R1-R17, AC1-AC20)
- `.thoughts/plans/2026-09-03-claimrail-implementation.md` (Phases 1-11)
- `.thoughts/quality/2026-09-03-project-quality-profile.md`
- `.thoughts/build-notes.md`
- `README.md`, owner launch checklist, API/architecture/operations documentation
- Web, worker, Core, DreamDEX, database, contracts, client, and example source/tests
- Generated OpenAPI 3.1 and JSON Schema artifacts
- Git history through explicit-only wallet action commit `6031db3`
- Current Somnia × DreamDEX Event Contracts Hackathon listing, public DreamDEX Event Contract docs,
  and current Somnia/DreamDEX builder resources

## Current Hackathon Fit

The public event listing describes a Somnia × DreamDEX Event Contracts build and asks for a working
testnet prototype, a GitHub repository, a 2–3 minute demo video, and SDK/documentation feedback. It
originally showed September 8, 2026; the project owner confirmed an extension to September 11, 2026.
The official submission portal should still be rechecked before final submission. The judging
weights remain innovation 20%, technical implementation 25%, UX/design 20%,
business/ecosystem impact 20%, and presentation 15%.

| Submission expectation              | ClaimRail status                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Meaningful DreamDEX Event Contracts | Strong fit: settlement, ERC-6909 positions, payout vectors, and `redeemMany`       |
| Somnia testnet prototype            | Full local and deployment-command rehearsals pass; public deployment is missing    |
| GitHub repository                   | Exists at `Alike001/claimrail`; current working changes still need to be committed |
| Production-ready quality            | Strong local gates and durable architecture; live operational proof is incomplete  |
| 2–3 minute demo video               | Missing                                                                            |
| SDK/documentation feedback          | Submission-ready report exists in `docs/hackathon/sdk-feedback.md`                 |

Sources: [event listing](https://www.eventbrite.com/e/event-contracts-hackathon-tickets-1998344868295),
[submission summary](https://ainave.com/events/hackathons/event-contracts-hackathon), and
[DreamDEX Event Contract developer docs](https://app.dreamdex.io/docs/developers/event-contracts).

## Requirement Traceability

| Requirement                                                | Status                                      | Implementation evidence                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R1-R4 lookup, discovery, market and position normalization | Verified                                    | `packages/dreamdex/src/services/claimrail.ts`, Core market/position types and tests, wallet API/UI               |
| R5-R6 settlement reconciliation and explanation            | Verified                                    | DreamDEX gateway/reconciliation, settlement evidence route and screen, captured regression fixtures              |
| R7-R8 safe plan, approval, and signing                     | Verified in code; live claim pending        | Core planner, claim service/API, `manual-claim-flow.tsx`, exact simulation, explicit wallet locks                |
| R9-R10 receipt and payout fallback                         | Verified in code; live receipt pending      | receipt worker/service, claims repository, receipt/history UI, reconciliation tests                              |
| R11 inbox                                                  | Verified                                    | responsive wallet inbox, lifecycle filters, fixture and browser tests                                            |
| R12 notifications                                          | Verified in code; external delivery pending | encrypted browser/Telegram/webhook subscriptions, worker transports, delivery console                            |
| R13 REST API and webhooks                                  | Verified                                    | runtime Zod contracts, generated OpenAPI/JSON Schema, signed envelope verification                               |
| R14 developer/agent integration                            | Verified                                    | `@claimrail/client`, webhook consumer, Bot Kit adapter, event playground                                         |
| R15 optional gas-sponsored claim                           | Deferred                                    | no `redeemFor` authorization/relayer is shipped or claimed                                                       |
| R16 documentation                                          | Verified                                    | `/docs`, package READMEs, architecture docs, owner checklist, generated API artifacts                            |
| R17 operational integrity                                  | Partial                                     | migrations, durable jobs, health/readiness and secret boundaries exist; CI/deployment/live recovery proof remain |

## Acceptance Criteria Coverage

| Criteria  | Status                                    | Evidence                                                                                           |
| --------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| AC1-AC5   | Verified                                  | exhaustive 1,044-row pagination; chain-over-indexer lifecycle; finalized and void payout fixtures  |
| AC6-AC9   | Verified                                  | loser exclusion, mixed batch, deduplication, over-balance, stale/invalid simulation regressions    |
| AC10-AC11 | Verified                                  | module-wide approval copy and two-step wallet flow; simulated, hashed, expiring complete plans     |
| AC12-AC14 | Verified in deterministic/live-read tests | receipt/log/post-state reconciliation, ambiguous submission handling, evidence ladder              |
| AC15      | Partial                                   | canonical event and independent consumers exist; real worker-to-external-receiver proof is missing |
| AC16      | Partial                                   | browser/Telegram retry/dedup tests pass; real device delivery is missing                           |
| AC17      | Deferred                                  | optional `redeemFor` valid/replay proof is not implemented                                         |
| AC18      | Verified                                  | `/docs` examples share runtime schemas and deterministic fixture sources                           |
| AC19      | Verified                                  | documented format, lint, strict typecheck, unit, coverage, PostgreSQL, build, and browser gates    |
| AC20      | Partial                                   | all demo surfaces exist; a fresh 2-3 minute deployed rehearsal with real claim/delivery is missing |

## Quality Gates

- Root `pnpm verify`: passed end to end again on 2026-09-08 after correcting the PostgreSQL
  readiness probe to wait for the final TCP server instead of the image's temporary initialization
  socket.
- Explicit-wallet page-load regression: passed on desktop and mobile Chromium on 2026-09-07.
- Latest recorded deterministic suite: 164 unit tests, 98 Core tests at 100%
  statements/lines and 96.33% branches, 26 DreamDEX coverage tests at 85.12% statement coverage,
  6 signer-free integrations, 14 PostgreSQL integrations, and a successful production build.
- API artifacts are generated from runtime schemas and checked for drift.
- No ordinary test or server path accepts a private key.
- Redesigned landing, position inbox, claim review, evidence screen, developer hub, delivery
  operations, and event tester were inspected in a real Chromium browser at desktop width.
- The final post-redesign Playwright run passed 27 checks across desktop and mobile Chromium with
  one intentional desktop skip for the mobile-only navigation control. The API-heavy contract test
  has a slow-test allowance so cold route compilation does not create a false functional failure.
- A fresh signer-free Shannon smoke passed at head block `482901281`: chain `50312`, configured
  finalized market and event topic, 1,044 wallet rows over 11 complete pages, seven current
  normalized positions, and two chain-verified claim candidates.

## Deviations From Plan

- Phase 10 remains deferred because it is optional and would require a new authorization/relayer
  security surface. Product copy correctly describes automatic redemption as future opt-in work.
- A local Shannon position creator was added because the public DreamDEX app currently selects
  mainnet. It is development-gated, capped at 1 tUSDC, and never accepts a private key.
- The first owner-created live position settled as a loss. It proves trade, settlement, indexer-lag,
  and losing-history behavior, but cannot satisfy the live redemption stop condition.

## Gaps And Risks

### Blocking submission gaps

1. The Render web/PostgreSQL/worker Blueprint passes a local rehearsal but has not been provisioned.
2. No owner-signed winning or void-refund redemption has passed durable receipt reconciliation.
3. No real browser, Telegram, or signed external HTTP delivery has been preserved as evidence.
4. No fresh judge-facing 2-3 minute deployed demo rehearsal has been recorded.

### Important non-blocking engineering debt

- CI remains absent despite being required by the quality profile; the deployment manifest now
  exists and its commands pass a fresh local PostgreSQL/web/worker rehearsal.
- Several authored files exceed the 300-line hard cap, especially database repositories and the
  delivery, manual-claim, and Shannon-tool components. Behavior is tested, but onboarding and
  maintenance would improve if these are split by responsibility.
- The README now includes the plain-language product story, quickstart, architecture map, working
  status, and an explicitly labelled sample screenshot.
- DreamDEX's indexer can lag or time out. ClaimRail already treats chain state as authoritative, but
  deployment monitoring needs an operator-visible lag metric and alert. The adapter now avoids the
  SDK's slow combined `MarketResolution` query by issuing the two required indexer selections as
  bounded parallel requests.

## Follow-ups

1. Provision the checked-in Render Blueprint and verify the live web, database, and worker.
2. Activate one notification route and prove `notification.test` through the real worker.
3. Create a controlled claimable position, perform one owner-signed `redeemMany`, and preserve the
   confirmed receipt and `claim.confirmed` delivery.
4. Rehearse and record the 2–3 minute demo, then initialize the Devpost workflow and prepare the
   portal-specific submission draft.
5. Only after the live proof, finish narrow visual polish on notifications, history, evidence, and
   receipts.
6. Add GitHub Actions for install, format, lint, typecheck, tests, PostgreSQL, build, E2E, secret
   scan, and read-only Shannon smoke.

## Evidence Log

- Owner position transaction:
  `0x04c0778821eeaf3377cc60d0374119f0e4273e8903c10a2e9f2f3f78b20f37d7`
- Owner market:
  `0x0000000000000000000000000000000000000000000000000000000000013200`
- On-chain inspection found the position balance `1.517000`, final payout vector
  `[0, 10000000]`, and a losing UP outcome; no redemption was attempted.
- Wallet page-load prompt regression: two Playwright projects passed on 2026-09-07.
- Latest read-only Shannon smoke head: block `482901281`, complete 11-page wallet scan, seven current
  normalized positions, two verified claim candidates, no signer or wallet connection.
- Git remote: `https://github.com/Alike001/claimrail.git`
