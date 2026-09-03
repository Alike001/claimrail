# ADR 0003: Versioned DreamDEX adapter and no ClaimRail smart contract

Status: accepted for the first useful release

## Context

DreamDEX already exposes market settlement, ERC-6909 positions, `redeemMany`, and authorized `redeemFor`. Live research found SDK/indexer caps and an event ABI mismatch, but no missing protocol primitive that requires a new contract.

## Decision

Pin the DreamDEX SDK inside `packages/dreamdex`, supplement it with direct indexer/viem reads and deployed ABI overrides, and expose only ClaimRail domain records to the rest of the workspace. Deploy no ClaimRail contract for the first product.

## Consequences

- ClaimRail remains neutral infrastructure rather than a new custody surface.
- SDK upgrades require adapter regression tests against captured and live evidence.
- Product code cannot import the DreamDEX SDK directly.
- Optional auto-claim uses DreamDEX's existing EIP-712 authorization and relayer path.
