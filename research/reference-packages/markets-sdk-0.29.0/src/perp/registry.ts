// Perp market DISCOVERY — which markets exist, and which of them are tradeable.
//
// PERP-ONLY. Spot and binary markets are discovered through the indexer; perps have
// an on-chain factory that is the actual source of truth for what has been deployed,
// which matters twice over. It survives an indexer that is behind or mid-reindex,
// and it is complete: the indexer's perp set comes from a curated manifest, so a
// market deployed after that manifest was written is invisible there and present
// here.
//
// The hard part is not enumeration, it is that "deployed" is not "tradeable". Two
// independent gates decide that, and they fail for unrelated reasons.

import type { Address, PublicClient } from "viem";
import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, zeroAddress } from "viem";
import * as Markets from "../markets.js";
import { unreachable } from "../raise.js";
import type { PerpMarket } from "../markets.js";
import * as ReadsAbi from "../readsAbi.js";

/**
 *  Whether a failed read means "this contract does not have that function" rather than
 *  "the request did not get through".
 *
 *  Deliberately narrow. Calling a selector an older implementation never declared lands
 *  in the fallback (or nothing at all) and surfaces as a revert or as empty return
 *  data; a timeout, a rate limit or a dropped connection surfaces as neither. Catching
 *  every error instead would turn an RPC outage into a confident "this market is not
 *  registered", which is the one answer these views exist to avoid guessing at.
 */
/**
 *  Whether a failed read means "this contract does not have that function" rather than
 *  "the request did not get through" — shared so a caller cannot drift from this policy.
 */
export function isMissingContractView(err: unknown): boolean {
  return isMissingView(err);
}

function isMissingView(err: unknown): boolean {
  // Walks `cause`, and that is the whole point. Every call site here receives the
  // DECORATED client, which normalizes a read failure through `Revert.toSdkError` — so
  // what actually arrives is an `RpcError` or `ContractRevertError`, neither of which
  // extends viem's `BaseError`. Testing the top-level value alone therefore matched
  // NOTHING the production client can produce, and every fallback guarded by this
  // function was dead code: the ERC-165 probe threw instead of taking `legacyStatuses`,
  // and the stop-registry read failed a whole row instead of reporting no registry.
  //
  // Both normalized shapes keep a viem error reachable via `cause`
  // (RpcError -> ContractFunctionExecutionError -> ContractFunctionZeroDataError, and
  // ContractRevertError -> ContractFunctionExecutionError -> ContractFunctionRevertedError),
  // so finding the first viem error and applying the original narrow check restores it.
  // A raw viem error, from a caller's own undecorated client, matches on the first step.
  for (let e: unknown = err, depth = 0; e != null && depth < 8; e = (e as { cause?: unknown }).cause, depth += 1) {
    if (e instanceof BaseError) {
      return Boolean(
        e.walk((x) => x instanceof ContractFunctionZeroDataError || x instanceof ContractFunctionRevertedError),
      );
    }
  }
  // Still deliberately narrow: a timeout, a rate limit or a dropped connection carries no
  // viem contract error anywhere in its chain, so an RPC outage never reads as "this
  // contract does not have that function".
  return false;
}

/**
 *  ERC-165 id of `IPerpPoolFactoryMarketStatus` — the feature-detection handle that
 *  tells an upgraded factory from one predating the market-status views.
 *
 *  A separate interface from `IPerpPoolFactory` on purpose: two live rotation gates
 *  (`MarginBank.setPerpPoolFactory`, `OperatorPermissionsRegistry.setPerpPoolFactory`)
 *  check `type(IPerpPoolFactory).interfaceId`, so declaring these views there would
 *  have changed the advertised id and turned a one-contract upgrade into a
 *  coordinated three-contract one.
 *
 * @category perpetual markets
 */
export const PERP_POOL_FACTORY_MARKET_STATUS_INTERFACE_ID = "0xa874fb70" as const;

