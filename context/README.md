# Somnia and dreamDEX repository context

This folder records a current-reality snapshot of the public
[`somnia-chain`](https://github.com/somnia-chain) GitHub organization and a deeper
inspection of [`somnia-chain/dreamdex-bot-kit`](https://github.com/somnia-chain/dreamdex-bot-kit).

Snapshot date: **2026-09-03** (`Africa/Lagos`). Repository metadata, open issues,
dependencies, endpoints, addresses, and supported markets can change after this date.

## Files

- [`somnia-chain-organization.md`](somnia-chain-organization.md) — public repository inventory,
  the role of each repository, ecosystem relationships, inferences, and unknowns.
- [`dreamdex-bot-kit.md`](dreamdex-bot-kit.md) — architecture, packages, strategies,
  execution paths, network configuration, verification results, security boundaries,
  known sharp edges, and unresolved questions for the bot kit.
- [`claimrail-reverse-engineering.md`](claimrail-reverse-engineering.md) — Event Contract,
  SDK, contract ABI, Bot Kit, competitor, and cross-ecosystem findings, with facts separated
  from product inferences and open testnet questions.
- [`claimrail-product-plan.md`](claimrail-product-plan.md) — layman product model, technical
  architecture, API/events, claim planner, security boundaries, phased build sequence, tests,
  demo, and judging fit.
- [`claimrail-phase0-evidence.md`](claimrail-phase0-evidence.md) — reproducible live-testnet
  observations, protocol/SDK mismatches, claim fixtures, proven behavior, and remaining tests.
- [`claimrail-dreamdex-protocol-reference.md`](claimrail-dreamdex-protocol-reference.md) — exact
  market, position, lifecycle, resolution, redemption, event, SDK, and normalized ClaimRail fields;
  source content for the future developer documentation page.
- [`claimrail-frontend-blueprint.md`](claimrail-frontend-blueprint.md) — trader inbox, settlement
  evidence, claim review, receipts, notifications, developer console, docs, and required UI states.
- [`../probes/event-contracts/README.md`](../probes/event-contracts/README.md) — isolated read-only
  evidence collector for DreamDEX indexer, contracts, events, oracle data, and wallet positions.
- [`../.thoughts/specs/2026-09-03-claimrail.md`](../.thoughts/specs/2026-09-03-claimrail.md) —
  implementation-ready product requirements, acceptance criteria, constraints, and open questions
  derived from the protocol evidence.
- [`../.thoughts/quality/2026-09-03-project-quality-profile.md`](../.thoughts/quality/2026-09-03-project-quality-profile.md) —
  proposed stack, local/CI checks, coverage, file-size, security, and commit-quality gates.
- [`../.thoughts/plans/2026-09-03-claimrail-implementation.md`](../.thoughts/plans/2026-09-03-claimrail-implementation.md) —
  phased implementation plan tracing real integrations, fixture policy, checks, acceptance criteria,
  and stop conditions from workspace setup through frontend, claims, notifications, docs, and audit.
- [`../research/reference-repos/README.md`](../research/reference-repos/README.md) — cloned
  open-source reference repository manifest with pinned commits and license cautions.

## Evidence standard

The briefs separate:

- **Verified facts** — supported by GitHub metadata, repository files, or commands run against
  the pinned commit.
- **Inferences** — interpretations that fit the evidence but are not explicit project claims.
- **Unknowns and questions** — points the public repositories do not settle.

No private repositories, private documentation, production credentials, or private API data were
accessed. This context is not a security audit, investment analysis, or trading recommendation.
