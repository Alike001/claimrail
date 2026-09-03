# Somnia and DreamDEX visual audit

Status: completed before ClaimRail Phase 2 on 2026-09-03.

## Sources inspected

- [Somnia homepage](https://somnia.network/), desktop viewport and full-page capture.
- [DreamDEX homepage](https://www.dreamdex.io/), desktop viewport, full-page capture, accessibility structure, and public CSS tokens.
- [DreamDEX Event Contracts terminal](https://app.dreamdex.io/event-contracts), desktop viewport, accessibility structure, and public CSS tokens.
- `vibecurb-cli@1.0.0`, inspected from its published npm tarball before execution.

Temporary local reference screenshots were captured at a 1440×1000 CSS-pixel viewport on 2026-09-03, inspected, and then removed so third-party site captures are not carried into a public ClaimRail repository. The written observations below are the retained research record.

## Somnia language

- True black canvas with almost entirely white and gray content.
- Monospace-first typography, lowercase utility navigation, and a code-like brace wordmark.
- Large centered statements with severe negative space.
- Pixel/halftone fields act as the recognizable spatial motif.
- Flat rectangular controls and hairline dividers; almost no decorative surface elevation.
- The result feels computational and agentic rather than conventionally “Web3 neon.”

## DreamDEX marketing language

- Preserves Somnia's black, monospace, brace-mark DNA.
- Adds violet `#6e6eed` as the primary action/selection color.
- Uses a live price ticker immediately below a 72px header.
- Makes a simulated order lifecycle/order book the hero artifact, so product behavior is the visual identity.
- Uses green for positive/buy states and magenta-red for negative/sell states.
- Favors oversized section typography, technical grids, numbered annotations, settlement feeds, and sharp panel geometry.

## DreamDEX terminal language

- A dense exchange shell: approximately 68px header, main workspace, fixed 288px operational panel, and 36px footer.
- True black page, `#0a0a0a`/`#141414` working surfaces, and `#1c1c1c`/`#262626` dividers.
- Public tokens expose `#f5f5f5` headings, `#d3d3d3` body text, `#999999` muted text, `#6e6eed` action, `#00fa89` success, `#dc0b4a` error, and `#ff7a00` warning.
- Geist supports dense product text and numbers; Source Code Pro supports the ecosystem's terminal/brand voice.
- The UI is organized as open work regions, tab rows, tables, resizable dividers, and a fixed order panel—not floating cards.
- Compact 4–6px radii and 1px lines dominate. Color communicates state rather than decorating the background.

## Why ClaimRail V1 failed

- Navy `#071426` shifted the product away from the ecosystem's true-black identity.
- The neutral sans-serif and large title created a generic fintech dashboard tone.
- The prominent summary card and generous rounded frames weakened the exchange-terminal skeleton.
- Blue and mint dominated while DreamDEX's actual violet/green/magenta/orange state language was absent.
- The rail metaphor was mostly decorative; it did not read like an operational on-chain instrument.

## Initial ClaimRail translation (rejected V2)

ClaimRail should look like a settlement workstation that could sit beside DreamDEX without pretending to be DreamDEX itself.

- Distinct brand mark: `{c} claimrail` rather than copying `{d} dreamdex`.
- Primary artifact: an edge-to-edge settlement ledger with lifecycle traces, oracle evidence, claim values, and compact actions.
- DreamDEX-like fixed right panel becomes an operational `claim queue`, then a `review claim` transaction planner.
- Somnia's halftone motif appears only in low-information space as a restrained ecosystem cue.
- A live chain/indexer strip replaces generic dashboard decoration.
- All protocol-risk copy is visible, especially the module-wide ERC-6909 operator approval.
- The experience remains read-only until the owner explicitly signs approval/redemption.

That translation was subsequently judged too literal. The brace-derived mark, fixed right panel, ticker/header skeleton, violet-primary hierarchy, and halftone cue are not part of the active direction.

## Originality correction (V3)

V3 keeps only generic, functional ecosystem compatibility: a dark technical atmosphere, compact evidence tables, familiar financial state colors, monospace technical data, and clear DreamDEX/Somnia provenance.

ClaimRail now owns a separate visual and interaction language:

- A rail-and-checkpoint mark with no braces and no Somnia/DreamDEX logo geometry.
- A horizontal lifecycle rail—`open`, `locked`, `resolved`, `ready`—as the primary information architecture.
- A full-width settlement ledger instead of a DreamDEX-like fixed operational sidebar.
- A docked bottom claim tray that expands upward into a transaction plan instead of behaving like an exchange order panel.
- Signal lime and warm white for ClaimRail actions; violet only identifies DreamDEX protocol provenance.
- IBM Plex Mono/Manrope character rather than copying the Source Code Pro/Geist pairing.
- Linear track sleepers and checkpoint nodes instead of Somnia's pixel-halftone fields.
- Explicit `independent interface` attribution so the product cannot be mistaken for an official DreamDEX surface.

## VibeCurb inspection

Context7 documents `list` and `add` examples from the repository, but the published npm package inspected here is a small interactive installer. Its `index.js` presents five checkbox choices and copies selected skill files into `.agents/skills/`; it does not modify application source.

Only `imagegen-frontend` was installed. Its useful effect was prompt discipline: commit to one concept spine, one tight palette, explicit typography, a clear primary artifact, implementation-ready geometry, and a strong “what this is not” section. It did not generate or rewrite code.

## Decision checkpoint

V1 and V2 are superseded. The user approved the original V3 rail-control concepts on 2026-09-03; they are now the active implementation reference.
