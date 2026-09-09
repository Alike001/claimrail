# Verification Audit: ClaimRail Hackathon Readiness

## Verdict

**Product implementation: Pass. Submission readiness: Incomplete.**

ClaimRail is a working Somnia Shannon product with meaningful DreamDEX Event Contract integration,
not a disconnected demo. A public wallet can be inspected without an account, a real owner-signed
`redeemMany` claim has been independently reconciled, and real browser and Telegram deliveries have
completed through the deployed worker path. The remaining blockers are submission artifacts and
official rule verification, not core product engineering.

The final hackathon package is incomplete because the required 2–3 minute video has not been
recorded or linked and the DoraHacks BUIDL submission has not been finalized. The known requirements
supplied by the owner and repeated in public event listings are covered except for those submission
artifacts. DoraHacks currently returns an automated-access security challenge, so any event-specific
form fields marked as required must be checked in the owner's signed-in browser before submission.

## Artifacts Checked

- `.thoughts/specs/2026-09-03-claimrail.md`
- `.thoughts/plans/2026-09-03-claimrail-implementation.md`
- `.thoughts/verification/2026-09-07-claimrail-project.md`
- `context/claimrail-product-plan.md` and `context/claimrail-frontend-blueprint.md`
- `README.md`
- `docs/hackathon/readiness.md`
- `docs/hackathon/demo-script.md`
- `docs/hackathon/sdk-feedback.md`
- `docs/hackathon/assets/README.md` and the preserved live proof captures
- Production health, landing, Learn, wallet, delivery, and confirmed-receipt surfaces
- GitHub Actions production worker records and delivery results
- Current local format, lint, type, schema, unit, coverage, integration, PostgreSQL, build, and
  Playwright results

## Requirement Traceability

| Requirement                        | Status                   | Evidence                                                                                                                             |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Working Somnia testnet prototype   | Verified                 | Public Vercel site; health reports web, database, and schema ready                                                                   |
| Meaningful DreamDEX integration    | Verified                 | Market/position reads, lifecycle reconciliation, payout vectors, ERC-6909 balances, and owner-signed `redeemMany`                    |
| Public repository                  | Verified                 | `https://github.com/Alike001/claimrail`                                                                                              |
| Deployed website and PostgreSQL    | Verified                 | Public HTTPS product and reachable production database                                                                               |
| Operational worker                 | Verified with constraint | GitHub Actions worker completes real reconciliation and delivery cycles; it is scheduled every 15 minutes, not continuously resident |
| Real owner-signed successful claim | Verified                 | Shannon transaction `0x03172396dd2ba45d1f6c6d119d01029a2eb0b6fc8c13592c832293fe39666c11`                                             |
| Independently verified receipt     | Verified                 | Confirmed ClaimRail receipt with matched DreamDEX log, post-state, block, gas, and delivered amount                                  |
| Real external notification         | Verified                 | Browser delivery and Telegram `@claimrailbot` delivery both completed through production worker runs                                 |
| SDK/documentation feedback report  | Verified                 | `docs/hackathon/sdk-feedback.md` contains concrete integration findings and workarounds                                              |
| Understandable in about 30 seconds | Strong manual evidence   | Landing page leads with wallet outcome and one action; technical material is separated into Learn and developer surfaces             |
| Product rather than demo           | Verified                 | Persistent database, workers, receipts, alerts, retry operations, generated API contracts, client package, and public documentation  |
| Ecosystem relevance                | Verified                 | ClaimRail turns DreamDEX positions and Somnia settlement truth into discovery, explanation, claiming, receipts, and integrations     |
| 2–3 minute demo video              | Missing                  | Script exists, but no recorded public video URL is present                                                                           |
| DoraHacks BUIDL submission         | Incomplete               | Copy is being prepared; signed-in form fields and final submission have not been completed                                           |

## Acceptance Criteria Coverage

| Capability                                      | Status        | Evidence                                                                                     |
| ----------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------- |
| Read-only wallet lookup without signup          | Verified      | Public address route and responsive wallet inbox                                             |
| Plain-language lifecycle and result explanation | Verified      | Landing, position statuses, evidence screen, and Learn guide                                 |
| Exact, owner-controlled claim path              | Verified live | Fresh plan, explicit wallet signatures, successful `redeemMany`, no ClaimRail custody        |
| Receipt beyond transaction mining               | Verified live | Transaction receipt, DreamDEX `Redeemed` event, and post-state reconciliation                |
| Browser alert delivery                          | Verified live | Production route delivered and acknowledged                                                  |
| Telegram alert delivery                         | Verified live | Linked private chat received the clearly labelled non-financial test event                   |
| Webhook/API developer product                   | Verified      | Signed event envelopes, OpenAPI 3.1, JSON Schemas, client, examples, and delivery operations |
| Desktop and mobile primary journeys             | Verified      | Playwright coverage across both viewport projects; isolated mobile claim preview passed      |
| Submission presentation                         | Incomplete    | Live proof captures are complete; the final video remains                                    |

