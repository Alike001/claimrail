# ClaimRail demo script — 2 minutes 45 seconds

Record the deployed product at 1080p. Use the dedicated Shannon wallet and real public evidence.
Keep provider dashboards, secrets, personal notifications, and wallet recovery information out of
the recording.

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

**Show:** Claim review, operator warning if shown, wallet confirmation, pending state, and confirmed
receipt. Do not cut across the wallet confirmation in a way that hides the network or target.

**Say:** “ClaimRail never holds the funds or a private key. It removes zero-paying entries, simulates
the exact DreamDEX `redeemMany` action, and asks the owner wallet to approve it. A transaction is not
called successful until the worker verifies the receipt, redemption logs, payout, and post-claim
balances.”

## 1:55–2:20 — Alerts and integrations

**Show:** The real browser, Telegram, or external webhook message, then the matching delivery record.

**Say:** “The same verified lifecycle can reach a person or another product. Here is a real delivery
from the continuous worker, with its canonical event and successful attempt recorded.”

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
- [ ] the complete take is between 2:00 and 3:00;
- [ ] every secret and personal identifier is absent.

If a claimable owner position is still unavailable, record a private rehearsal with clearly labelled
sample data, but do not present that rehearsal as the final live proof.