/**
 *  One factory-deployed perp market and whether it can actually be traded.
 *
 *  **`restricted` and `registered` are independent gates that fail for unrelated
 *  reasons.** A market can be perfectly registered with the bank and still be
 *  close-only, or unrestricted and never activated. Both have to pass, which is what
 *  {@link tradeable} folds together.
 *
 * @category perpetual markets
 */
export type PerpPoolStatus = {
  /** The PerpPool beacon proxy. */
  pool: Address;
  /** The synthetic base ERC-20 the market tracks. */
  baseToken: Address;
  /**
   *  The MarginBank this pool settles against, read from the pool itself.
   *
   *  Effectively a per-network singleton, but taken per-pool because the pool is
   *  what the settlement path actually uses — so this is the bank a later
   *  `getMarginAccount` / `getPerpPosition` / `getLiquidationPrice` for this market
   *  must be addressed to. Carrying it here means a consumer never has to source it
   *  separately, and never has to hardcode it per chain.
   */
  marginBank: Address;
  /**
   *  True when the market is CLOSE-ONLY: position-increasing orders revert
   *  `MarketRestricted`, while closes, reduces and cancels still work.
   *
   *  Restricted markets stay visible on purpose — holders still have to close
   *  positions, cancel orders and withdraw collateral, and liquidation runs on them
   *  unchanged. Reversible: a restriction can be a temporary wind-down rather than a
   *  retirement.
   */
  restricted: boolean;
  /**
   *  Whether {@link marginBank} has this pool registered — the ACTIVATION gate.
   *
   *  Coming from the factory only proves a pool is authentic; `addPerpPool` is the
   *  separate step that makes it usable, and `removePerpPool` revokes it. An
   *  unregistered pool rejects every settlement callback and every quote view while
   *  still reading as an ordinary market from the factory.
   *
   *  `null` when the gate is genuinely unreadable, from either of two causes: the pool's
   *  MarginBank predates `isPerpPoolRegistered`, or that pool's bank reads failed while
   *  other pools' succeeded. Nothing substitutes for it — `getPoolTier` is itself gated
   *  on registration (so it collapses to 0 for both an uncovered-but-registered market
   *  and an unregistered one) and `getActivePerpPools` is per-account, not the registry.
   *
   *  On the read-failure cause, {@link marginBank} is the zero address: the pool's own
   *  bank could not be established either, so do not address a settlement read to it.
   */
  registered: boolean | null;
  /**
   *  Both gates passed — not restricted AND registered. The list to show as tradeable.
   *
   *  `null` when {@link registered} is unknown: with one of the two gates unreadable,
   *  tradeability is genuinely undetermined, and reporting `false` would hide live
   *  markets while `true` would advertise dead ones.
   */
  tradeable: boolean | null;
};

/**
 *  Every perp market the factory has deployed, in deployment order (oldest first),
 *  with the two gates that decide whether it is tradeable.
 *
 *  Chain tier. **Do not build a market list from `getPerpPools()` alone** — that is
 *  the raw deployment history and includes markets wound down to close-only, so
 *  listing it unfiltered presents dead markets as tradeable.
 *
 *  Prefers the factory's `getPerpPoolStatuses()`, which returns every market's base
 *  token and restriction state in ONE call. That is not merely cheaper than pairing
 *  `getUnrestrictedPerpPools` with `getRestrictedPerpPools`: two calls can straddle a
 *  `setRestricted` and yield a set that never existed at any block.
 *
 *  Falls back, on a factory predating those views (ERC-165 says so, or has no ERC-165
 *  at all), to `getPerpPools()` plus a per-pool fan-out: the same rows at O(markets)
 *  calls, so a consumer never branches on which chain it is talking to.
 *
 *  One field does differ there, and it cannot be helped. `isPerpPoolRegistered` shipped
 *  in the SAME upgrade wave as the factory's status views, so a chain taking this
 *  fallback is precisely a chain whose bank cannot answer the registration gate —
 *  {@link PerpPoolStatus.registered} and {@link PerpPoolStatus.tradeable} come back
 *  `null` rather than guessed. Everything else is identical.
 *
 *  **The MarginBank is not a parameter.** It is a per-network singleton in practice,
 *  but each pool names its own via `PerpPool.marginBank()` — and the pool's own bank
 *  is what its settlement path actually uses, so that is the authority for whether
 *  THIS market is registered. Reading it per pool means a caller never has to source
 *  the bank separately or hardcode it per chain, and the address comes back on every
 *  row for the `getMarginAccount` / `getPerpPosition` reads that follow.
 *
 * **Details**
 *
 * - `p.factory`: the PerpPoolFactory
 */