## Quality Gates

- `pnpm verify` passed on 2026-09-09: formatting, lint, strict type checks, generated API drift,
  unit tests, Core and DreamDEX coverage, integration tests, ephemeral PostgreSQL tests, and the
  production Next.js build.
- 31 test files and 167 unit tests passed.
- Core coverage: 100% statements, 100% lines, 100% functions, and 96.33% branches.
- DreamDEX coverage: 85.12% statements, 86.87% lines, 93.82% functions, and 66.32% branches.
- The complete Playwright run was interrupted by a browser channel closure during one mobile
  navigation. The exact failed test was rerun alone and passed; its failure artifact contained no
  application assertion failure.
- Production smoke checks returned HTTP 200 for the landing page, Learn page, and confirmed receipt.
- Production `/api/health` returned `ready` with the database reachable and schema ready.
- No private key, Telegram token, webhook secret, database URL, or recovery material is present in
  the documented public evidence.

## Deviations From Plan

- The no-card deployment uses a scheduled GitHub Actions worker rather than an always-on resident
  process. This keeps the prototype operational but can add roughly 15 minutes of alert or receipt
  latency and should be described accurately during judging.
- A temporary production-gated Shannon position tool was used to create controlled proof positions.
  It requires an owner wallet and exact allowance, but should be disabled after the demo capture.
- Safe, visibly labelled sample data remains useful for explaining empty states. It cannot trigger a
  live financial action and must not be presented as testnet proof.
- Optional gas-sponsored `redeemFor` remains intentionally deferred because it would add a relayer
  and authorization security surface. The shipped owner-signed flow satisfies the core claim use
  case.

## Gaps And Risks

1. **Blocking:** no public 2–3 minute demo video exists yet.
2. **Blocking:** DoraHacks BUIDL form fields must be checked in the owner's signed-in browser; the
   public event page currently blocks automated inspection with a security challenge.
3. **Presentation:** the required live proof captures are preserved; they still need to be selected
   and arranged in the DoraHacks BUIDL without exposing unrelated desktop details.
4. **Operations:** the free scheduled worker is not continuously resident and has variable cron
   latency.
5. **Cleanup:** `CLAIMRAIL_ENABLE_TEST_POSITION_TOOL` should be disabled after the final demo is
   recorded unless the submission explicitly needs the controlled proof tool.
6. **Scope risk:** additional secondary visual polishing before the video and submission would add
   schedule risk without improving the already-proven core integration.

## Follow-ups

1. Open the official DoraHacks BUIDL form while signed in and capture every event-specific required
   field without submitting yet.
2. Record the prepared demo as one 2–3 minute deployed take: 30-second story, wallet lookup,
   evidence, owner-controlled claim/confirmed receipt, browser and Telegram proof, then developer
   integration.
3. Upload the video, add its public URL to the readiness file and README, and finalize the submission
   copy.
4. Disable the temporary production proof tool and run a final public smoke check.
5. Freeze core scope; perform only submission-critical wording or visual corrections after these
   steps.

## Evidence Log

- Live product: `https://claimrail-alike001s-projects.vercel.app`
- Repository: `https://github.com/Alike001/claimrail`
- Owner wallet: `0xdE67A35B322e5A31e8215B5245CA4e48d7977F71`
- Successful claim transaction:
  `0x03172396dd2ba45d1f6c6d119d01029a2eb0b6fc8c13592c832293fe39666c11`
- Confirmed claim ID:
  `claim:0xa8420df93e2289abf4d0242ef540548bb49ce76e6053643346012b5f401c84ab`
- Confirmed amount: `1.001000 USDso`; verified block: `483279926`; gas used: `304686`;
  reconciliation fallback: `0`.
- Browser proof: `docs/hackathon/assets/live-browser-delivery-2026-09-08.png`
- Telegram proof: `docs/hackathon/assets/live-telegram-delivery-2026-09-09.png`
- Live positions: `docs/hackathon/assets/live-positions.png`
- Live wallet review: `docs/hackathon/assets/live-wallet-review.png`
- Live evidence: `docs/hackathon/assets/live-evidence.png`
- Telegram event: `0x704249ed97805109cb56924f82b43062028190b64c47263485d49a8c5760f6e6`
- Telegram worker run: `https://github.com/Alike001/claimrail/actions/runs/34315378481`
- Verified receipt capture: `docs/hackathon/assets/live-confirmed-receipt-2026-09-08.png`
