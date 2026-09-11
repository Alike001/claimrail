# ClaimRail — DoraHacks submission record

This material was used for the Somnia × DreamDEX Event Contracts Hackathon BUIDL submission. The
project owner submitted ClaimRail for DoraHacks review on September 11, 2026. Add the public BUIDL URL
here when DoraHacks issues it.

## Confirmed event requirements

- Working prototype on a testnet
- Public GitHub repository
- 2–3 minute demo video
- Feedback report about the SDK and documentation
- Meaningful use of DreamDEX Event Contracts, APIs, or SDKs

The public event description also emphasizes intuitive UX, adoption potential, and production-ready
applications over simple proofs of concept. A presentation deck is optional.

Sources: [official DoraHacks event page](https://dorahacks.io/hackathon/event-contracts/detail),
[organizer event listing](https://www.eventbrite.com/e/event-contracts-hackathon-tickets-1998344868295),
and [public event summary](https://ainave.com/events/hackathons/event-contracts-hackathon).

## BUIDL profile

**Project name**

ClaimRail

**Tagline**

Know what settled. Claim what’s yours.

**Vision / short summary**

ClaimRail is the after-trade companion for DreamDEX Event Contracts. It finds every position held by
a public wallet, explains what happened in plain language, identifies funds that are genuinely ready,
and helps the owner claim them safely—with independently verified receipts and real-time alerts.

**Category**

Crypto / Web3

**Suggested tags**

Somnia, DreamDEX, Event Contracts, prediction markets, settlement, wallet UX, developer tools

**AI agent question, if shown**

No. ClaimRail exposes signed settlement events and a Bot Kit adapter that agents can consume, but the
core product is a deterministic settlement and claim experience rather than an AI agent.

## Links

- Live product: `https://claimrail-alike001s-projects.vercel.app`
- GitHub: `https://github.com/Alike001/claimrail`
- Confirmed receipt:
  `https://claimrail-alike001s-projects.vercel.app/claims/claim:0xa8420df93e2289abf4d0242ef540548bb49ce76e6053643346012b5f401c84ab`
- Claim transaction:
  `https://shannon-explorer.somnia.network/tx/0x03172396dd2ba45d1f6c6d119d01029a2eb0b6fc8c13592c832293fe39666c11`
- SDK/documentation feedback:
  `https://github.com/Alike001/claimrail/blob/main/docs/hackathon/sdk-feedback.md`
- Demo video: `https://youtu.be/WfGL002GSs8`

## Long description

DreamDEX handles the market and Somnia records the outcome, but a position holder still has to find
old positions, understand the final result, determine whether money is available, and execute the
correct redemption. That last mile is fragmented and too technical for ordinary users.

ClaimRail turns it into one product journey:

1. Paste any public wallet address—no account or wallet connection is required.
2. See every discovered DreamDEX position grouped as live, waiting, finished, or ready.
3. Open plain-language evidence showing the market rule, outcome, payout vector, and Somnia proof.
4. Review a fresh, simulated DreamDEX claim plan.
5. Let the owner wallet approve and broadcast the exact `redeemMany` transaction.
6. Receive a receipt only after ClaimRail checks the Somnia receipt, DreamDEX `Redeemed` events,
   delivered amount, and post-claim balances.
7. Receive the same verified lifecycle through browser alerts, Telegram, or signed webhooks.

ClaimRail never stores a private key and never takes custody of proceeds. Monitoring is read-only;
financial actions remain explicit owner-wallet decisions.

The product is live on Somnia Shannon testnet. Its public proof includes a successful owner-signed
DreamDEX redemption for 1.001000 USDso, a confirmed reconciliation receipt, and production browser
and Telegram deliveries. ClaimRail also ships generated OpenAPI and JSON Schema contracts, a typed
TypeScript client, signed webhook envelopes, a DreamDEX Bot Kit adapter, retry operations, and a
documentation experience for both position holders and builders.

## How DreamDEX and Somnia are used

- DreamDEX market and position data provides discovery and lifecycle context.
- Somnia contract state is treated as authoritative before a position is called claimable.
- ERC-6909 balances prove what the wallet currently owns.
- DreamDEX payout vectors determine the paying outcome and expected return.
- `redeemMany` is simulated, then signed and broadcast by the owner wallet.
- Somnia receipts, DreamDEX `Redeemed` logs, and post-state are reconciled before success is shown.
- Canonical lifecycle events power browser, Telegram, webhook, bot, and agent integrations.

This implementation is inseparable from the hackathon ecosystem: without DreamDEX positions,
settlement rules, payout vectors, and redemption contracts on Somnia, ClaimRail has no product to
operate.

## What makes it different

Most prediction-market products focus on discovery and trading. ClaimRail owns the neglected part
after trading: finding forgotten positions, explaining settlement, safely collecting proceeds, and
producing durable proof.

It serves two connected audiences without forcing either through the other's interface:

- Position holders get a simple, non-custodial wallet experience.
- Developers, bots, games, and agents get the same verified settlement state through reusable APIs
  and signed events.

The result is both a consumer product and reusable DreamDEX adoption infrastructure.

## Working testnet evidence

- Network: Somnia Shannon, chain ID `50312`
- Owner wallet: `0xdE67A35B322e5A31e8215B5245CA4e48d7977F71`
- Successful owner-signed claim:
  `0x03172396dd2ba45d1f6c6d119d01029a2eb0b6fc8c13592c832293fe39666c11`
- Delivered amount: `1.001000 USDso`
- Verified block: `483279926`
- Gas used: `304686`
- Browser delivery: production route delivered and acknowledged
- Telegram delivery: production `@claimrailbot` route delivered and acknowledged

## Judging alignment

### Innovation and originality — 20%

ClaimRail treats settlement and claiming as a first-class product rather than an afterthought. It
combines consumer explanation, owner-controlled redemption, independently verified receipts, and a
machine-delivery layer around the same canonical lifecycle.

### Technical implementation — 25%

The live prototype integrates DreamDEX market discovery, payout and balance reads, claim simulation,
owner-signed `redeemMany`, durable PostgreSQL state, receipt reconciliation, workers, encrypted
subscriptions, signed webhooks, generated API artifacts, and retry operations. The repository passes
formatting, linting, strict type checks, unit and integration tests, coverage gates, PostgreSQL tests,
production builds, and desktop/mobile browser checks.

### User experience and design — 20%

Anyone can begin with one public wallet address. ClaimRail separates the four lifecycle states,
explains outcomes in everyday language, keeps technical proof available without leading with it, and
does not request a signature until the owner chooses a financial action.

### Business and ecosystem impact — 20%

ClaimRail can increase completed redemptions and user trust for DreamDEX while giving wallets, bots,
games, and agents a reusable settlement API. It creates a natural reason for traders to return after
markets close and lowers the integration cost for other Somnia products.

### Presentation and demo — 15%

The demo follows one verifiable story: find a real position, understand the evidence, show the
owner-signed confirmed receipt, prove browser and Telegram delivery, then show how another product
can consume the same events.

## SDK and documentation feedback summary

Building the live claim uncovered concrete integration issues and workarounds, including holder
semantics for `redeemMany`, indexer query behavior, settlement discovery, receipt reconciliation, and
the need for clearer owner-scoped examples. The complete evidence-backed report is in
`docs/hackathon/sdk-feedback.md`.

## Team and contact

Complete these fields manually in DoraHacks:

- Team member DoraHacks account(s)
- Public team or builder name
- Telegram, Discord, email, or other required contact method
- Any event-specific eligibility confirmations

Do not put private contact details in this repository.

## Final DoraHacks checklist

- [x] Open `https://dorahacks.io/hackathon/event-contracts/buidl` while signed in.
- [x] Create or select the ClaimRail BUIDL.
- [x] Upload the final ClaimRail logo or cover image.
- [x] Copy the profile, links, and long description from this document.
- [x] Confirm the live product and repository open in a signed-out browser.
- [x] Record and upload a 2–3 minute demo; add the public URL here and in the README.
- [x] Attach or link the SDK/documentation feedback report.
- [x] Add the correct team members and a monitored contact method.
- [x] Review every DoraHacks field marked as required and any event-specific questions.
- [x] Submit for DoraHacks review before the deadline.
- [ ] Save the confirmation and public BUIDL URL when available.
