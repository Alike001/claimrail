import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SOMNIA_TESTNET_ADDRESSES,
  SomniaMarkets,
  binarySettlementAbi,
  marketKey,
  type BinaryMarket,
  type MarketOnchain,
  type SomniaMarketsClient,
} from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  getAddress,
  isAddress,
  parseAbi,
  type AbiEvent,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";

const DEFAULT_INDEXER_URL = "https://dev.smk.somnia.host/v1/graphql";
const DEFAULT_WS_RPC_URL = "wss://api.infra.testnet.somnia.network/ws";
const DEFAULT_RPC_URL = "https://api.infra.testnet.somnia.network";
const BLOCK_WINDOW = 1_000n;
const PAYOUT_DENOMINATOR = 10_000_000n;

const marketReadAbi = parseAbi([
  "function payoutNumerators() view returns (uint256[])",
  "function isResolved() view returns (bool)",
  "function isVoided() view returns (bool)",
  "function status() view returns (uint8)",
  "function voidPolicy() view returns (uint8)",
]);

const marketEvents = parseAbi([
  "event StatusChanged(uint8 indexed oldStatus, uint8 indexed newStatus)",
  "event Resolved(uint32 payoutDenominator, uint256[] payoutNumerators)",
  "event Voided()",
]);

const moduleEvents = parseAbi([
  "event MarketFinalized(bytes32 indexed marketId, address indexed pool, uint256 marketKey)",
  "event PoolReleased(bytes32 indexed marketId, address indexed pool, address indexed creator)",
]);

const poolEvents = parseAbi([
  "event PoolFinalized(uint64 indexed marketNonce, uint256 backing)",
  "event PoolRecycled(uint64 indexed marketNonce, address indexed market)",
]);

const settlementEvents = parseAbi([
  // The Shannon deployment emits the payout vector here. SDK 0.29.0 currently
  // declares the last field as uint8 winningOutcome, whose topic does not match
  // the deployed contract. Keep the live signature so evidence is not dropped.
  "event MarketFinalized(uint256 indexed marketKey, address indexed pool, uint64 nonce, address collateralToken, uint256 netBacking, bool voided, uint256[] payoutNumerators)",
  "event SettlementFeeCharged(uint256 indexed marketKey, address indexed feeRecipient, uint256 grossBacking, uint256 fee)",
  "event Redeemed(uint256 indexed marketKey, address indexed holder, address indexed to, uint8 outcomeIdx, uint256 amountBurned, uint256 collateralOut)",
]);

const walletSettlementEvents = parseAbi([
  "event PayoutOwed(address indexed owner, address indexed token, uint256 amount)",
  "event OwedClaimed(address indexed owner, address indexed token, uint256 amount)",
]);

const statusName: Record<number, string> = {
  0: "Listed",
  1: "Trading",
  2: "Locked",
  3: "Settling",
  4: "Resolved",
  5: "Voided",
};

type Attempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: { name: string; message: string } };

