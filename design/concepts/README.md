# ClaimRail interface concepts

These concepts were generated with the built-in image-generation tool on 2026-09-03. They are design specifications, not production UI assets and must never be embedded as screenshots in the application.

## Approved V3 concepts

- `settlement-rail-control-v3.png` (`1536×1024`): complete wallet settlement inbox organized by an original lifecycle rail and full-width ledger.
- `claim-tray-expanded-v3.png` (`1536×1024`): the same inbox with ClaimRail's bottom claim tray expanded into the first-time approval and redemption plan.
- `settlement-evidence-v3.png` (`1536×1024`): a coordinated evidence ladder and compact proof list for a finalized Event Contract.
- `mobile-settlement-inbox-v3.png` (`1537×1023`): the settlement inbox translated to a narrow mobile viewport while preserving the rail and ledger hierarchy.
- `mobile-claim-tray-expanded-v3.png` (`852×1846`): the scrollable mobile claim-plan tray with approval scope and custody language.
- `delivery-console-v1.png` (`1536×1024`): compact developer operations ledger with delivery-state totals, attempt timeline, canonical payload inspection, and dead-letter replay.

The user approved these concepts on 2026-09-03. Together with `../claimrail-original-direction-v3.md`, they are the active implementation reference.

## Research-only V2 concepts

- `settlement-inbox-terminal-v2.png`
- `claim-review-terminal-v2.png`

V2 translated the inspected ecosystem styling too literally: a brace-derived mark, DreamDEX-like header/ticker/right-panel skeleton, violet primary actions, and a Somnia-adjacent halftone motif. It is retained only as design-decision history and must not be shipped or used as the implementation reference.

## Superseded V1 concepts

- `settlement-inbox-desktop.png`
- `claim-review-desktop.png`

The user rejected their navy, generic financial-dashboard direction on 2026-09-03. Do not implement them.

The first claim-review generation was rejected because it invented a sidebar and changed the navigation model. It is intentionally not retained here.

## V3 prompt intent

The V3 prompts requested a settlement control board with an original rail/checkpoint mark, a horizontal lifecycle rail, a full-width evidence ledger, and a bottom claim tray that expands upward for review. Coordinated extraction prompts requested a six-step evidence ladder and responsive mobile translations without changing the product hierarchy. ClaimRail uses signal lime and warm white for its own actions; DreamDEX violet is limited to protocol provenance. The prompts prohibit brace marks, ticker strips, right trading panels, halftone blobs, violet-dominant styling, gradients, glass, generic fintech cards, bento layouts, marketing heroes, and fake transaction success.

## Implementation boundary

All labels, values, rows, controls, and status indicators must be recreated as accessible code-native components. The generated images define visual composition only.