export async function listPerpPoolStatuses(
  p: { factory: Address },
  client: PublicClient,
): Promise<PerpPoolStatus[]> {
  // Every read below is pinned to ONE block. The atomicity argument for preferring
  // `getPerpPoolStatuses` over two calls applies just as much to the registration
  // fan-out that follows it: unpinned, a `setRestricted` and a `removePerpPool` landing
  // mid-walk would produce a row whose two gates came from different heights — a state
  // that never coexisted on chain.
  const blockNumber = await client.getBlockNumber();
  const f = { address: p.factory, abi: ReadsAbi.perpPoolFactoryReadAbi, blockNumber } as const;

  // A factory old enough to predate the status views may also predate ERC-165 itself,
  // in which case the probe reverts rather than answering false. Treating that as
  // "no status views" is the whole point of having a fallback — letting it throw would
  // strand the callers the fallback exists for.
  const hasStatusViews = await client
    .readContract({ ...f, functionName: "supportsInterface", args: [PERP_POOL_FACTORY_MARKET_STATUS_INTERFACE_ID] })
    .catch((err: unknown) => {
      if (isMissingView(err)) return false;
      throw err;
    });

  const base = hasStatusViews
    ? (await client.readContract({ ...f, functionName: "getPerpPoolStatuses" })).map((s) => ({
        pool: s.perpPool,
        baseToken: s.baseToken,
        restricted: s.restricted,
      }))
    : await legacyStatuses(p.factory, client, blockNumber);

  // PER-POOL, not `Promise.all`. One pool whose bank cannot be read must not reject the
  // whole listing: a consumer that loses every status loses the gates for every OTHER
  // market too, and an unrelated restricted market then reads as tradeable again. A pool
  // that cannot be resolved comes back with its registration UNDETERMINED instead, which
  // is what it genuinely is.
  const settled = await Promise.allSettled(
    base.map(async (b) => {
      const marginBank = await client.readContract({
        address: b.pool,
        abi: ReadsAbi.perpPoolReadAbi,
        functionName: "marginBank",
        blockNumber,
      });
      // `isPerpPoolRegistered` shipped in the SAME wave as the factory's status views,
      // so a chain old enough to take the fallback above is exactly a chain whose bank
      // does not answer this — and there is no substitute: `getPoolTier` is itself
      // gated on registration, and `getActivePerpPools` is per-ACCOUNT, not the
      // registry. Unhandled, this read reverted and rejected the whole listing,
      // leaving the fallback dead on arrival on every environment it was written for.
      // Registration is reported as unknown there rather than guessed.
      const registered = await client
        .readContract({
          address: marginBank,
          abi: ReadsAbi.marginBankReadAbi,
          functionName: "isPerpPoolRegistered",
          args: [b.pool],
          blockNumber,
        })
        .catch((err: unknown) => {
          if (isMissingView(err)) return null;
          throw err;
        });
      return {
        ...b,
        marginBank,
        registered,
        tradeable: registered === null ? null : !b.restricted && registered,
      };
    }),
  );
  return settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    // `restricted` and `baseToken` came from the factory's atomic call and are still
    // good; only the bank could not be reached. Reported as undetermined, never guessed —
    // and `restricted: true` still closes the market on its own.
    const b = base[i] ?? unreachable("allSettled result without its input");
    return { ...b, marginBank: zeroAddress, registered: null, tradeable: null };
  });
}

