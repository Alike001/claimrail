# DreamDEX fixtures

Fixtures under `live/` are immutable copies of public Shannon testnet evidence captured by the read-only probes. They contain no private keys, signatures, credentials, or private API data.

Synthetic fixtures must live under a separate `synthetic/` directory and identify the unobserved branch they exercise. Production services must never import this directory.

See `manifest.json` for the exact source run, capture time, observed chain head, SDK version, evidence classification, and checksum. The pagination-only capture records a null head block explicitly because that probe queried the indexer without sampling the RPC head.

Run `pnpm test` from the workspace root to parse every fixture and verify its SHA-256 checksum before using it in tests.
