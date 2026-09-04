# Canonical event playground fidelity ledger

Reference: [`concepts/delivery-console-v1.png`](concepts/delivery-console-v1.png), interpreted through
the approved [`claimrail-original-direction-v3.md`](claimrail-original-direction-v3.md) system.

The playground is a new developer workflow, so the delivery-console concept supplies its visual
system and application skeleton rather than exact page copy. Browser renders were compared at
`1536×1024` and `390×844` using Playwright screenshots and `view_image`.

| Comparison point    | Reference evidence                                                                   | Render evidence                                                                                                                             | Result  |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| App skeleton        | Quiet global header, compact operational header, ledger/workbench, fixed status edge | The playground retains the same four-level sequence and full-width bordered canvas                                                          | Matched |
| Palette             | Near-black page, lime active state, violet protocol/provenance, thin gray rules      | Lime is limited to selection/action/valid state; violet is limited to the Shannon replay banner and navigation                              | Matched |
| Typography          | Monospaced operational chrome with compact labels and readable payload code          | Headings, facts, inputs, buttons, and raw JSON all use the established explicit mono scale                                                  | Matched |
| Container model     | Open table/inspector regions separated by 1px rules; no rounded card grid            | Event rail, explanation, body editor, and verifier are one contiguous workbench                                                             | Matched |
| State communication | Square signals pair color with text; selected rows receive a left rule               | Every sample includes a text type/source, and valid/invalid verification includes text plus a square signal                                 | Matched |
| Responsive behavior | Dense desktop regions collapse into readable mobile sections                         | Summary, stream, explanation, raw body, and verifier stack in workflow order without horizontal page overflow                               | Matched |
| Trust copy          | Fixtures and permissions cannot be mistaken for live financial behavior              | The violet banner says the samples are derived from verified Shannon evidence and are not live delivery; the secret is explicitly demo-only | Matched |

Material mismatch fixed during QA: the initial status originally asked users to generate an
envelope even though server rendering had already supplied a signed sample. It now states that the
sample is ready but unverified.

Intentional difference: the reference's delivery-attempt timeline becomes a raw-body verifier. That
is the core playground task; it retains the same inspector density and bordered column family
without inventing a separate visual language.

Above-the-fold copy is limited to the page purpose, the three protocol facts, the link back to
delivery operations, and the mandatory fixture disclosure. No marketing claims, fake live status,
or affiliation language was added. No fixable visual mismatch remains after desktop/mobile review.
