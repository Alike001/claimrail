# ClaimRail V3 ImageGen prompts

Mode: built-in image generation. Date: 2026-09-03.

These prompts produced design references only. Production UI text and controls must remain code-native.

## Primary settlement inbox

```text
Use case: ui-mockup
Asset type: complete desktop web application design reference, primary ClaimRail settlement inbox state
Primary request: Create one polished, implementation-ready 16:9 desktop UI concept for ClaimRail, an independent settlement and notification infrastructure product for DreamDEX Event Contracts on Somnia. This is the real application screen, not a marketing page. Audience: prediction-market traders, developers, bots, and AI agents. It must feel like an original Swiss-industrial railway control board for on-chain settlement: precise, calm, trustworthy, dense but readable.

FRAME AND IMPLEMENTATION:
- 1536×1024-style desktop browser viewport, full application visible.
- Flat codeable web UI. All interface text, tables, controls, and status labels should look code-native.
- Crisp grid, 1px rules, square or 0–4px corners, no glass, no gradients, no glow, no 3D, no generic dashboard cards.
- Strong component boundaries and measurable spacing, suitable for React implementation.
- One dominant conceptual spine: a settlement railway / control-board map. Use small linear track sleepers and checkpoint nodes as functional lifecycle/progress motifs, not decoration.
- Brand mark: an original small geometric rail symbol made from two parallel lines, several short cross ties, and one checkpoint square; optionally suggests C/R through negative space. Absolutely no curly braces and no imitation of Somnia or DreamDEX marks.

VISUAL SYSTEM:
- Deep near-black background #090b09.
- Warm graphite separators #20231f and #32372f.
- Primary text warm white #f5f5f2; muted text #8d9388.
- ClaimRail signature accent signal lime #c7ff4a, used sparingly for ready/active rail nodes and one main action.
- DreamDEX violet #6e6eed only for provenance links and “DreamDEX source”, never the primary UI color.
- Emerald #00d98b for successful payout, rose #e83f6f for no payout/loss, amber #ff9f1c for waiting/warnings.
- Typography character: IBM Plex Mono-style technical chrome and labels paired with Manrope-style readable numbers/body. Lowercase brand wordmark “claimrail”. No futuristic display gimmicks.
- High data density but generous 24–32px section spacing. No rounded pill overload.

EXACT STRUCTURE:
1. Quiet top header about 60px high:
   left original rail mark plus lowercase “claimrail”.
   center navigation: “inbox”, “history”, “developers”, “docs”.
   right: chain indicator “Somnia”, abbreviated wallet “0x71f4…92ac”, and compact “disconnect”.
   Include small honest attribution nearby or in footer: “independent interface”.

2. Wallet context strip below header, full width, open layout:
   label “wallet monitor”
   public address input showing “0x71f4a8b62d77c91402ce1a10bc65c9dff17892ac”
   compact action “inspect”
   on the right: “claimable 3,670.00 USDso” and “verified block 42,918,631”
   Also a small source line: “settlement source DreamDEX · built on Somnia”.

3. A full-width horizontal lifecycle rail as the main visual idea, not cards:
   four station nodes connected by thin lines and repeating track sleepers:
   “open 1”, “locked 1”, “resolved 2”, “ready 2”
   active/ready nodes in signal lime, locked in amber, resolved neutral. Each station has a short plain-language sublabel:
   open: “trading”
   locked: “waiting for oracle”
   resolved: “result recorded”
   ready: “funds can be claimed”
   Make this rail unmistakable and elegant.

4. Main settlement ledger, full width and dominant, no sidebar:
   heading “settlement inbox”
   tabs/filters as minimal underlined text: “all 5”, “needs attention 3”, “claimable 2”
   Table columns exactly:
   “MARKET”, “POSITION”, “WINDOW”, “STATION”, “ORACLE / REASON”, “RETURN”, “EVIDENCE”
   Five readable rows with subtle horizontal rules and tiny rail connectors on the far left:
   - ETH/USDso | DOWN · 2,970 | 15m | ready | “2,406.12 < open 2,411.80” | “2,970 USDso” emerald | “view proof”
   - BTC/USDso | UP · 700 | 15m | ready | “77,911.95 > open 77,748.36” | “700 USDso” emerald | “view proof”
   - ETH/USDso | UP · 500 | 1h | locked | “awaiting oracle” | “—” | “watch”
   - BTC/USDso | DOWN · 450 | 15m | resolved | “oracle result: UP” | “0 USDso” rose | “view proof”
   - SOMI/USDso | UP · 240 | 15m | voided | “oracle unavailable · refund” | “240 USDso” warm white | “view proof”
   Each status is a restrained inline label with a tiny square signal, not rounded pills.

5. A horizontal bottom claim tray spanning the viewport, separated by a strong rule, visibly docked but not floating:
   left small rail icon and “2 ready”
   center large “3,670.00 USDso”
   below/near center “verified at block 42,918,631 · 2 entries”
   right a high-contrast signal-lime rectangular button “review claim →”
   tiny safety text: “wallet signature required · no keys stored”
   This bottom tray is the primary action pattern.

6. Tiny footer/status edge: “index synced 3s ago” and “independent ClaimRail interface”.

INTERACTION CUES:
- Selected “inbox” and “claimable 2” use a precise lime underline.
- Ledger rows have subtle evidence-link affordance.
- Bottom tray visually implies it expands upward for review.
- Motion language: rail nodes could pulse once when a market becomes claimable; track sleepers imply data moving toward “ready”.

WHAT THIS IS NOT:
- NOT a copy of DreamDEX or Somnia.
- NO curly-brace logo, NO {c}, NO {d}, NO {s}.
- NO DreamDEX-style ticker strip.
- NO fixed right-hand trading or claim panel.
- NO Somnia halftone blobs, pixel clouds, or branded illustrations.
- NO dominant violet palette; violet only marks external DreamDEX provenance.
- NO crypto neon, purple/blue gradients, glowing lines, floating glass cards, bento grid, marketing hero, fake charts, candles, order book, stock-photo imagery, rounded capsule buttons, giant rounded containers, or ornamental badges.
- Do not invent metrics, features, markets, or copy beyond the text above.
- Text must be legible and spelled as closely as possible.
- The result should look like a serious, original public infrastructure interface that can serve both humans and machine clients.
```

