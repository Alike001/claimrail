// Binary holdings — outcome-token balances and the portfolio view over them.
//
// BINARY-ONLY: positions are ERC-6909 outcome tokens (one id per market per side)
// plus vault credit for payouts that could not be pushed. Spot holds plain
// ERC-20s (see balances.ts) and perp holds margin (perp/margin.ts) — different
// accounting, different contracts.

import type { Address, PublicClient } from "viem";
import * as IndexerRead from "../indexerRead.js";
import * as Interval from "../interval.js";
import { graphql } from "../gql/gql.js";
import * as ReadsAbi from "../readsAbi.js";
import type { OpenOrder, BookTop } from "../orders.js";
import type { FillRow } from "../fills.js";
import type { RouterActionRecord } from "../router.js";
import type { YesBookTop } from "../units.js";
import { type BinaryPositionPnL, computePositionPnL, pnlEventsFor } from "../derivedReads.js";
import type { BinaryMarketStatus } from "../store.js";

/**
 *  A user's indexed YES/NO outcome-token balances in one binary market. Raw
 *  outcome-token units (same decimals as the market's collateral); "0" when the
 *  indexer has never seen the account touch that side.
 *
 * @category binary markets
 */
export type OutcomeBalances = {
  /** Raw YES balance ("0" if never held). */
  yes: string;
  /** Raw NO balance ("0" if never held). */
  no: string;
};

/**
 *  YES + NO indexed balances for a user in a binary market (0 if the indexer
 *  hasn't seen them). Throws if the indexer request fails.
 */
export async function getOutcomeBalances(
  account: string,
  marketAddress: string,
  indexerUrl: string,
): Promise<OutcomeBalances> {
  const acct = account.toLowerCase();
  const mkt = marketAddress.toLowerCase();
  const data = await IndexerRead.gqlRequest(OutcomeBalancesQuery,
    { acct, mkt },
    indexerUrl,
  );
  const yes = data.OutcomeBalance.find((b) => b.outcomeIndex === 0)?.balance ?? "0";
  const no = data.OutcomeBalance.find((b) => b.outcomeIndex === 1)?.balance ?? "0";
  return { yes, no };
}

/**
 * A market context attached to portfolio rows (subset of {@link BinaryMarket}).
 *
 * @category binary markets
 */
export type PortfolioMarket = {
  /**
   *  The market's bytes32 marketId (== `BinaryMarket.id`). Key positions by this,
   *  never by `poolAddress` alone (a pool is recycled across markets).
   */
  id: string;
  /** The BinaryMarket clone contract's address (lowercased). */
  marketAddress: string;
  /** The pool serving the market (lowercased; a time-varying binding — see `id`). */
  poolAddress: string;
  /** Underlying asset symbol (e.g. "BTC"). */
  asset: string;
  /** Display question text. */
  question: string;
  /** Lifecycle status (aliased from the indexer's `clobStatus`). */
  status: BinaryMarketStatus;
  /** Last fill price (raw, ≈ YES probability × 10^quoteDecimals); null until first fill. */
  lastPrice: string | null;
  /** Strike the question resolves against (raw, oracle price scale). */
  strike: string;
  /** Timestamp (unix seconds) trading ends. */
  expiry: string;
  /** Winning outcome (0 = YES, 1 = NO); null until Resolved / on a void. */
  winningOutcome?: number | null;
  /** True once the market voided (complete sets redeem at par). */
  voided: boolean;
  /**
   *  Collateral decimals (per-market — collateral is per-venue, e.g. 6dp
   *  TestUSDC vs 18dp USDso). Format prices/balances with this, never a
   *  hard-coded 6. Outcome-token amounts mirror the same decimals.
   */
  quoteDecimals: number;
  /** Series cadence in seconds, as the indexer derived it; null on legacy rows. */
  intervalSec: string | null;
  /**
   *  Compact series-cadence label ("15m" / "1h" / "4h" / "24h") — DERIVED by the
   *  SDK from {@link PortfolioMarket.intervalSec}, so a positions/orders row can
   *  show the contract duration without re-deriving it. `null` when unknown.
   */
  interval: string | null;
};

