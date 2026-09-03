# Reality Research: `somnia-chain` GitHub organization

## Scope

This brief answers: **What does the public `somnia-chain` GitHub organization contain, what role
does each repository play in the Somnia/dreamDEX ecosystem, and what is not represented there?**
It covers the organization state visible on 2026-09-03 and does not evaluate token value or propose
technical changes.

## Sources Checked

- [`somnia-chain` organization](https://github.com/somnia-chain) and GitHub REST metadata,
  queried on 2026-09-03 with `gh api orgs/somnia-chain` and
  `gh api 'orgs/somnia-chain/repos?per_page=100&type=public'`.
- Repository metadata and recursive trees for all seven public repositories.
- [`agentathon` tree](https://github.com/somnia-chain/agentathon), including its
  [Agents examples](https://github.com/somnia-chain/agentathon/blob/main/somnia-agents-examples/README.md)
  and [Agent Skills](https://github.com/somnia-chain/agentathon/blob/main/somnia-agents-skills/README.md).
- [`dreamdex-bot-kit`](https://github.com/somnia-chain/dreamdex-bot-kit), inspected in depth in
  [`dreamdex-bot-kit.md`](dreamdex-bot-kit.md).
- [`somnia-data-streams-sdk` README](https://github.com/somnia-chain/somnia-data-streams-sdk/blob/main/README.md)
  and [`package.json`](https://github.com/somnia-chain/somnia-data-streams-sdk/blob/main/package.json).
- [`somnia-dex-cli` README](https://github.com/somnia-chain/somnia-dex-cli/blob/main/README.md),
  [`SKILL.md`](https://github.com/somnia-chain/somnia-dex-cli/blob/main/SKILL.md), and
  [`go.mod`](https://github.com/somnia-chain/somnia-dex-cli/blob/main/go.mod).
- [`token-list` README](https://github.com/somnia-chain/token-list/blob/main/README.md) and its
  canonical [`tokenlist.json`](https://github.com/somnia-chain/token-list/blob/main/tokenlist.json).
- Fork ancestry and comparisons against `ccxt/ccxt` and `DefiLlama/peggedassets-server`.

## Verified Facts

### Organization snapshot

- GitHub identifies the organization as **Somnia** and describes it as an EVM-compatible Layer 1
  organization. The GitHub organization was created on **2024-01-09**.
- It exposed **seven public repositories** on the snapshot date: five source repositories and two
  forks. None was marked archived.
- The five source repositories were MIT-licensed in GitHub metadata. The two forks retain their
  upstream histories and are discussed separately below.

### Public repository inventory

| Repository | Type | Observed role | Primary language | Last pushed at snapshot |
| --- | --- | --- | --- | --- |
| [`agentathon`](https://github.com/somnia-chain/agentathon) | Source | Somnia Agents examples plus Agent Skills for invoking JSON/API, LLM-inference, and website-extraction agents | TypeScript | 2026-08-05 |
| [`dreamdex-bot-kit`](https://github.com/somnia-chain/dreamdex-bot-kit) | Source | Shared DreamDEX clients, strategy templates, event-contract bots, backtesting, and operations material | TypeScript | 2026-09-02 |
| [`somnia-data-streams-sdk`](https://github.com/somnia-chain/somnia-data-streams-sdk) | Source | TypeScript SDK for on-chain data streams and off-chain reactive subscriptions | TypeScript | 2026-08-05 |
| [`somnia-dex-cli`](https://github.com/somnia-chain/somnia-dex-cli) | Source | Non-custodial DreamDEX command-line client with market, order, vault, streaming, and MCP commands | Go | 2026-08-05 |
| [`token-list`](https://github.com/somnia-chain/token-list) | Source | Canonical Somnia mainnet ERC-20 token metadata following the Uniswap token-list format | Data/assets | 2026-08-07 |
| [`ccxt`](https://github.com/somnia-chain/ccxt) | Fork | Fork of the upstream multi-exchange CCXT library | Python | 2026-08-24 |
| [`peggedassets-server`](https://github.com/somnia-chain/peggedassets-server) | Fork | Fork of DefiLlama's pegged-assets server | Not reported | 2026-08-05 |

“Last pushed” is GitHub's `pushed_at` field, not a statement that every push changed application
code or was released.

### `agentathon`

- The repository has no root README. Its tree contains two projects:
  `somnia-agents-examples` and `somnia-agents-skills`.
- The examples implement three documented agent patterns: a price oracle using a JSON API request,
  an LLM sentiment analyzer, and an LLM-assisted web-data extractor. Each has Solidity contracts
  and TypeScript deployment/invocation scripts.
- The skill package contains four knowledge skills and one invocation skill, plus ABIs, Solidity
  interfaces, agent IDs, prices, and mainnet/testnet network configuration.
- The documented request lifecycle is: a smart contract funds and submits a request, validators
  execute the selected agent, consensus is reached, and the platform calls the requesting
  contract back with the result.

### `somnia-data-streams-sdk`

- The npm package name in the repository is `@somnia-chain/streams`, version `0.12.2` at the
  snapshot.
- It is an ESM TypeScript SDK built with `tsup`. Its documented abstraction accepts a Viem public
  client for reads and an optional wallet client for writes.
- The README shows WebSocket subscriptions for off-chain reactivity and on-chain data/event
  emission that can trigger subscribers.
- The package declares `viem ~2.37.8` and `@somnia-chain/reactivity ~0.1.5` as peer dependencies.

### `somnia-dex-cli`

- The CLI is a Go module named `github.com/somnia-chain/somnia-dex-cli` and builds the `dreamdex`
  command.
- Its documented command surface covers market data, spot orders, stop orders, portfolio and
  wallet analytics, vault operations, WebSocket watching, mainnet/testnet selection, and JSON
  output.
- It includes a local stdio MCP server so an LLM-capable client can invoke DreamDEX operations as
  tools.
- Interactive key handling uses a Web3 Secret Storage keystore. The README also documents raw
  private-key environment variables for headless/CI operation, which bypass that keystore.

### `token-list`

- The list targets Somnia mainnet chain ID `5031` and follows the Uniswap Token List standard.
- At the snapshot it listed WSOMI, USDso, USDC.e, USDT, WETH, and WBTC.
- Native SOMI is intentionally absent because it is not an ERC-20; WSOMI represents wrapped SOMI.
- Contributions require verified mainnet contracts, checksummed addresses, token metadata, a logo,
  semantic versioning, and schema validation.

### The two forks

- `somnia-chain/ccxt` identifies `ccxt/ccxt` as both parent and source. GitHub's compare endpoint
  reported the fork **0 commits ahead** and **4,011 behind** upstream at the snapshot.
- `somnia-chain/peggedassets-server` identifies `DefiLlama/peggedassets-server` as parent and
  source. GitHub reported it **0 commits ahead** and **363 behind** upstream.
- Therefore, neither fork contained organization-specific commits relative to its upstream default
  branch at the time checked. Their presence alone is not evidence of a released Somnia or
  DreamDEX integration.

### Ecosystem relationship visible in the repositories

| Ecosystem concern | Public repository evidence |
| --- | --- |
| Somnia agent execution | `agentathon` examples and Agent Skills |
| Reactive data delivery | `somnia-data-streams-sdk` |
| DreamDEX interactive/agent CLI access | `somnia-dex-cli` |
| DreamDEX strategy development and testing | `dreamdex-bot-kit` |
| Mainnet token discovery metadata | `token-list` |
| Third-party integration staging | The two upstream forks, with no org-specific commits at snapshot |

## Inferences

- The public organization is primarily a **developer tooling, examples, and integration surface**.
  This inference comes from the five source repositories' contents; it is not a claim about what
  Somnia develops privately or in other organizations.
- dreamDEX has a substantial public developer footprint in this organization: both the Go CLI and
  the bot-kit monorepo directly target it, while the token list supplies assets used by its markets.
- “Agentic” appears in two related but distinct forms: Somnia Agents perform consensus-mediated
  compute jobs, while DreamDEX tooling lets autonomous software observe markets and submit trades.

## Unknowns And Questions

- The seven repositories do not include an identifiable Somnia validator/node implementation,
  MultiStream consensus implementation, IceDB implementation, explorer, bridge, or DreamDEX core
  smart-contract source repository. This research does not establish whether those sources are
  private, published under another organization, embedded elsewhere, or unavailable.
- The public repositories do not explain why the two unchanged upstream forks are retained or what
  future changes are intended for them.
- GitHub metadata does not establish production support guarantees, API service-level agreements,
  release policy, or long-term maintenance commitments.
- The organization snapshot will become stale as repositories are added, removed, renamed, made
  private, archived, or updated.

## Not Included

- No private organization repositories or internal documentation were accessed.
- No claim is made about Somnia's real-world throughput, decentralization, token economics, market
  adoption, or investment value.
- No security audit of Somnia, DreamDEX contracts, the CLI, or the SDKs was performed.
- No improvement proposal, architecture recommendation, or implementation plan is included.

