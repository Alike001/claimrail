# Reality Research: `somnia-chain/dreamdex-bot-kit`

## Scope

This brief answers: **What is in the current DreamDEX Bot Kit, how does it interact with DreamDEX
and Somnia, what is verified to work at repository level, and where are its explicit boundaries?**
The inspection is pinned to commit
[`48f3802f81169a64dd5048362d0ddfa59af56da7`](https://github.com/somnia-chain/dreamdex-bot-kit/commit/48f3802f81169a64dd5048362d0ddfa59af56da7)
on the `main` branch, authored on 2026-09-02.

## Sources Checked

- Repository [README](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/README.md),
  [root package manifest](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/package.json),
  full file tree, Git history, branches, issues, pull requests, contributors, releases, and Actions.
- Architecture and operations documentation: [architecture](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/docs/architecture.md),
  [getting started](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/docs/getting-started.md),
  [gotchas](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/docs/gotchas.md), and
  [session keys](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/docs/session-keys.md).
- Core source: [exports](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/packages/core/src/index.ts),
  [network configuration](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/packages/core/src/config/networks.ts),
  [market configuration](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/packages/core/src/config/tokens.ts),
  [`Pool`](https://github.com/somnia-chain/dreamdex-bot-kit/blob/48f3802f81169a64dd5048362d0ddfa59af56da7/packages/core/src/pool.ts),
  and package manifests.
- Every strategy README, all test files, the repository consistency checker, CI workflow, the
  Python core, event-contract core, backtester, advanced EIP-7702 demo, and edge-analytics tool.
- Context7's current index for `/somnia-chain/dreamdex-bot-kit`, queried with the full research
  question after resolving the library ID.
- Local verification in a clean shallow clone at the pinned commit:
  `npm ci`, `npm test`, `npm run typecheck`, `npm run check`,
  `npm audit --json`, and `npm audit --omit=dev --json`.

## Verified Facts

### Identity and repository status

- GitHub describes the repository as tooling to build automated bots on DreamDEX's Somnia-based
  on-chain CLOB. It was created on **2026-07-07** and is MIT-licensed.
- The root manifest is version `0.1.0`, requires Node `>=20`, and is marked `private: true`.
  Consequently, the monorepo root is not configured for direct npm publication.
- GitHub had no repository releases at the snapshot. The latest `main` commit and its associated
  GitHub Actions run both passed CI.
- The language breakdown reported by GitHub was dominated by TypeScript, followed by JavaScript,
  Python, Solidity, and Dockerfile content.

### Repository layout

| Path | Verified contents and role |
| --- | --- |
| `packages/core` | TypeScript client for Viem-based chain access, REST, WebSocket, contract reads/writes, quantization, preflight guards, nonce management, operators, yield, and status reporting |
| `packages/core-py` | Python mirror built on `web3`, `eth-account`, and `python-dotenv` |
| `packages/backtest` | Bar-by-bar simulator with synthetic/hybrid books, fill and queue models, ledger, candle loading, markout, metrics, and report export |
| `packages/ec-core` | Shared event-contract layer using `@somnia-chain/markets-sdk ^0.28.1` |
| `strategies/` | Fifteen runnable strategy workspaces: nine spot-oriented and six event-contract-oriented |
| `examples/` | Eight sanitized competition/reference bots in JavaScript, TypeScript, and Python; several explicitly require modernization before current mainnet use |
| `advanced/batch-7702` | EIP-7702 transaction-batching technique demo, not a trading strategy |
| `tools/edge-analytics` | Offline analysis of captured spread, adverse selection, markout, and transactions per fill |
| `scripts/` | Quickstart, setup doctor, operator setup, cleanup, IOC lifecycle check, backtest entrypoint, Railway launcher, and event-contract verification scripts |
| `skills/` | Agent Skills containing Somnia network context and DreamDEX bot-development context |

The root npm workspaces include `packages/*`, `strategies/*`, and `advanced/*`. The root build script
builds the TypeScript core and backtest packages; the broader typecheck script checks every
workspace that defines `typecheck`.

### Execution architecture

The repository documents three order-submission paths:

1. **Direct contract:** sign and broadcast `SpotPool.placeOrder` calls directly. `packages/core`
   uses this path for control and latency.
2. **HTTP prepare:** ask DreamDEX REST to construct an unsigned transaction, then sign and
   broadcast it locally.
3. **Official CLI:** invoke the separate Go `dreamdex` CLI, which handles signing/broadcasting.

The TypeScript strategy path is layered as follows:

```text
strategy signal and sizing
        ↓
Pool human-unit API
        ↓
tick/lot quantization + gotcha guards
        ↓
determine auto-pull input and allowance/native value
        ↓
simulate transaction
        ↓
sign and broadcast
        ↓
verify receipt and OrderPlaced event
```

The code separates data sources by purpose:

- On-chain reads are treated as canonical for price-sensitive book state, balances, open orders,
  and fill events.
- WebSocket is used for low-latency pushed book/trade updates and includes reconnect handling.
- REST is used for snapshots, authentication, and transaction preparation, but the repository
  warns that REST order books and trade feeds can lag or stall.

### Core API surface

`@dreamdex-bot-kit/core` re-exports environment loading, networks, token/market configuration,
chain client creation, REST and WebSocket clients, contracts, execution, operators, `Pool`, nonce
management, gotcha guards, quantization, yield helpers, and status helpers.

The main strategy-facing abstraction is `Pool`:

- `Pool.load(ctx, symbol)` loads static market metadata and then reads live pool parameters.
- `topOfBook()` reads bid and ask levels on-chain and returns human-unit bid, ask, and midpoint.
- `place()` converts human price/quantity into integer units, aligns them to tick and lot sizes,
  creates a future nanosecond expiry, and selects owner or operator execution.
- `cancel()`, `openOrderIds()`, `vaultBase()`, and `walletBase()` expose order and inventory state.

Order types are `Normal`/GTC (`0`), Fill-or-Kill (`1`), Immediate-or-Cancel (`2`), and PostOnly
(`3`). `Pool.place()` defaults to Immediate-or-Cancel unless the caller supplies another type.

### Networks and markets encoded at the pinned commit

| Network | Chain ID | Native token | Default RPC | DreamDEX REST |
| --- | ---: | --- | --- | --- |
| Somnia mainnet | `5031` | SOMI | `https://api.infra.mainnet.somnia.network` | `https://api.dreamdex.io/v0` |
| Shannon testnet | `50312` | STT | `https://dream-rpc.somnia.network` | `https://stg.api.dreamdex.io/v0` |

Static market convenience data contained:

- Mainnet: `SOMI:USDso`, `USDC.e:USDso`, `WBTC:USDso`, `WETH:USDso`.
- Testnet: `SOMI:USDso`, `WBTC:USDso`, `WETH:USDso`.

The source itself says the runtime `/v0/markets` endpoint and on-chain `getPoolParams()` are the
canonical sources; these hard-coded entries are conveniences and can become stale. USDso is encoded
as an 18-decimal quote asset. Native SOMI uses a sentinel address where a token-address-shaped value
is required.

### Funding and key boundaries

- The post-June-2026 `placeOrder` path defaults to **wallet auto-pull and auto-delivery**. The core
  determines the input token, manages ERC-20 allowance when required, supplies native `msg.value`
  for SOMI inputs, and sends proceeds back to the wallet.
- Manual vault mode remains available for market makers that intentionally pre-fund a pool vault.
- Session-key mode separates a cold fund/owner key from a hot operator key. The documented grant
  lets the operator place and cancel for the owner while withdrawals remain owner-scoped. Grants
  are per function selector and can be per-pool or global.
- Core configuration reads a raw `PRIVATE_KEY` from environment variables. The documentation
  recommends an encrypted keystore for real funds, a dedicated bot wallet, and testnet first.
- Strategy templates default to `DRY_RUN=true`. The core network selector defaults to testnet when
  `NETWORK` is absent.

### Included strategies

#### Spot-oriented workspaces

| Strategy | Implemented behavior |
| --- | --- |
| `starter` | Minimal two-sided maker template centered on one editable `decide()` function |
| `market-making` | Two-sided PostOnly quotes, inventory skew, and drift-based requoting; TypeScript and Python variants |
| `grid` | FIFO lot grid that buys below an anchor and sells above entry, with maker/taker switching and risk guards |
| `momentum` | Long-only trend-following taker using window momentum, breakout, take-profit, and stop-loss |
| `mean-reversion` | Long-only contrarian taker using RSI and Bollinger Bands plus exit/risk thresholds |
| `twap` | Execution algorithm that splits a target buy/sell into timed IOC slices with a slippage bound |
| `ensemble` | Momentum, mean-reversion, and grid analyzers fused by majority vote or an optional OpenAI-compatible LLM, then passed through a risk gate |
| `treasury` | Deploys eligible idle USDso as two-sided PostOnly liquidity and supports cancel/flatten modes |
| `yield-optimizer` | Places proximity-weighted maker quotes around the midpoint, with inventory/volatility adjustment and operational kill switches |

#### Event-contract workspaces

| Strategy | Implemented behavior |
| --- | --- |
| `ec-starter` | Walks live Up/Down windows, checks on-chain lifecycle state, seeds paired inventory, and crosses a quote |
| `ec-maker` | Symmetric two-sided PostOnly quoting on live event windows |
| `ec-passive` | Rests a post-only bid for a selected side at a configured probability and follows market rolls |
| `ec-laddering-bot` | Rests a probability ladder around the YES midpoint and flattens before expiry |
| `ec-oracle-follow` | Models YES/NO direction from BTC/ETH price, settlement level, time, and measured volatility, then crosses only when its modeled edge threshold is met |
| `ec-settlement` | Watches lifecycle state and claims resolved or voided positions |

The repository's own consistency checker counted and documented all 15 strategy directories.

### Verification results on 2026-09-03

| Check | Result |
| --- | --- |
| `npm ci` | Passed; postinstall built `core` and `backtest` |
| `npm test` | Passed: 49 tests across 7 test files (45 backtest tests and 4 event-core tests) |
| `npm run typecheck` | Passed for core packages, all 15 strategies, and `batch-7702` |
| `npm run check` | Passed all 10 repository consistency checks |
| Latest `main` GitHub Actions run | Passed at commit `48f3802f` |

These results verify repository-level compilation, selected unit tests, and internal consistency.
They do not verify live trading profitability, every Python example, every network path, or smart
contract correctness.

### Dependency audit snapshot

- `npm ci` reported **10 advisories** in the full workspace dependency graph: 1 low, 3 moderate,
  5 high, and 1 critical.
- `npm audit --omit=dev` reported **4 advisories**: 1 low and 3 high. The reported production graph
  involved `solc` → `tmp` in the advanced batching workspace and `viem` → `ws` in the shared graph.
- The full graph additionally reported development-tool findings through Vitest/Vite/esbuild and
  a `nanoid` finding.
- An open Dependabot pull request, [#5](https://github.com/somnia-chain/dreamdex-bot-kit/pull/5),
  proposed bumping `ws` and `viem` at the snapshot.

This is an advisory inventory, not an exploitability assessment. No reachability or runtime-impact
analysis was performed.

### Explicitly documented sharp edges

- The June-2026 spot upgrade removed `placeTakerOrderWithoutVault`; current code uses the payable
  `placeOrder` entrypoint.
- Expiry must be a future nanosecond timestamp; zero does not mean “never expires.”
- A zero price is a literal zero-priced limit and does not create a market order.
- Native SOMI delivery paths can require a transaction gas limit of at least 5,000,000, and
  simulation must use the same gas limit as broadcast.
- Price and quantity must respect live tick size, lot size, and minimum quantity.
- A mined transaction can still encode `success=false`; the core simulates before send and checks
  the post-mine event.
- The `OrderFilled` event signature changed in the June upgrade; the core pins the current topic.
- USDso uses 18 decimals, not the common USDC assumption of 6.
- Mainnet supports builder codes, but this kit deliberately submits untagged orders with zero
  builder fee.
- REST data can be stale relative to the on-chain book and fill events.

### Public issue-state discrepancy

- GitHub listed two open issues: [#23, add perpetual strategies](https://github.com/somnia-chain/dreamdex-bot-kit/issues/23),
  and [#7, owner-scoped reads in session-key mode](https://github.com/somnia-chain/dreamdex-bot-kit/issues/7).
- GitHub also listed [PR #8](https://github.com/somnia-chain/dreamdex-bot-kit/pull/8) for issue #7
  as open.
- However, the pinned `Pool` source already defines an owner-aware `subject` and uses it for open
  orders, vault balance, and wallet balance. The public issue/PR state and current `main` source are
  therefore not aligned on their face; this research does not establish why.

## Inferences

- The repository is best understood as an **educational and operational reference kit**, not a
  hosted trading service. Users supply keys, capital, infrastructure, and strategy parameters.
- Its architecture deliberately favors direct contract calls and on-chain verification while
  retaining REST, WebSocket, and CLI adapters for convenience and latency-sensitive observation.
- The `0.1.0` private monorepo status, absence of GitHub releases, recently changed protocol ABI,
  and numerous strategy additions indicate an actively evolving developer surface rather than a
  stable, versioned SDK contract.
- The safety posture is layered—testnet defaults, dry-run defaults, simulation, receipt checks,
  session keys, risk stops, CI, and dependency automation—but it does not remove key compromise,
  smart-contract, dependency, infrastructure, model, market, or strategy risk.

## Unknowns And Questions

- No public release or compatibility policy states which bot-kit commit should be paired with a
  particular DreamDEX contract deployment.
- The repository does not establish availability or latency guarantees for DreamDEX REST,
  WebSocket, RPC, indexer, oracle, or settlement services.
- It does not demonstrate that any included strategy is profitable after adverse selection, gas,
  slippage, inventory risk, and changing maker rewards.
- The dependency advisories were not evaluated for reachability in the shipped bot processes.
- The automated root test command does not cover every strategy, every Python implementation,
  every sanitized example, or live mainnet behavior.
- Perpetual strategies were requested in open issue #23 but were not present at the pinned commit.
- The reason issue #7 and PR #8 remain open despite owner-aware code on `main` is unknown.
- The DreamDEX smart contracts themselves are referenced through ABIs and addresses but are not
  implemented in this repository, so contract upgrade controls and full contract internals cannot
  be established from this codebase alone.

## Not Included

- No order was submitted, wallet connected, key loaded, token bridged, or live trading endpoint
  mutated.
- No security audit, penetration test, dependency remediation, or smart-contract verification was
  performed.
- No strategy was endorsed and no financial or investment recommendation is made.
- No fixes, architecture changes, or implementation plan are proposed in this reality brief.