/**
 * One outcome-token position in a wallet's binary portfolio.
 *
 * @category binary markets
 */
export type PortfolioPosition = {
  /** The market the position is in. */
  market: PortfolioMarket;
  /** 0 = YES, 1 = NO. */
  outcomeIndex: number;
  /** ERC-6909 position id on the outcome-token singleton (decimal string). */
  tokenId: string;
  /** Raw outcome-token balance. */
  balance: string;
};

/**
 *  An open binary position joined with its reliable avg-cost PnL — the batched,
 *  positions-list companion to `getBinaryPositionPnL` (which is per market).
 *  `costBasis` / `avgCost` / `markValue` / `unrealizedPnl` / `realizedPnl` are
 *  RAW collateral units; format with `market.quoteDecimals`.
 *
 *  Those fields are BLENDED across both outcomes; the inherited `outcomes` pair
 *  carries each book on its own.
 *
 * @category binary markets
 */
export type OpenPositionPnL = BinaryPositionPnL & {
  /** The market the position is in (id / addresses / quoteDecimals / status / …). */
  market: PortfolioMarket;
};

/**
 *  Pure fold: group an account's open positions + its fills + router actions +
 *  per-market top-of-book into one {@link OpenPositionPnL} per market, reusing the
 *  same avg-cost engine ({@link pnlEventsFor} + {@link computePositionPnL}) as the
 *  per-market `getBinaryPositionPnL`. Fills, router actions and balances all group
 *  by MARKET ID — a binary pool is recycled across successive markets, so the pool
 *  address does not identify which market a fill belongs to. No I/O — the client
 *  method fetches the inputs (batched) and hands them here, which keeps this
 *  unit-testable.
 */
export function computeOpenPositionsPnL(
  account: string,
  positions: PortfolioPosition[],
  fills: FillRow[],
  routerActions: RouterActionRecord[],
  bookTops: Record<string, BookTop>,
): OpenPositionPnL[] {
  if (positions.length === 0) return [];

  // Balances + the market row, keyed by market (a market can hold BOTH YES + NO)
  // and NORMALIZED, like every lookup below — one market's two legs must not
  // split into two output rows over a difference of case.
  const marketById = new Map<string, PortfolioMarket>();
  const balByMarket = new Map<string, { yes: bigint; no: bigint }>();
  for (const p of positions) {
    const id = p.market.id.toLowerCase();
    marketById.set(id, p.market);
    const b = balByMarket.get(id) ?? { yes: 0n, no: 0n };
    if (p.outcomeIndex === 0) b.yes = BigInt(p.balance);
    else b.no = BigInt(p.balance);
    balByMarket.set(id, b);
  }

  // Fills AND router actions group by market id. Keying fills on the POOL folded
  // a recycled pool's earlier markets into whichever market holds it now (see
  // `FillRow.market`). `pnlEventsFor` applies no market filter, so this
  // grouping is the only thing scoping each market's events.
  const fillsByMarket = new Map<string, FillRow[]>();
  for (const f of fills) {
    const key = f.market.toLowerCase();
    const arr = fillsByMarket.get(key);
    if (arr) arr.push(f);
    else fillsByMarket.set(key, [f]);
  }
  const actionsByMarket = new Map<string, RouterActionRecord[]>();
  for (const a of routerActions) {
    if (a.market == null) continue;
    // Normalized like the fill key: a mint/merge that missed its bucket would
    // drop out of the cost basis entirely.
    const key = a.market.toLowerCase();
    const arr = actionsByMarket.get(key);
    if (arr) arr.push(a);
    else actionsByMarket.set(key, [a]);
  }

  const out: OpenPositionPnL[] = [];
  for (const [id, market] of marketById) {
    // `id` is already normalized (see marketById above), as are both group keys.
    const marketFills = fillsByMarket.get(id) ?? [];
    const marketActions = actionsByMarket.get(id) ?? [];
    const events = pnlEventsFor(account, marketFills, marketActions);
    const bal = balByMarket.get(id) ?? { yes: 0n, no: 0n };
    const oneCollateral = 10n ** BigInt(market.quoteDecimals);
    const bt = bookTops[id];
    const bookTop: YesBookTop | undefined = bt
      ? {
          bestBid: bt.bestBid != null ? BigInt(bt.bestBid) : undefined,
          bestAsk: bt.bestAsk != null ? BigInt(bt.bestAsk) : undefined,
        }
      : undefined;
    const pnl = computePositionPnL(
      events,
      { balanceYes: bal.yes, balanceNo: bal.no },
      // Normalise PortfolioMarket's optional `winningOutcome` to the required
      // nullable computePositionPnL Picks.
      {
        quoteDecimals: market.quoteDecimals,
        lastPrice: market.lastPrice,
        winningOutcome: market.winningOutcome ?? null,
        voided: market.voided,
      },
      oneCollateral,
      bookTop ? { bookTop } : undefined,
    );
    out.push({ market, ...pnl });
  }
  return out;
}

