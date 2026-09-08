# ClaimRail hackathon readiness board

Working deadline: **September 11, 2026**, as confirmed by the project owner.

The submission story is intentionally simple:

> ClaimRail finds finished DreamDEX positions on Somnia, explains the result, and helps the owner
> claim available funds safely.

Everything technical should support that sentence, not compete with it.

## Must finish before submission

| Order | Deliverable                    | Status                           | Pass condition                                              | Owner action needed                         |
| ----: | ------------------------------ | -------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
|     1 | Public web, PostgreSQL, worker | Live and verified                | `/api/health` is `200`; manual worker run is `ready`        | None                                        |
|     2 | Real claim and receipt         | Live and independently confirmed | owner-signed `redeemMany`; receipt becomes `confirmed`      | None                                        |
|     3 | Real delivery                  | Live browser delivery verified   | browser, Telegram, or webhook receives a real worker event  | None                                        |
|     4 | SDK/docs feedback              | Updated with live claim findings | report checked for accuracy and attached/linked             | Final owner review                          |
|     5 | README and materials           | In progress                      | public repository explains product and live proof honestly  | Push the verified revision                  |
|     6 | 2–3 minute video               | Script and live proof ready      | deployed end-to-end take between 2:00 and 3:00              | Record wallet/device interaction and upload |
|     7 | Secondary UI polish            | Deferred                         | History, Alerts, Evidence, Receipts share final visual pass | None until 1–6 pass                         |

## September 8–11 execution order

### September 8 — make the build deployable

- [x] Run the complete local verification suite.
- [x] Review and push the deployment-ready revision.
- [x] Create the Neon Free database and Vercel Hobby project.
- [x] Add GitHub Actions secrets, run migrations, and enable the scheduled worker.
- [x] Confirm web health and a successful manual worker cycle.

### September 9 — create public proof

- [x] Activate one browser, Telegram, or external webhook route.
- [x] Send `notification.test` through the real worker and save the delivered attempt.
- [x] Open and preserve a controlled winning position for the owner-signed proof.
- [ ] Capture clean landing, positions, evidence, developer, and delivery screenshots.

### September 10 — complete the claim and video

- [x] Perform the small owner-signed claim only after ClaimRail marks it claimable.
- [x] Wait for the worker-verified `confirmed` receipt and preserve the explorer link.
- [x] Confirm `claim.confirmed` reaches the real destination.
- [ ] Rehearse once, then record and upload the 2–3 minute demo.
- [ ] Finalize submission copy, SDK feedback link, repository URL, and video URL.

### September 11 — submit with buffer

- [ ] Run a final deployed smoke check and repository verification check.
- [ ] Confirm every public link works in a signed-out browser.
- [ ] Submit before the portal cutoff; do not use the final hour for feature work.
- [ ] Save the submission confirmation.

## Evidence register

Fill only with public values. Never place tokens, database URLs, email addresses, webhook secrets, or
private wallet material here.

| Evidence            | Public value or asset path                                                         | Status                    |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------- |
| Live site           | `https://claimrail-alike001s-projects.vercel.app`                                  | Verified public           |
| Repository          | `https://github.com/Alike001/claimrail`                                            | Live                      |
| Owner wallet        | `0xdE67A35B322e5A31e8215B5245CA4e48d7977F71`                                       | Verified by worker        |
| Worker proof        | `https://github.com/Alike001/claimrail/actions/runs/34284779776`                   | Receipt reconciled        |
| Claimable market    | `0x0000000000000000000000000000000000000000000000000000000000017232`               | Finalized and claimed     |
| Claim transaction   | `0x03172396dd2ba45d1f6c6d119d01029a2eb0b6fc8c13592c832293fe39666c11`               | Successful on Shannon     |
| Verified receipt    | `/claims/claim:0xa8420df93e2289abf4d0242ef540548bb49ce76e6053643346012b5f401c84ab` | Confirmed production      |
| Delivery proof      | `docs/hackathon/assets/live-browser-delivery-2026-09-08.png`; run `34285031481`    | Verified production       |
| SDK feedback        | `docs/hackathon/sdk-feedback.md`                                                   | Ready for review          |
| Presentation assets | `docs/hackathon/assets/`                                                           | Live delivery and receipt |
| Demo video          | pending public URL                                                                 | Missing                   |

## Scope guard

Do not add new claim modes, another smart contract, portfolio analytics, social features, or extra
navigation before the live deployment, claim, delivery, report, README, and video pass. The current
product already has enough capability; the remaining risk is proof and presentation, not feature
count.