/**
 *  The pre-upgrade path: enumerate, then read each pool's base token and restriction
 *  state directly. Produces exactly what `getPerpPoolStatuses` would, at O(markets)
 *  calls instead of one — and, unlike that call, NOT atomic, so a `setRestricted`
 *  landing mid-fan-out can be reflected for some pools and not others.
 */
async function legacyStatuses(
  factory: Address,
  client: PublicClient,
  blockNumber: bigint,
): Promise<Array<{ pool: Address; baseToken: Address; restricted: boolean }>> {
  const pools = await client.readContract({
    address: factory,
    abi: ReadsAbi.perpPoolFactoryReadAbi,
    functionName: "getPerpPools",
    blockNumber,
  });
  return Promise.all(
    pools.map(async (pool) => {
      const [baseToken, restricted] = await Promise.all([
        client.readContract({
          address: factory,
          abi: ReadsAbi.perpPoolFactoryReadAbi,
          functionName: "getBaseTokenForPool",
          args: [pool],
          blockNumber,
        }),
        client.readContract({
          address: pool,
          abi: ReadsAbi.perpPoolReadAbi,
          functionName: "isRestricted",
          blockNumber,
        }),
      ]);
      return { pool, baseToken, restricted };
    }),
  );
}

/**
 *  Just the tradeable markets — the common case, filtered from
 *  {@link listPerpPoolStatuses}. Chain tier.
 *
 * **Gotchas**
 *
 * - Throws if any market's registration gate is unreadable (a MarginBank predating `isPerpPoolRegistered`). Silently dropping those rows would return a SHORT list that looks authoritative — the one failure a caller could not detect — so this refuses rather than guesses. Use {@link listPerpPoolStatuses} to see the markets and decide for yourself.
 */
export async function listTradeablePerpPools(p: { factory: Address }, client: PublicClient): Promise<Address[]> {
  const statuses = await listPerpPoolStatuses(p, client);
  const undetermined = statuses.filter((s) => s.tradeable === null);
  if (undetermined.length > 0) {
    throw new Error(
      `cannot determine tradeability for ${undetermined.length} of ${statuses.length} perp markets: ` +
        `their MarginBank predates isPerpPoolRegistered. Pools: ${undetermined.map((s) => s.pool).join(", ")}`,
    );
  }
  return statuses.filter((s) => s.tradeable).map((s) => s.pool);
}

/**
 *  Whether the MarginBank has a perp pool registered — the activation gate on its
 *  own.
 *
 *  Chain tier. Use when checking one known pool; {@link listPerpPoolStatuses}
 *  answers it for every market alongside the restriction gate.
 *
 *  Do not reach for `getPoolTier` instead: it is itself gated on registration, so it
 *  returns 0 for an uncovered-but-registered market and an unregistered one alike.
 */
export async function isPerpPoolRegistered(
  p: { marginBank: Address; pool: Address },
  client: PublicClient,
): Promise<boolean> {
  return client.readContract({
    address: p.marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "isPerpPoolRegistered",
    args: [p.pool],
  });
}

/**
 *  One factory-deployed perp market as a {@link PerpMarket} row, read entirely
 *  from the chain — for a market the indexer does not know.
 *
 *  Chain tier. `PerpPoolDeployed` names the pool, its base token and its bank,
 *  and nothing else the row needs, so the grid, the margin factor and the base
 *  token's ERC-20 metadata are read from the pool and the token here.
 *
 *  **Gotchas**
 *
 *  - The five HISTORY fields cannot come from the chain and are placeholders, not measurements: `cumulativeBaseVolume`, `cumulativeQuoteVolume` and `tradeCount` are `"0"`, and `createdAtTimestamp` / `createdAtBlock` are `"0"`. Zero here means UNKNOWN, not "never traded". Branch on {@link UnifiedMarket.indexed} before reading them; a market this function produced has it false.
 *  - Every funding, mark-price and open-interest field is null for the same reason — the indexer derives them from events. Read {@link SomniaMarketsClient.getPerpState} for the live values.
 *  - `stopRegistry` comes from the factory's `getStopOrderRegistry` — the only on-chain route to it, because the registry is separately deployed and the pool holds no pointer back. Null both when the factory records none for this pool (TP/SL genuinely unavailable) and when the factory predates that read (undiscoverable). The two are not distinguished, because the consequence is identical: TP/SL cannot be offered.
 */