/**
 * One currently-open order in a wallet's binary portfolio.
 *
 * @category binary markets
 */
export type PortfolioOrder = {
  /** Order id (`${pool}_${orderId}`). */
  id: string;
  /** uint128 OrderId as a decimal string (pass to trader.cancelOrder). */
  orderId: string;
  /** YES/NO classification of the order. */
  side: OpenOrder["side"];
  /** Limit price, raw quote units (YES-probability scale). */
  price: string;
  /** Unfilled remainder, raw outcome units. */
  quantityRemaining: string;
  /** Cumulative filled quantity, raw outcome units. */
  filledQuantity: string;
  /** Original order size, raw outcome units. */
  fullQuantity: string;
  /** Timestamp (unix seconds) the order was placed. */
  placedAtTimestamp: string;
  /** Tx hash the order was placed in. */
  placedTxHash: string;
  /** The market the order rests on. */
  market: PortfolioMarket;
};

/**
 * One recent fill the wallet participated in (binary portfolio view).
 *
 * @category binary markets
 */
export type PortfolioTrade = {
  /** Fill id (`${blockNumber}_${logIndex}`). */
  id: string;
  /** Execution price, raw quote units (YES-probability scale). */
  fillPrice: string;
  /** Outcome-token quantity filled, raw units. */
  quantity: string;
  /** Timestamp (unix seconds) of the fill. */
  timestamp: string;
  /** Tx hash the fill landed in. */
  txHash: string;
  /** The queried account's side on this fill (maker or taker side), if known. */
  side: OpenOrder["side"] | null;
  /** Whether the account was the maker (resting) on this fill. */
  asMaker: boolean;
  /** The other party's address, if known. */
  counterparty: string | null;
  /** Minimal market context for rendering the trade row. */
  market: {
    /** The BinaryMarket clone contract's address (lowercased). */
    marketAddress: string;
    /** Underlying asset symbol (e.g. "BTC"). */
    asset: string;
    /** Collateral decimals — format `fillPrice`/`quantity` with this. */
    quoteDecimals: number;
    /** Series cadence in seconds, as the indexer derived it; null on legacy rows. */
    intervalSec: string | null;
    /**
     *  Human timeframe label — `"15m"` / `"1h"` / `"4h"` / `"24h"` — DERIVED by
     *  the SDK from `intervalSec` (falling back to `expiry − tradingStart`) and
     *  snapped to its canonical unit. The "which timeframe was the trade for"
     *  value. Null when no cadence is determinable.
     */
    interval: string | null;
    /** Unix seconds trading opened; null on legacy rows. */
    tradingStart: string | null;
    /** Unix seconds trading ends / the outcome is decided; null on legacy rows. */
    expiry: string | null;
  };
};

