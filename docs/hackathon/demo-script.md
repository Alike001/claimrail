# ClaimRail demo script — 2 minutes 45 seconds

Record the deployed product at 1080p. Use the dedicated Shannon wallet and real public evidence.
Keep provider dashboards, secrets, personal notifications, and wallet recovery information out of
the recording.

The successful claim is already complete. Do not create or redeem another position for the final
video. Use the preserved live positions and wallet-review captures for the pre-claim state, then open
the deployed confirmed receipt and Somnia explorer transaction as the post-claim proof.

## Recording tabs

Open these before recording, in this order:

1. `https://claimrail-alike001s-projects.vercel.app`
2. `docs/hackathon/assets/live-positions.png`
3. `https://claimrail-alike001s-projects.vercel.app/markets/0x0000000000000000000000000000000000000000000000000000000000017232`
4. `docs/hackathon/assets/live-wallet-review.png`
5. `https://claimrail-alike001s-projects.vercel.app/claims/claim:0xa8420df93e2289abf4d0242ef540548bb49ce76e6053643346012b5f401c84ab`
6. `docs/hackathon/assets/live-browser-delivery-2026-09-08.png`
7. `docs/hackathon/assets/live-telegram-delivery-2026-09-09.png`
8. `https://claimrail-alike001s-projects.vercel.app/developers`
9. `https://claimrail-alike001s-projects.vercel.app/docs`

For local image paths, open the corresponding file from the GitHub repository if the recorder cannot
display local files cleanly. Hide bookmarks, personal tabs, notifications, and the desktop dock.

## 0:00–0:20 — The problem

**Show:** Landing page and its wallet lookup.

**Say:** “DreamDEX makes prediction markets possible on Somnia. But after a market finishes, a user
still has to find the old position, understand the result, and know whether funds are ready.
ClaimRail is the after-trade companion that makes that last mile clear.”

## 0:20–0:50 — Find every position

**Show:** Paste the dedicated wallet address. Open the positions page and point to the lifecycle
groups.

**Say:** “Looking up a public address needs no account and no wallet connection. ClaimRail discovers
the wallet's DreamDEX positions, then separates what is open, waiting, finished, and ready to claim.”

## 0:50–1:20 — Explain and verify

**Show:** Open the claimable position's Evidence page. Point to the rule, opening value, closing
answer, payout vector, finalization block, and explorer link.

**Say:** “The indexer helps us discover positions, but ClaimRail checks the current Somnia contracts
before calling money claimable. The result is explained in normal language, while the exact on-chain
proof remains available.”

## 1:20–1:55 — Owner-controlled claim

**Show:** The preserved live wallet review, then the deployed confirmed receipt and its Somnia
transaction link. State clearly that the first screen is the captured pre-signing state and the
receipt is the completed result. Do not imply that a new transaction is being broadcast during the
recording.

**Say:** “ClaimRail never holds the funds or a private key. It removes zero-paying entries, simulates
the exact DreamDEX `redeemMany` action, and asks the owner wallet to approve it. A transaction is not
called successful until the worker verifies the receipt, redemption logs, payout, and post-claim
balances.”

## 1:55–2:20 — Alerts and integrations

**Show:** The real browser, Telegram, or external webhook message, then the matching delivery record.

**Say:** “The same verified lifecycle can reach a person or another product. Here is a real delivery
from the deployed worker, with its canonical event and successful attempt recorded.”

## 2:20–2:40 — Why it matters to the ecosystem

**Show:** Developer overview and documentation for no more than ten seconds each.

**Say:** “For DreamDEX, this closes the loop after trading and makes claims easier to complete. For
Somnia, it turns fast on-chain Event Contract activity into a clear, trustworthy consumer experience.
Developers can reuse the same signed events through the API, webhooks, or Bot Kit adapter.”

## 2:40–2:45 — Close

**Show:** Return to the confirmed receipt or the landing headline.

**Say:** “ClaimRail: know what settled, and claim what’s yours.”

## Recording gate

Do not record the final submission video until all boxes below are true:

- [x] the public site and worker are healthy;
- [x] the position and claim are real Shannon testnet state;
- [x] the receipt is `confirmed`, not fixture or merely mined;
- [x] at least one real delivery is visible;
- [x] pre-claim positions, wallet review, evidence, delivery, and receipt proof are preserved;
- [x] the published take is 2:13, between 2:00 and 3:00;
- [x] a sampled visual review found no wallet recovery material, provider secret, or credential.

Published demo: `https://youtu.be/WfGL002GSs8`

If a claimable owner position is still unavailable, record a private rehearsal with clearly labelled
sample data, but do not present that rehearsal as the final live proof.