export async function readPerpMarketFromChain(
  p: {
    /** The pool's chain-tier status, from {@link listPerpPoolStatuses}. */
    status: PerpPoolStatus;
    /** The collateral token every perp market is quoted in (`MarginBank.getSystemConfig`). */
    collateralToken: Address;
    /** The collateral's ERC-20 decimals. */
    collateralDecimals: number;
    /** The collateral's ERC-20 symbol, or null when it exposes none. */
    collateralSymbol: string | null;
    /** The PerpPoolFactory — the only contract that knows this pool's stop registry. */
    factory: Address;
  },
  client: PublicClient,
): Promise<PerpMarket> {
  const pool = { address: p.status.pool, abi: ReadsAbi.perpPoolReadAbi } as const;
  const token = { address: p.status.baseToken, abi: ReadsAbi.erc20ReadAbi } as const;
  const [book, risk, baseDecimals, baseSymbol, stopRegistry] = await Promise.all([
    client.readContract({ ...pool, functionName: "getOrderBookParameters" }),
    client.readContract({ ...pool, functionName: "getPerpPoolParameters" }),
    client.readContract({ ...token, functionName: "decimals" }),
    // A token that exposes no symbol() is a valid ERC-20; the row's own contract for
    // that case is null, so answer it rather than failing the whole listing. Only a
    // MISSING view earns that null: a timeout or a dropped connection is an operational
    // failure and must stay one, or discovery reports success with incomplete data.
    client
      .readContract({ ...token, functionName: "symbol" })
      .then(String)
      .catch((err: unknown) => {
        if (isMissingView(err)) return null;
        throw err;
      }),
    // Feature-detected exactly as the status views are: a factory predating
    // IPerpPoolFactoryStopRegistry has no such selector, and that is a market with
    // no reachable TP/SL rather than a failed listing. An RPC outage still throws,
    // because isMissingView is deliberately narrow.
    client
      .readContract({
        address: p.factory,
        abi: ReadsAbi.perpPoolFactoryReadAbi,
        functionName: "getStopOrderRegistry",
        args: [p.status.pool],
      })
      .catch((err: unknown) => {
        if (isMissingView(err)) return null;
        throw err;
      }),
  ]);
  const id = Markets.lower0x(p.status.pool);
  return {
    id,
    marketType: "PERP",
    poolAddress: id,
    lastPrice: null,
    lastTradeAt: null,
    // Placeholders — see the gotcha above. Zero is UNKNOWN here.
    cumulativeBaseVolume: "0",
    cumulativeQuoteVolume: "0",
    tradeCount: "0",
    createdAtTimestamp: "0",
    createdAtBlock: "0",
    baseDecimals: Number(baseDecimals),
    quoteDecimals: p.collateralDecimals,
    baseToken: Markets.lower0x(p.status.baseToken),
    quoteToken: Markets.lower0x(p.collateralToken),
    baseSymbol,
    quoteSymbol: p.collateralSymbol,
    baseIsNative: false,
    tickSize: book.tickSize.toString(),
    lotSize: book.lotSize.toString(),
    minQuantity: book.minQuantity.toString(),
    marginBank: Markets.lower0x(p.status.marginBank),
    initialMarginBps: Number(risk.initialMarginBps),
    // Zero is the factory's "no registry recorded" sentinel; this field's contract for
    // that is null, so a consumer has one check rather than two.
    stopRegistry: stopRegistry && stopRegistry !== zeroAddress ? Markets.lower0x(stopRegistry) : null,
    markPrice: null,
    markPriceUpdatedAt: null,
    fundingRate: null,
    cumulativeFundingPerUnit: null,
    indexPrice: null,
    fundingUpdatedAt: null,
    fundingWindowSec: null,
    fundingIntervalSec: null,
    openInterest: null,
    openInterestUpdatedAt: null,
  };
}