/**
 * A wallet's binary portfolio — the shape {@link SomniaMarketsClient.getPortfolio} returns.
 *
 * @category binary markets
 */
export type Portfolio = {
  /** The queried account (lowercased). */
  account: string;
  /** Non-zero outcome-token positions (up to 200, largest balance first). */
  positions: PortfolioPosition[];
  /** Currently-open binary orders, newest first. */
  openOrders: PortfolioOrder[];
  /** Recent binary fills the account participated in, newest first. */
  trades: PortfolioTrade[];
  /**
   *  The read hit its `tradesLimit`, so fills older than the last entry in `trades` exist
   *  and were NOT returned. Raise `tradesLimit` for the rest.
   *  A total folded from a truncated `trades` covers part of the history only.
   *  False when the page was short, and false for `tradesLimit: 0`, which asks for
   *  no trades at all.
   */
  tradesTruncated: boolean;
};

/**
 *  Default `tradesLimit` for every portfolio read. Shared so the returned
 *  `tradesTruncated` flag cannot disagree with the limit that was used.
 */
export const DEFAULT_TRADES_LIMIT = 50;

/**
 *  Paging/window options shared by the portfolio queries
 *  ({@link SomniaMarketsClient.getPortfolio} / {@link SomniaMarketsClient.getSpotPortfolio} / {@link SomniaMarketsClient.getPerpPortfolio}).
 *  All optional.
 *
 * @category binary markets
 */
export type PortfolioOptions = {
  /**
   *  Max open orders to fetch (default 200).
   *
   *  On SPOT this ALSO bounds `pendingStopOrders`: the spot query binds one
   *  limit variable to both sets, so a small value here shortens the stop-order
   *  list too, not just the open orders you asked about.
   */
  ordersLimit?: number;
  /**
   *  Max recent trades to fetch (default 50).
   *
   *  The reads page newest-first, so this cap drops the OLDEST fills. Check
   *  `tradesTruncated` on the returned portfolio to see whether it did: the flag is
   *  true when `trades.length` reaches this limit.
   */
  tradesLimit?: number;
  /** Only trades at/after this unix-seconds timestamp. */
  since?: number;
};

/**
 *  Everything needed to render a wallet's binary portfolio: outcome-token
 *  positions (non-zero balances), currently-open orders, and recent fills the
 *  account participated in — matched on the indexed `maker` and `taker` columns.
 *  One round-trip; throws on indexer failure.
 *
 *  The taker seat used to be matched through the takerOrder relationship, on the
 *  belief that `taker` was not denormalized onto a binary Fill. The indexer
 *  stamps it for every pool type inside the fill's own transaction — see the
 *  `participatedAs` note in `fills.ts` — so the join predicate selected exactly
 *  the same rows while forcing a correlated `EXISTS` per row scanned. On the
 *  development indexer that cost this read ~4.5s for a light wallet against
 *  ~30ms. The takerOrder FIELDS are still selected: `side` and `owner` are what
 *  a taker-seat row reads for its own side and its counterparty.
 */
