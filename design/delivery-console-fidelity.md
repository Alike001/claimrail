# Developer delivery console fidelity ledger

Reference: `concepts/delivery-console-v1.png`. Implementation:
`apps/web/app/developers/deliveries/page.tsx` and
`apps/web/src/components/delivery-console.tsx`.

The concept is composition guidance. Every shipped value and control is code-native; the generated
image is never embedded in the product.

## Concept-to-implementation comparison

1. **Operational hierarchy** — Both open with the compact developer-console identity and four
   route/delivery totals, then move directly into the ledger. The implementation uses real summary
   counts from the authenticated owner response.
2. **Ledger density** — Both use a full-width, border-led table with event, owner, endpoint, status,
   attempts, time, and inspection controls. The implementation uses only ClaimRail's canonical event
   vocabulary instead of the fictional settlement labels generated in the concept.
3. **Selected failure** — Both keep the dead delivery visibly selected with a restrained red rail
   and reveal its evidence below the table. The implementation preserves browser semantics with a
   real table and buttons.
4. **Attempt evidence** — Both show newest-first attempt checkpoints, HTTP status, timing, and final
   dead-letter state. The implementation displays only captured transport metadata and never
   fabricates response headers or bodies that the worker does not retain.
5. **Canonical payload and replay** — Both end with the exact event JSON and a replay action. The
   implementation enables the action only for an owner-authenticated dead delivery; fixture replay
   is visibly disabled.

## Copy changes

- Replaced generated `settlement.*` labels with the canonical event names implemented by ClaimRail,
  such as `wallet.claimable`, `market.finalized`, `market.voided`, `claim.confirmed`, and
  `claim.failed`.
- Changed “replay delivery” to “replay dead letter” so the terminal-state requirement is explicit.
- Added “15-minute access · no gas · no financial authority” to explain the wallet signature before
  it is requested.
- Added a prominent development-only fixture banner so screenshots cannot be mistaken for live
  operational data.

## Intentional deviations

- The concept's route, endpoint, event, and status dropdown strip was reduced to state tabs for the
  current dataset. Server-side pagination and compound filtering should arrive together rather than
  shipping ornamental controls.
- Raw receiver response bodies and headers are not displayed because ClaimRail currently stores
  status, safe error text, request timestamp, provider ID, and signature version—not arbitrary
  potentially sensitive receiver content.
- The production screen begins behind wallet proof instead of exposing example rows. The complete
  layout is reachable only through the visibly labelled development fixture.
- Mobile stacks the inspector panels vertically and keeps the wide delivery ledger horizontally
  scrollable, preserving density without collapsing evidence into cards.

## Visual verification

The implementation was captured with Playwright's Chromium screenshot command at `1536×1024` and
`390×844`, then inspected alongside the original concept with the local image viewer. Playwright was
used because no in-app browser capture surface was available in this environment. The desktop pass
confirmed hierarchy, density, selected-state contrast, four-panel evidence flow, and replay
placement. The mobile pass confirmed the two-by-two summary, scrollable ledger, vertical inspector,
payload containment, and operable navigation.
