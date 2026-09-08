# ClaimRail consumer frontend direction

Status: active direction for the public landing experience. The evidence-heavy product interface
remains available after wallet lookup.

## Why the current first screen falls short

- It opens like an operator terminal and assumes people already understand settlement.
- Monospace typography, protocol terms, and a rail diagram carry more weight than the user’s goal.
- The product’s safest and most relatable facts are not visible together: lookup is public, no
  private key is needed, the user approves every transaction, and funds go directly to their wallet.
- There is no narrative landing page explaining the problem before asking for a wallet address.

## Research signals

- Nielsen Norman Group recommends conclusion-first, user-centered, brief content. Their research
  found that concise, scannable, objective copy materially improved measured usability:
  https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/
- Their comprehension guidance recommends familiar words, an inverted-pyramid structure, and less
  content on mobile: https://www.nngroup.com/articles/legibility-readability-comprehension/
- Phantom leads with a familiar category and outcome, then explains self-custody as “you control
  your funds” rather than opening with wallet infrastructure: https://phantom.com/
- Wise makes trust concrete through upfront outcomes and plain promises rather than technical
  process language: https://wise.com/gb/pricing/send-money
- Stripe demonstrates progressive disclosure: a short outcome-led opening, product detail later,
  and separate paths for no-code users and developers: https://stripe.com/
- Nielsen Norman Group's homepage guidance reinforces a simple information hierarchy, immediate
  purpose, obvious actions, and enough visual continuity to avoid a false end to the page:
  https://www.nngroup.com/videos/homepage-design-mistakes/
- Stripe's product-surface guidance distinguishes overview, list, and object-detail pages. This
  supports a compact wallet overview, a scannable position list, and contextual claim/evidence
  detail instead of one terminal-like table carrying every responsibility:
  https://docs.stripe.com/stripe-apps/design?locale=en-GB
- Stripe's developer resources lead with getting started and essentials before operational tools,
  while Coinbase describes consolidating separately grown earning features into one center for
  overview, comparison, and action. ClaimRail applies both patterns through one developer home and
  one unified after-trade workspace:
  https://docs.stripe.com/development and https://www.coinbase.com/blog/landing/design
- Somnia Docs uses a familiar documentation frame: categorized left navigation, one focused article,
  an on-page outline, concise callouts, and next-page movement. ClaimRail adopts that structure while
  retaining its own visual identity and separating consumer learning from technical reference:
  https://docs.somnia.network/

## Chosen direction: financial clarity

ClaimRail should feel like a calm consumer finance companion with a rigorous proof layer beneath it.

- Warm off-white canvas, deep olive text, and one acid-green action color.
- Manrope for readable interface copy, Instrument Serif for human editorial emphasis, and IBM Plex
  Mono only for addresses, hashes, and protocol evidence.
- Outcome-first hero: know what happened and collect what is ready.
- Wallet lookup remains the primary action, explicitly described as public and read-only.
- One realistic sample position explains the product before the user supplies data.
- Three plain steps replace protocol lifecycle terminology on the public page.
- Safety is described through the actual money path: DreamDEX contract to the user’s wallet.
- Developer infrastructure stays accessible but no longer competes with the user story above the
  fold.
- The public narrative follows one causal sequence: market closes, result is recorded, funds wait,
  ClaimRail explains the position, and the owner chooses whether to claim.
- The working app follows overview → position list → contextual claim review. Developer tools follow
  quick start → event testing → delivery operations.
- Learn follows overview → consumer workflow → safety → developer quick start → API/events reference.
  A position holder should never need to read integration material to complete an ordinary task.

## Copy vocabulary

Prefer: finished, waiting, result, ready to claim, expected back, your wallet, checked on Somnia.

Reserve for detail screens: settlement, reconciliation, payout vector, ERC-6909, module approval,
canonical event, indexer, calldata.

## Guardrails

- Sample values must say “sample data.”
- Public lookup must never imply wallet ownership.
- Claim language must preserve the explicit approval and signing boundary.
- No live-looking result may be fabricated.
- The landing page should remain useful at 390px without hiding the safety explanation.