export async function getPortfolio(
  account: string,
  opts: PortfolioOptions = {},
  indexerUrl: string,
): Promise<Portfolio> {
  const acct = account.toLowerCase();
  const fillWhere: Record<string, unknown> = {
    market: { marketType: { _eq: "BINARY" } },
    _or: [{ maker: { _eq: acct } }, { taker: { _eq: acct } }],
  };
  if (opts.since != null) fillWhere.timestamp = { _gte: opts.since };
  const tradesLimit = opts.tradesLimit ?? DEFAULT_TRADES_LIMIT;
  const data = await IndexerRead.gqlRequest(
    PortfolioQuery,
    { acct, fillWhere, ordersLimit: opts.ordersLimit ?? 200, tradesLimit },
    indexerUrl,
  );

  const trades: PortfolioTrade[] = IndexerRead.narrowIndexerInvariant(
    data.ClobFill.map((f) => {
      const asMaker = (f.maker ?? "").toLowerCase() === acct;
      return {
        id: f.id,
        fillPrice: f.fillPrice,
        quantity: f.quantity,
        timestamp: f.timestamp,
        txHash: f.txHash,
        asMaker,
        side: asMaker ? f.makerSide : (f.takerOrder?.side ?? null),
        counterparty: asMaker ? (f.takerOrder?.owner ?? null) : (f.maker ?? null),
        market: f.market,
      };
    }),
  );

  return {
    account: acct,
    // Stamp the cadence label onto each position's / order's market (same as
    // trades above) so an ACTIVE position row can show its contract duration
    // ("15m" / "1h") — the reported DEX-1880 gap.
    positions: IndexerRead.narrowIndexerInvariant<PortfolioPosition>(
      data.OutcomeBalance.map((p) => ({
        ...p,
        market: p.market ? { ...p.market, interval: Interval.marketIntervalLabel(p.market) } : null,
      })),
    ),
    openOrders: IndexerRead.narrowIndexerInvariant<PortfolioOrder>(
      data.ClobOrder.map((o) => ({
        ...o,
        market: o.market ? { ...o.market, interval: Interval.marketIntervalLabel(o.market) } : null,
      })),
    ),
    trades,
    // Newest-first page: a FULL page means older fills were dropped, not that trading stopped.
    // `tradesLimit: 0` asks for no trades at all, so an empty list there is complete, not cut.
    tradesTruncated: tradesLimit > 0 && trades.length >= tradesLimit,
  };
}

/**
 *  Binary market context attached to positions and open orders — selected
 *  identically in both, so it exists once here (aliasing `clobStatus` → `status`
 *  the same way {@link MarketFields} does).
 */
// prettier-ignore
const PortfolioMarketFields = graphql(`
  fragment PortfolioMarketFields on Market {
    id
    marketAddress
    poolAddress
    asset
    question
    status: clobStatus
    lastPrice
    strike
    expiry
    winningOutcome
    voided
    quoteDecimals
    intervalSec
  }
`);

/**
 * Identifies one owner's claimable balance in one pool vault — see {@link SomniaMarketsClient.getVaultBalance | client.getVaultBalance}.
 *
 * @category binary markets
 */
export interface GetVaultBalanceParams {
  /** The ERC20Vault address (the pool address). */
  vault: Address;
  /** The balance's owner. */
  owner: Address;
  /** The ERC-20 address (or the vault's native sentinel). */
  token: Address;
}

/**
 *  LIVE claimable balance an owner can withdraw from an ERC20Vault (a pool's
 *  internal vault) for `token`, raw units — the current value behind the
 *  append-only `VaultPayoutFallback` history.
 */
export async function getVaultBalance(p: GetVaultBalanceParams, client: PublicClient): Promise<bigint> {
  return client.readContract({
    address: p.vault,
    abi: ReadsAbi.erc20VaultReadAbi,
    functionName: "getWithdrawableBalance",
    args: [p.owner, p.token],
  });
}

/**
 * Identifies one ERC-6909 outcome position — see `getOutcomeBalance`.
 *
 * @category binary markets
 */
export interface GetOutcomeBalanceParams {
  /** The outcome-token singleton address (from `MarketOnchain`). */
  outcomeToken: Address;
  /** The balance's owner. */
  account: Address;
  /** The position id — the market's `yesId`/`noId`. */
  id: bigint;
}

/**
 *  ERC-6909 outcome-token balance of `account` for position `id` on the shared
 *  outcome-token singleton (raw).
 */
export async function getOutcomeBalance(p: GetOutcomeBalanceParams, client: PublicClient): Promise<bigint> {
  return client.readContract({
    address: p.outcomeToken,
    abi: ReadsAbi.erc6909Abi,
    functionName: "balanceOf",
    args: [p.account, p.id],
  });
}

