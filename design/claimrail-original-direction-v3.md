# ClaimRail original direction V3

Status: approved by the user on 2026-09-03. This is the active implementation reference.

## Product idea expressed visually

ClaimRail is a neutral settlement control board, not another trading terminal. A wallet's positions move across a readable rail from open market to locked market, recorded result, and claimable funds. When funds are ready, a bottom claim tray opens into a verifiable transaction plan without removing the market evidence from view.

The visual promise is: follow the position, verify the result, understand the authorization, then sign safely.

## Originality boundary

The design may feel compatible with the Somnia/DreamDEX ecosystem through generic functional conventions: a dark technical canvas, evidence-led tables, semantic financial colors, compact monospace data, and factual protocol attribution.

It must not reproduce proprietary expression or imply affiliation:

- No brace-derived `{c}`, `{d}`, or `{s}` mark.
- No DreamDEX ticker/header/right-order-panel skeleton.
- No Somnia pixel-halftone blob motif.
- No copied CSS, icons, illustrations, screenshots, copy, or proprietary assets.
- No violet-dominant ClaimRail identity; DreamDEX violet is provenance-only.
- Always identify ClaimRail as an `independent interface` in an appropriate product or legal surface.

## Candidate palette

| Token           | Value     | Role                                            |
| --------------- | --------- | ----------------------------------------------- |
| `page`          | `#090b09` | Near-black primary canvas                       |
| `surface`       | `#0d100d` | Expanded tray and focused rows                  |
| `border-subtle` | `#20231f` | Quiet table and section rules                   |
| `border`        | `#32372f` | Controls and strong boundaries                  |
| `text`          | `#f5f5f2` | Primary copy and totals                         |
| `muted`         | `#8d9388` | Metadata and explanations                       |
| `signal`        | `#c7ff4a` | ClaimRail active/ready state and primary action |
| `protocol`      | `#6e6eed` | DreamDEX provenance links only                  |
| `success`       | `#00d98b` | Verified payouts and passed simulation          |
| `loss`          | `#e83f6f` | No-payout result                                |
| `warning`       | `#ff9f1c` | Locked/oracle and approval warnings             |

No gradients, glow, glass, ambient purple wash, or decorative neon.

## Typography

- `IBM Plex Mono`: wordmark, navigation, hashes, addresses, blocks, timestamps, table chrome, lifecycle labels, evidence, and transaction-plan keys.
- `Manrope`: longer explanations and dense financial values where proportional type improves scanning.
- Tabular numerals for quantities, prices, returns, and blocks.
- Brand wordmark 22–24px; section title 22–26px; primary payout 36–44px; rows 14–17px; metadata 12–14px.
- Controls receive explicit 13–16px styles; no browser-default control typography.

The implementation may use metrically compatible fallbacks while fonts load, but the accepted visual character must be preserved.

## Container and layout model

- Quiet header around 60px with mark, four primary destinations, Somnia network state, wallet, and disconnect action.
- Border-separated wallet context band with public address inspection, claimable total, verified block, and protocol provenance.
- Full-width horizontal lifecycle rail with four stations: `open`, `locked`, `resolved`, `ready`.
- Full-width open settlement ledger; no fixed right sidebar and no card grid.
- Bottom claim tray docked to the viewport. Its collapsed state summarizes ready positions and payout; its expanded state occupies roughly the lower 42% of the viewport.
- Expanded tray uses two open columns separated by one rule: included/excluded positions on the left and the transaction plan on the right.
- 1px dividers, 0–4px radii, no floating modal shadow, no giant rounded wrapper.

## Signature motifs

- Original rail/checkpoint mark: two parallel rails, short cross ties, one checkpoint square, optionally suggesting `C/R` only through negative space.
- Repeating track sleepers join lifecycle nodes and imply data moving toward `ready`.
- Tiny square signals pair color with a text label; state is never color-only.
- A short track-handle at the claim tray boundary signals that the tray expands.
- The lifecycle rail is information architecture, not background decoration.