type CliOptions = {
  wallet?: Address;
  marketId?: Hex;
  markets: number;
  listLimit: number;
  walletEventLookback: bigint;
  terminalEventTail: bigint;
  verifyPositionLimit: number;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${value}`);
  }
  return parsed;
}

function parsePositiveBigInt(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback;
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`Expected a positive integer, received ${value}`);
  return parsed;
}

function bytes32(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function parseCli(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag?.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
    index += 1;
  }

  const walletRaw = values.get("--wallet") ?? process.env.WALLET_ADDRESS?.trim();
  if (walletRaw && !isAddress(walletRaw)) throw new Error(`Invalid wallet address: ${walletRaw}`);

  const marketRaw = values.get("--market");
  if (marketRaw && !bytes32(marketRaw)) throw new Error(`Invalid bytes32 market id: ${marketRaw}`);

  const options: CliOptions = {
    markets: parsePositiveInt(values.get("--markets"), 6),
    listLimit: parsePositiveInt(values.get("--list-limit"), 60),
    walletEventLookback: parsePositiveBigInt(values.get("--wallet-event-lookback"), 100_000n),
    terminalEventTail: parsePositiveBigInt(values.get("--terminal-event-tail"), 10_000n),
    verifyPositionLimit: parsePositiveInt(values.get("--verify-position-limit"), 200),
  };
  if (walletRaw) options.wallet = getAddress(walletRaw);
  if (marketRaw) options.marketId = marketRaw as Hex;
  return options;
}

function errorRecord(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: String(error) };
}

async function attempt<T>(operation: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: errorRecord(error) };
  }
}

function json(value: unknown): string {
  return `${JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (typeof item === "bigint") return item.toString();
      if (item instanceof Map) return Object.fromEntries(item);
      return item;
    },
    2,
  )}\n`;
}

async function save(directory: string, filename: string, value: unknown): Promise<void> {
  await writeFile(resolve(directory, filename), json(value), "utf8");
}

function eventName(event: AbiEvent): string {
  return event.name;
}

async function logsInWindows(
  publicClient: PublicClient,
  address: Address,
  event: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint,
  args?: Record<string, unknown>,
): Promise<Log[]> {
  const logs: Log[] = [];
  for (let start = fromBlock; start <= toBlock; start += BLOCK_WINDOW) {
    const end = start + BLOCK_WINDOW - 1n > toBlock ? toBlock : start + BLOCK_WINDOW - 1n;
    const page = await publicClient.getLogs({
      address,
      event,
      ...(args ? { args } : {}),
      fromBlock: start,
      toBlock: end,
    } as never);
    logs.push(...page);
  }
  return logs;
}

async function collectEventGroup(
  publicClient: PublicClient,
  address: Address,
  events: readonly AbiEvent[],
  fromBlock: bigint,
  toBlock: bigint,
  argsFor?: (event: AbiEvent) => Record<string, unknown> | undefined,
): Promise<Record<string, Attempt<Log[]>>> {
  const entries = await Promise.all(
    events.map(async (event) => [
      eventName(event),
      await attempt(() => logsInWindows(publicClient, address, event, fromBlock, toBlock, argsFor?.(event))),
    ] as const),
  );
  return Object.fromEntries(entries);
}

function distinctMarkets(markets: BinaryMarket[], limit: number): BinaryMarket[] {
  const byId = new Map<string, BinaryMarket>();
  for (const market of markets) {
    if (!byId.has(market.marketId.toLowerCase())) byId.set(market.marketId.toLowerCase(), market);
  }

  const all = [...byId.values()];
  const selected: BinaryMarket[] = [];
  const seenStatuses = new Set<string>();
  for (const market of all) {
    if (!seenStatuses.has(market.status)) {
      selected.push(market);
      seenStatuses.add(market.status);
    }
    if (selected.length >= limit) return selected;
  }
  for (const market of all) {
    if (!selected.some((chosen) => chosen.marketId === market.marketId)) selected.push(market);
    if (selected.length >= limit) break;
  }
  return selected;
}

async function collectMarket(
  client: SomniaMarketsClient,
  market: BinaryMarket,
  terminalEventTail: bigint,
): Promise<Record<string, unknown>> {
  const publicClient = client.getViemClient();
  const onchainResult = await attempt(() => client.getMarketOnchain(market.marketId));
  const resolution = await attempt(() => client.getMarketResolution(market.marketId));
  const onchainResolutionPrice = await attempt(() => client.getOnchainResolutionPrice(market.marketId));
  const statusHistory = await attempt(() => client.getMarketStatusHistory(market.marketId));
  const fromBlock = BigInt(market.createdAtBlock);

  if (!onchainResult.ok) {
    return { indexed: market, onchain: onchainResult, resolution, onchainResolutionPrice, statusHistory };
  }

  const onchain: MarketOnchain = onchainResult.value;
  const rawMarket = await attempt(async () => {
    const contract = { address: onchain.marketAddress, abi: marketReadAbi } as const;
    const [status, payoutNumerators, isResolved, isVoided, voidPolicy] = await Promise.all([
      publicClient.readContract({ ...contract, functionName: "status" }),
      publicClient.readContract({ ...contract, functionName: "payoutNumerators" }),
      publicClient.readContract({ ...contract, functionName: "isResolved" }),
      publicClient.readContract({ ...contract, functionName: "isVoided" }),
      publicClient.readContract({ ...contract, functionName: "voidPolicy" }).catch(() => null),
    ]);
    return {
      status,
      statusName: statusName[Number(status)] ?? `Unknown(${status})`,
      payoutNumerators,
      isResolved,
      isVoided,
      voidPolicy,
    };
  });

  const settlementRecord = await attempt(() =>
    publicClient.readContract({
      address: SOMNIA_TESTNET_ADDRESSES.binarySettlement!,
      abi: binarySettlementAbi,
      functionName: "getSettlement",
      args: [marketKey(onchain.yesId)],
    }),
  );

  // SDK/indexer calls above are not block-pinned. Take the event upper bound
  // afterwards so a market that finalizes during collection is not missed.
  const observedHead = await publicClient.getBlockNumber();
  const resolvedAtBlock = market.resolvedAtBlock ? BigInt(market.resolvedAtBlock) : null;
  const terminalTailEnd = resolvedAtBlock == null ? observedHead : resolvedAtBlock + terminalEventTail;
  const eventToBlock = terminalTailEnd < observedHead ? terminalTailEnd : observedHead;

  const [marketLogs, moduleLogs, poolLogs, settlementLogs] = await Promise.all([
    collectEventGroup(publicClient, onchain.marketAddress, marketEvents, fromBlock, eventToBlock),
    collectEventGroup(
      publicClient,
      SOMNIA_TESTNET_ADDRESSES.binaryModule!,
      moduleEvents,
      fromBlock,
      eventToBlock,
      (event) => ({ marketId: market.marketId, ...(event.name === "MarketFinalized" ? { pool: onchain.pool } : {}) }),
    ),
    collectEventGroup(
      publicClient,
      onchain.pool,
      poolEvents,
      fromBlock,
      eventToBlock,
      () => ({ marketNonce: onchain.nonce }),
    ),
    collectEventGroup(
      publicClient,
      SOMNIA_TESTNET_ADDRESSES.binarySettlement!,
      settlementEvents,
      fromBlock,
      eventToBlock,
      () => ({ marketKey: marketKey(onchain.yesId) }),
    ),
  ]);

  return {
    indexed: market,
    onchain: {
      ...onchain,
      statusName: statusName[onchain.status] ?? `Unknown(${onchain.status})`,
    },
    rawMarket,
    settlementRecord,
    resolution,
    onchainResolutionPrice,
    statusHistory,
    eventRange: {
      fromBlock,
      toBlock: eventToBlock,
      observedHead,
      terminalTail: resolvedAtBlock == null ? null : terminalEventTail,
      note: resolvedAtBlock == null
        ? "Active market scanned through the observed head"
        : "Terminal-market logs are bounded after resolution; production ingestion persists the live stream",
    },
    events: { market: marketLogs, module: moduleLogs, pool: poolLogs, settlement: settlementLogs },
  };
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const startedAt = new Date();
  const runId = startedAt.toISOString().replaceAll(":", "-").replace(".", "-");
  const outputDirectory = resolve("evidence", "runs", runId);
  await mkdir(outputDirectory, { recursive: true });

  const indexerUrl = process.env.INDEXER_URL?.trim() || DEFAULT_INDEXER_URL;
  const wsRpcUrl = process.env.WS_RPC_URL?.trim() || DEFAULT_WS_RPC_URL;
  const rpcUrl = process.env.RPC_URL?.trim() || DEFAULT_RPC_URL;
  const chain = {
    ...somniaShannon,
    rpcUrls: {
      ...somniaShannon.rpcUrls,
      default: {
        http: [rpcUrl],
        webSocket: [wsRpcUrl],
      },
    },
  };

  const exchange = new SomniaMarkets({
    chain,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    indexerUrl,
    wsRpcUrl,
  });
  const client = exchange.client;
  const publicClient = client.getViemClient();
  const [chainId, head, allResult, pastResult] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
    attempt(() => client.listBinaryMarkets({ limit: options.listLimit, orderBy: "newest" })),
    attempt(() => client.listPastBinaryMarkets({ limit: options.listLimit })),
  ]);

  await save(outputDirectory, "network.json", {
    startedAt: startedAt.toISOString(),
    sdkVersion: "0.29.0",
    chainId,
    head,
    endpoints: { rpcUrl, wsRpcUrl, indexerUrl },
    addresses: SOMNIA_TESTNET_ADDRESSES,
  });

  const all = allResult.ok ? allResult.value : [];
  const past = pastResult.ok ? pastResult.value : [];
  const uniqueMarkets = [...new Map(
    [...all, ...past].map((market) => [market.marketId.toLowerCase(), market]),
  ).values()];
  const statusCounts = uniqueMarkets.reduce<Record<string, number>>((counts, market) => {
    counts[market.status] = (counts[market.status] ?? 0) + 1;
    return counts;
  }, {});
  await save(outputDirectory, "markets.json", { all: allResult, past: pastResult, statusCounts });

  let selected: BinaryMarket[];
  if (options.marketId) {
    const requested = await client.getBinaryMarket(options.marketId);
    if (!requested) throw new Error(`Market ${options.marketId} was not found by the indexer`);
    selected = [requested];
  } else {
    selected = distinctMarkets([...all, ...past], options.markets);
  }

  const marketEvidence: Record<string, unknown> = {};
  for (const market of selected) {
    process.stdout.write(`Collecting ${market.marketId} (${market.status})...\n`);
    marketEvidence[market.marketId] = await collectMarket(client, market, options.terminalEventTail);
  }
  await save(outputDirectory, "selected-markets.json", marketEvidence);

  let walletEvidence: unknown = null;
  if (options.wallet) {
    const [portfolio, claimable] = await Promise.all([
      attempt(() => client.getPortfolio(options.wallet!, { ordersLimit: 200, tradesLimit: 200 })),
      attempt(() => client.getClaimable(options.wallet!)),
    ]);

    const verifiedPositions: unknown[] = [];
    if (portfolio.ok) {
      for (const position of portfolio.value.positions.slice(0, options.verifyPositionLimit)) {
        const onchain = await attempt(() => client.getMarketOnchain(position.market.id as Hex));
        const balance = onchain.ok
          ? await attempt(() => client.getOutcomeBalance({
              account: options.wallet!,
              outcomeToken: onchain.value.outcomeToken,
              id: BigInt(position.tokenId),
            }))
          : onchain;
        verifiedPositions.push({ indexed: position, onchainMarket: onchain, onchainBalance: balance });
      }
    }

    const verifiedClaimables: unknown[] = [];
    if (claimable.ok) {
      for (const candidate of claimable.value) {
        const onchain = await attempt(() => client.getMarketOnchain(candidate.marketId as Hex));
        if (!onchain.ok) {
          verifiedClaimables.push({ indexed: candidate, onchainMarket: onchain });
          continue;
        }
        const key = marketKey(onchain.value.yesId);
        const [balance, settlement] = await Promise.all([
          attempt(() => client.getOutcomeBalance({
            account: options.wallet!,
            outcomeToken: onchain.value.outcomeToken,
            id: candidate.outcomeIdx === 0 ? onchain.value.yesId : onchain.value.noId,
          })),
          attempt(() => publicClient.readContract({
            address: SOMNIA_TESTNET_ADDRESSES.binarySettlement!,
            abi: binarySettlementAbi,
            functionName: "getSettlement",
            args: [key],
          })),
        ]);

        let verification: Record<string, unknown> | null = null;
        if (balance.ok && settlement.ok) {
          const numerator = settlement.value.payoutNumerators[candidate.outcomeIdx] ?? 0n;
          const expectedPayout = (balance.value * numerator) / PAYOUT_DENOMINATOR;
          verification = {
            marketKey: key,
            outcomeBalance: balance.value,
            payoutNumerator: numerator,
            payoutDenominator: PAYOUT_DENOMINATOR,
            expectedPayout,
            matchesIndexerEstimate: expectedPayout === candidate.estPayout,
            checks: {
              finalized: settlement.value.finalized && onchain.value.finalized,
              positiveBalance: balance.value > 0n,
              positivePayout: numerator > 0n,
              amountWithinBalance: candidate.amount <= balance.value,
              poolMatches: settlement.value.pool.toLowerCase() === onchain.value.pool.toLowerCase(),
              nonceMatches: settlement.value.nonce === onchain.value.nonce,
            },
          };
        }
        verifiedClaimables.push({ indexed: candidate, onchainMarket: onchain, balance, settlement, verification });
      }
    }
    const walletEventHead = await publicClient.getBlockNumber();
    const walletEventFromBlock = walletEventHead > options.walletEventLookback
      ? walletEventHead - options.walletEventLookback
      : 0n;
    const walletEvents = await collectEventGroup(
      publicClient,
      SOMNIA_TESTNET_ADDRESSES.binarySettlement!,
      walletSettlementEvents,
      walletEventFromBlock,
      walletEventHead,
      () => ({ owner: options.wallet! }),
    );
    walletEvidence = {
      wallet: options.wallet,
      portfolio,
      claimable,
      verifiedPositions,
      verifiedPositionLimit: options.verifyPositionLimit,
      verifiedClaimables,
      settlementEvents: walletEvents,
      eventRange: {
        fromBlock: walletEventFromBlock,
        toBlock: walletEventHead,
        boundedLookback: options.walletEventLookback,
      },
    };
    await save(outputDirectory, "wallet.json", walletEvidence);
  }

  await save(outputDirectory, "summary.json", {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    chainId,
    head,
    selectedMarketIds: selected.map((market) => market.marketId),
    statusCounts,
    wallet: options.wallet ?? null,
    files: ["network.json", "markets.json", "selected-markets.json", ...(walletEvidence ? ["wallet.json"] : [])],
  });

  await exchange.close();
  // SomniaMarkets.close() stops SDK watches but SDK 0.29.0 leaves the lazily
  // created viem WebSocket transport open after one-shot reads.
  const rpcClient = await publicClient.transport.getRpcClient();
  await rpcClient.close();
  process.stdout.write(`Evidence written to ${outputDirectory}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${errorRecord(error).name}: ${errorRecord(error).message}\n`);
  process.exitCode = 1;
});