/**
 *  A vault-credit fallback record (mirror of the indexer `VaultPayoutFallback`
 *  entity) — an append-only history of payouts that could not be delivered to
 *  the wallet and were credited to the owner's ERC20Vault balance instead. This
 *  is the HISTORY layer; for the live claimable amount read
 *  {@link SomniaMarketsClient.getVaultBalance | client.getVaultBalance}. Amounts are raw token units.
 *
 * @category binary markets
 */
export type VaultPayoutFallback = {
  /** Record id (`${blockNumber}_${logIndex}`). */
  id: string;
  /** Credited owner (lowercased). */
  owner: string;
  /** Credited token (lowercased). */
  token: string;
  /** Amount credited to the vault balance (raw token units). */
  amount: string;
  /** Market id the fallback was emitted for (lowercased). */
  market: string;
  /** Timestamp (unix seconds) of the credit. */
  timestamp: string;
  /** Tx hash the credit landed in. */
  txHash: string;
};

/**
 *  An owner's vault-credit fallback history, newest first — optionally scoped to
 *  one token, paginated. The live claimable balance is a chain read
 *  ({@link SomniaMarketsClient.getVaultBalance | client.getVaultBalance}); this is the append-only credit log.
 */
export async function getVaultPayoutFallbacks(
  owner: string,
  opts: { token?: string; limit?: number; offset?: number } = {},
  indexerUrl: string,
): Promise<VaultPayoutFallback[]> {
  const where: Record<string, unknown> = { owner: { _eq: owner.toLowerCase() } };
  if (opts.token != null) where.token = { _eq: opts.token.toLowerCase() };
  const data = await IndexerRead.gqlRequest(VaultPayoutFallbacksQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.VaultPayoutFallback;
}

// prettier-ignore
const PortfolioQuery = graphql(`
  query Portfolio($acct: String!, $fillWhere: Fill_bool_exp!, $ordersLimit: Int, $tradesLimit: Int) {
    OutcomeBalance(
      where: { account: { _eq: $acct }, balance: { _gt: "0" } }
      order_by: { balance: desc }
      limit: 200
    ) {
      outcomeIndex
      tokenId
      balance
      market {
        ...PortfolioMarketFields
      }
    }
    ClobOrder: Order(
      where: {
        owner: { _eq: $acct }
        status: { _eq: "Open" }
        market: { marketType: { _eq: "BINARY" } }
      }
      order_by: { placedAtTimestamp: desc }
      limit: $ordersLimit
    ) {
      id
      orderId
      side
      price
      quantityRemaining
      filledQuantity
      fullQuantity
      placedAtTimestamp
      placedTxHash
      market {
        ...PortfolioMarketFields
      }
    }
    ClobFill: Fill(where: $fillWhere, order_by: { timestamp: desc }, limit: $tradesLimit) {
      id
      fillPrice
      quantity
      timestamp
      txHash
      maker
      makerSide
      takerOrder {
        owner
        side
      }
      market {
        marketAddress
        asset
        quoteDecimals
      }
    }
  }
`);

// prettier-ignore
const OutcomeBalancesQuery = graphql(`
  query OutcomeBalances($acct: String!, $mkt: String!) {
        OutcomeBalance(where: {account: {_eq: $acct}, market: {marketAddress: {_eq: $mkt}}}) { outcomeIndex balance }
      }
`);

// prettier-ignore
const VaultPayoutFallbacksQuery = graphql(`
  query VaultPayoutFallbacks($where: VaultPayoutFallback_bool_exp!, $limit: Int, $offset: Int) {
         VaultPayoutFallback(where: $where, order_by: {timestamp: desc}, limit: $limit, offset: $offset) {
           id owner token amount market: market_id timestamp txHash
         }
       }
`);
