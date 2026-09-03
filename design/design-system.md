# ClaimRail visual system — superseded V1

Status: rejected by the user on 2026-09-03 because the navy financial-dashboard language did not match Somnia or DreamDEX closely enough. Retained only as decision history. Do not implement it.

See [`claimrail-original-direction-v3.md`](claimrail-original-direction-v3.md) for the approved implementation direction. V2 is also superseded and retained only as research history.

## Direction

ClaimRail looks like a high-trust financial ledger with restrained railway-signaling cues. It is dark, crisp, flat, and evidence-led. Thin vertical connectors and status nodes express movement from market to settlement without decorative crypto imagery.

## Color tokens

| Token            | Concept value | Use                                             |
| ---------------- | ------------- | ----------------------------------------------- |
| `background`     | `#071426`     | True deep-ink page background                   |
| `surface`        | `#0c1c31`     | Ledger and summary surfaces                     |
| `surface-raised` | `#10243b`     | Drawer and focused regions                      |
| `text`           | `#f5f7fb`     | Primary content                                 |
| `text-muted`     | `#9eabc0`     | Secondary evidence and labels                   |
| `border`         | `#29405d`     | Crisp 1px dividers and frames                   |
| `action`         | `#4d88f7`     | Navigation selection and secondary actions      |
| `payout`         | `#74d99a`     | Verified paying values and primary claim action |
| `waiting`        | `#f4ad23`     | Waiting and approval disclosure                 |
| `loss`           | `#f25c4d`     | Losing side, always paired with text/icon       |

No decorative gradients, translucent glass, glow, cream backgrounds, or purple-neon treatment.

## Typography

- Contemporary neutral sans serif with editorial heading weight; select the actual web font before Phase 5 and lock it after screenshot comparison.
- Page title: 36–40px, 700, compact line height.
- Primary values: 28–34px, 600–700, tabular numerals.
- Row title: 16px, 600.
- Body/control: 14–16px, 450–600.
- Evidence/meta: 12–14px, 450, never below accessible reading size.
- Every button, tab, input, table header, and drawer control receives an explicit type style.

## Layout and containers

- Quiet 68px horizontal header with wordmark, three navigation items, network control, and one wallet action.
- Desktop page gutter approximately 32px.
- Primary screen uses an open ledger/table plus a narrow right claim-summary rail.
- Claim review uses a right drawer around 46% viewport width over the unchanged inbox.
- Small radii, restrained shadows, and 1px borders. Avoid nested cards and bento grids.
- Mobile collapses the summary rail below the totals and converts ledger rows to readable stacked rows without hiding financial fields.

## Component families

- Header/navigation and network control.
- Public address search.
- Verification/completeness line.
- Open summary strip.
- Tabs.
- Market ledger header and position rows.
- Lifecycle status node/rail.
- Claim summary rail.
- Evidence checklist.
- Review drawer.
- Redeem and exclusion rows.
- Approval disclosure.
- Two-step authorization rail.
- Primary, secondary, and text actions.

## Icon inventory

- ClaimRail rail mark: standalone brand asset required before visible Phase 5 implementation.
- Search: thin outline magnifier.
- Network: thin globe.
- Verification and checklist: thin shield/check treatment.
- Up/Down: directional arrow inside a restrained circle; always accompanied by text.
- Waiting: amber outlined node.
- Loss/exclusion: red direction or neutral excluded-circle; always accompanied by reason text.
- Row disclosure: thin chevron.
- Drawer close and copy-address controls: thin outline icons matching the same stroke weight.

## Motion

- Status-node change and newly claimable row may use a short restrained transition.
- Drawer enters from the right without overshoot.
- Respect `prefers-reduced-motion`; no ambient motion.

## Allowed first-viewport copy

- `ClaimRail`
- `Settlement Inbox`
- `Developers`
- `Docs`
- `Somnia Shannon`
- `Connect wallet`
- `See what finished, what paid, and what your wallet can safely claim.`
- `Enter any wallet address`
- `View wallet`
- `Verified at block … · … positions scanned`
- `Claimable now`, `Waiting for result`, `Live positions`, `Realized result`
- `All`, `Live`, `Waiting`, `Claimable`, `History`
- Market row labels and actions defined in the active concepts.

No eyebrow, kicker, promotional badge, slogan, token-price claim, or marketing proof strip may be added above the fold.