## Primary state: settlement inbox

Visible regions:

1. Header and wallet context.
2. Lifecycle rail with plain-language sublabels.
3. Settlement inbox filters and five-row ledger.
4. Bottom claim tray with `2 ready`, `3,670.00 USDso`, verification block, and `review claim`.
5. Sync and independent-interface status edge.

Ledger columns:

- `MARKET`
- `POSITION`
- `WINDOW`
- `STATION`
- `ORACLE / REASON`
- `RETURN`
- `EVIDENCE`

## First-claim state: expanded claim tray

The ledger stays visible above the tray with the two claimable rows selected. The tray exposes:

- Two included winning positions and three clear exclusions.
- Expected payout of `3,670.00 USDso`.
- A two-step checkpoint rail: `approve module` then `redeemMany`.
- Module `0x3ecC…e388`, `module-wide` scope, passed simulation, expected payout, plan hash, and calldata inspection.
- Exact risk disclosure: `This grants the DreamDEX binary module access to every outcome-token ID held by this wallet. Approval remains active until revoked.`
- `approve module` as the active first action and `confirmation 1 of 2` support copy.
- Direct-proceeds and no-private-key assurances.

Later claims skip the already-satisfied approval step when the canonical on-chain operator state confirms it.

## Product trust rules

- Monitoring any public address is read-only.
- Manual claiming always uses the owner's wallet signature.
- ClaimRail must show what will be included, excluded, approved, called, and expected before requesting a signature.
- The approval is described as module-wide, not position-specific.
- Proceeds go from the DreamDEX contract directly to the user; ClaimRail does not custody them.
- Optional automatic claiming is a later, opt-in EIP-712 path and must never be implied by the manual-claim UI.
- Oracle/result evidence and transaction receipts remain reachable from every finalized position.

## Candidate concept files

- [`concepts/settlement-rail-control-v3.png`](concepts/settlement-rail-control-v3.png)
- [`concepts/claim-tray-expanded-v3.png`](concepts/claim-tray-expanded-v3.png)
- [`concepts/settlement-evidence-v3.png`](concepts/settlement-evidence-v3.png)
- [`concepts/mobile-settlement-inbox-v3.png`](concepts/mobile-settlement-inbox-v3.png)
- [`concepts/mobile-claim-tray-expanded-v3.png`](concepts/mobile-claim-tray-expanded-v3.png)

The images specify composition and hierarchy only. Production UI text, tables, controls, marks, and rails must be accessible code-native elements rather than embedded screenshots.

## Phase 5 fidelity ledger

- The generated rail/checkpoint wordmark maps to the code-native `RailMark` component.
- The four station track maps to the semantic `Position lifecycle` region and live normalized counts.
- The full-width evidence rows map to the accessible ledger with market, position, station, oracle reason, return, and evidence columns.
- The docked lower rail maps to the fixed `ClaimTray`; its expanded state remains a scrollable in-page review surface rather than a modal.
- Lime maps only to ClaimRail readiness/actions, while violet remains limited to DreamDEX protocol provenance.
- Square status signals always retain adjacent text, so state is not communicated by color alone.
- The evidence extraction maps to `EvidenceScreen`, with six verified steps, proof values, functional copy controls, and the canonical payout-vector conclusion.

Intentional above-fold copy and behavior differences from the concepts:

- The implementation defaults to `all 5`; the approved desktop mock visually selected `claimable 2` while still showing five rows, which was internally inconsistent.
- `disconnect` is absent in Phase 5 because public-address monitoring does not connect a wallet. The header says `observe wallet` until a future signing flow exists.
- Development fixtures carry a visible `fixture · no live funds` label that never appears for live data.
- A losing position renders `—` rather than `0 USDso` because no return record has been observed; ClaimRail does not invent a transfer.
- Phase 6 controls are disabled and explicitly state that no transaction will be sent.

## Remaining coordinated surfaces

Create later extraction concepts only when their implementation phase begins:

- Notification setup and delivery history.
- Developer/API and webhook view.
