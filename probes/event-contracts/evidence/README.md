# Canonical Phase 0 captures

Generated JSON runs under `runs/` are local evidence and are ignored by git because they are timestamped and can become large. The table below identifies the captures currently used by the ClaimRail research documents.

| Run | Fixture | What it proves |
| --- | --- | --- |
| `2026-09-03T10-23-22-587Z` | Finalized market `0x…12222` | Market resolution, pool finalization, settlement finalization, module finalization, payout vector, oracle price, and dual Resolved/Finalized state |
| `2026-09-03T10-24-32-078Z` | Redeemed market `0x…121ed` | Paying winner redemption, zero-payout loser redemption, and remaining settlement backing |
| `2026-09-03T10-25-56-981Z` | Active public wallet | 98 indexed positions matched direct ERC-6909 balances; read-only address monitoring |
| `2026-09-03T10-29-15-580Z` | Winning public wallet | Eight finalized positions and two claimable winners with matching on-chain balances |
| `2026-09-03T10-33-02-055Z` | Voided market `0x…10dcd` | Numeric Voided state, `isVoided` without `isResolved`, uniform payout vector, oracle void reason, and final settlement |
| `2026-09-03T10-34-44-587Z` | Voided public wallet | Both sides of one uniform void independently pass all claimability checks at one-half payout |

Read-only redemption simulations are stored separately under `simulations/`. The canonical run is:

| Run | Fixture | What it proves |
| --- | --- | --- |
| `2026-09-03T10-55-46-125Z` | Redemption simulations against live public state | `redeemMany` success/reverts, cumulative duplicates, mixed winner/loser behavior, 10/50/100-entry gas samples, plus `redeemFor` expired-deadline and invalid-signature rejection |

Position-pagination captures are stored under `pagination/`:

| Run | Fixture | What it proves |
| --- | --- | --- |
| `2026-09-03T11-01-20-846Z` | Public wallet with 1,044 positive outcome balances | Eleven ordered `limit: 100`/`offset` pages returned 1,044 unique rows with no duplicate IDs; the SDK portfolio's fixed 200-row query is not exhaustive for this wallet |

The earliest exploratory runs are retained locally but are not canonical because the probe was subsequently improved to:

- deduplicate status counts;
- take an event head after state reads;
- filter recycled-pool events by nonce;
- decode the deployed settlement-finalization selector;
- bound old-market and wallet event scans;
- explicitly close the SDK’s underlying WebSocket transport.

See [`../README.md`](../README.md) for commands and safety boundaries and [`../../../context/claimrail-phase0-evidence.md`](../../../context/claimrail-phase0-evidence.md) for interpreted findings.
