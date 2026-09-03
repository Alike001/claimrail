# ClaimRail terminal direction V2

Status: superseded research direction. Do not implement or ship this visual system.

V2 proved that a dense evidence-first terminal suits ClaimRail, but it translated Somnia and DreamDEX too literally. The brace-derived mark, ticker/header proportions, fixed right panel, violet-primary hierarchy, and pixel-halftone motif created avoidable brand and trade-dress risk. See [`claimrail-original-direction-v3.md`](claimrail-original-direction-v3.md) for the current candidate.

## Direction brief

ClaimRail is an on-chain settlement dossier: a precise operational terminal for traders, developers, bots, and agents. It combines Somnia's monochrome, monospace, pixel-compute identity with DreamDEX's true-black exchange shell, violet actions, semantic market colors, and dense evidence-first layout.

## Candidate tokens

| Token             | Value     | Role                                 |
| ----------------- | --------- | ------------------------------------ |
| `page`            | `#000000` | Primary canvas and footer            |
| `surface`         | `#0a0a0a` | Table hover/selected regions         |
| `surface-raised`  | `#141414` | Inputs, fixed operational panels     |
| `border-subtle`   | `#1c1c1c` | Table rules and quiet separators     |
| `border`          | `#262626` | Region boundaries and controls       |
| `border-elevated` | `#414141` | Focused evidence boundaries          |
| `heading`         | `#f5f5f5` | Primary text and large totals        |
| `body`            | `#d3d3d3` | Explanations and table values        |
| `muted`           | `#999999` | Metadata and secondary labels        |
| `subtle`          | `#666666` | Disabled/tertiary information        |
| `action`          | `#6e6eed` | Primary actions and active selection |
| `action-text`     | `#9999ff` | Inline action/evidence links         |
| `success`         | `#00fa89` | Claimable, passed, synced            |
| `error`           | `#dc0b4a` | Losing/no-payout states              |
| `warning`         | `#ff7a00` | Locked/oracle/approval warning       |

No navy, cyan wash, decorative gradient, glow, translucent glass, or cream surface.

## Typography

- `Source Code Pro`: wordmark, navigation, hashes, blocks, timestamps, lifecycle labels, status ticker, compact controls, and technical evidence.
- `Geist`: longer explanations and dense numeric/product text where monospace would reduce readability.
- Tabular numerals throughout financial values.
- Product title 22–24px, never a marketing-scale hero.
- Primary payout 32–36px; row text 13–15px; terminal metadata 12–13px.
- Controls receive explicit 13–14px typography and 500–600 weight.

## Container model

- 68px fixed header.
- 34px live chain/indexer strip.
- Open ledger workspace plus a fixed operational right panel.
- Summary values form a border-separated band, not cards.
- Tabs and table rules are edge-to-edge.
- Claim review replaces/widens the fixed right panel; it is not a floating modal.
- 1px dividers; 0–6px radii; minimal elevation.

## Signature motifs

- `{c} claimrail` code-like mark, distinct from DreamDEX's logo.
- Vertical lifecycle trace inside the lifecycle column.
- Small square chain/state indicators.
- Live settlement/reconciliation strip.
- Somnia-inspired pixel-halftone field only in unused panel space.

## Core states represented

- Primary settlement inbox and claim queue.
- First-time manual claim review with explicit module-wide approval.
- Later extraction concepts still required before implementation: settlement evidence receipt, notification setup, public developer/API view, and mobile inbox/review states.

## Candidate concept files

- [`concepts/settlement-inbox-terminal-v2.png`](concepts/settlement-inbox-terminal-v2.png)
- [`concepts/claim-review-terminal-v2.png`](concepts/claim-review-terminal-v2.png)

The old navy concepts and these V2 concepts must not be used for implementation.