## Expanded first-claim tray

The primary settlement inbox image was supplied as the sole reference image for visual continuity.

```text
Use case: ui-mockup
Asset type: complete desktop web application design reference, expanded ClaimRail first-claim review state
Input image: Image 1 is the exact ClaimRail primary inbox design system and layout reference. Preserve its original rail brand mark, near-black/graphite palette, signal-lime ClaimRail accent, restrained DreamDEX violet provenance, IBM Plex Mono + Manrope typography mood, sharp 1px rule geometry, top header, wallet context, lifecycle rail, ledger structure, and lack of a right sidebar.

Primary request: Create a second polished 16:9 desktop UI state showing what happens immediately after the user clicks “review claim →”. The bottom claim tray must expand upward into a wide docked review workspace occupying roughly the lower 42% of the viewport. It remains attached to the bottom edge and spans the full width. The settlement ledger remains visible above, compressed to show its heading and the two selected claimable rows, so the user retains context. This is not a modal and not a right-hand panel.

KEEP VISIBLE ABOVE THE EXPANDED TRAY:
- same quiet ClaimRail header with inbox selected
- same wallet context and claimable total
- same lifecycle rail
- “settlement inbox” heading and two claimable rows:
  ETH/USDso DOWN · 2,970, return 2,970 USDso
  BTC/USDso UP · 700, return 700 USDso
- Give selected rows a subtle signal-lime left rail connector and selection square, not a glowing fill.

EXPANDED BOTTOM CLAIM TRAY:
- Strong top border with a centered or left rail-handle motif made from short track sleepers.
- Header line:
  left “claim plan”
  next “2 positions”
  center large “3,670.00 USDso”
  small “first claim · 2 wallet confirmations”
  far right a minimal text control “close”
- Two-column open layout divided by one thin vertical rule, no floating cards.

LEFT COLUMN: “included positions”
Two compact rows:
1. “ETH/USDso · DOWN” with “2,970 USDso”
   subline “finalized · winner · verified”
2. “BTC/USDso · UP” with “700 USDso”
   subline “finalized · winner · verified”
Then a restrained exclusions section:
“not included”
“ETH 1h · still locked”
“BTC 15m DOWN · no payout”
“SOMI 15m UP · refunded separately”
Use amber/rose/muted semantic signals as tiny squares only.

RIGHT COLUMN: “transaction plan”
Show a horizontal two-step rail with checkpoint nodes:
step 1 active: “approve module”
step 2 queued: “redeemMany”
Below it show compact key/value evidence:
“module” → “0x3ecC…e388”
“scope” → “module-wide”
“simulation” → “passed”
“expected payout” → “3,670.00 USDso”
“plan hash” → “0xb72a…41e9”
Place a small underlined link “inspect calldata”.
Show this exact warning in a precise amber-bordered band, fully legible:
“This grants the DreamDEX binary module access to every outcome-token ID held by this wallet. Approval remains active until revoked.”
At the bottom right place a signal-lime rectangular primary button:
“approve module →”
Under it exact support text:
“confirmation 1 of 2 · signed by your wallet”
At bottom left or center place:
“proceeds go directly to 0x71f4…92ac”
“ClaimRail never stores your private key.”

VISUAL SYSTEM AND BEHAVIOR:
- Preserve the reference image’s originality and visual system exactly.
- Bottom tray expansion is the signature interaction. It should feel like opening a physical railway dispatch desk: precise rails, checkpoints, clear sequence, no decoration.
- Primary focal order: expected payout → two-step transaction rail → approval warning → approve module button.
- Signal lime #c7ff4a for active step/button, emerald for passed and payout, amber for authorization warning, DreamDEX violet only for protocol provenance/module name.
- Crisp, implementable, high data clarity; visible copy legible.

WHAT THIS IS NOT:
- NOT a new visual direction.
- NOT a modal dialog, floating card, right sidebar, exchange order panel, wallet popup, wizard card, bento grid, marketing screen, or copied DreamDEX/Somnia interface.
- NO curly braces, no {c}/{d}/{s}, no ticker, no order book, no charts, no halftone blobs, no violet-dominant palette, no gradients, glass, glow, shadows, giant radii, capsule buttons, fake metrics, or invented copy.
- Do not hide the ledger entirely.
- Do not make “redeemMany” active yet; step 1 approval is active because this is a first claim.
- Do not imply ClaimRail owns or transfers the payout.
- Text should be spelled as closely as possible.
```
