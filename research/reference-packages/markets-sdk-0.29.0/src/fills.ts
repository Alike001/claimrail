// Fills — the executed-trade tape, shared across every market kind.
//
// One `Fill` entity serves spot, perp and binary (the OrderBook core emits one
// `OrderFilled` for all of them), so this is a SHARED concept rather than a
// per-kind one: `pool` scopes a query to a VENUE CONTRACT and the rows carry
// whatever kind that pool hosts, while `market_id` scopes it to one market.
// The two differ only on binary, where a pool is recycled across successive
// markets — there, pool locates the contract and market id identifies one
// market life on it. On spot/perp the market id IS the pool address.
//
// Read-only by nature — a fill is something the chain did, never something a
// caller asks for. Errors propagate (see CONVENTIONS.md): an empty array means
// "no fills", never "the read failed".

import { type ResultOf } from "@graphql-typed-document-node/core";
import * as IndexerRead from "./indexerRead.js";
import { graphql } from "./gql/gql.js";
import type { BinaryFillKind, BinarySide, OrderStatus } from "./store.js";
import type { BuilderFeeRecord, ProtocolFeeRecord } from "./fees.js";
import type { Market } from "./markets.js";
import { toMarket } from "./markets.js";


/**
 * Options for {@link SomniaMarketsClient.getFills} / {@link SomniaMarketsClient.getUserFills}. All optional.
 *
 * @category fills
 */
export type FillsOptions = {
  /** Max rows (default 50). */
  limit?: number;
  /** Row offset for paging the tape (default 0). */
  offset?: number;
  /** Only fills at/after this unix-seconds timestamp. */
  since?: number;
  /** Only fills at/before this unix-seconds timestamp. */
  until?: number;
};

/**
 *  Scope for the per-account fill reads
 *  ({@link SomniaMarketsClient.getUserFills} /
 *  {@link SomniaMarketsClient.countUserFills}): a `market` (or `markets`) and/or
 *  `pool` predicate on top of {@link FillsOptions}.
 *
 *  Prefer `market` on binary. A binary pool is recycled by successive markets,
 *  so `pool` selects every life of that pool, while `market` selects exactly one
 *  market. On spot/perp the market id IS the pool address, so the two agree.
 *
 * @category fills
 */
export type FillsScope = FillsOptions & {
  /** Only fills in this market (bytes32 marketId, case-insensitive). */
  market?: string;
  /**
   *  Only fills in ANY of these markets (bytes32 marketIds, case-insensitive)
   *  — the batched form of `market`, for folding several markets from one read.
   *  An empty array matches nothing. Supplying `market` as well narrows to both
   *  (the intersection), so neither silently overrides the other.
   */
  markets?: readonly string[];
  /** Only fills on this pool address (case-insensitive). */
  pool?: string;
};

// prettier-ignore
const FillQueryFields = graphql(`
  fragment FillQueryFields on Fill {
    id
    market: market_id
    pool
    fillPrice
    quantity
    quoteQuantity
    maker
    makerSide
    taker
    takerSide
    kind
    takerIsBid
    makerOrderId
    takerOrderId
    timestamp
    txHash
    # The taker's ORDER, not just the denormalized copy on the fill. On binary
    # the fill's takerSide is backfilled by the PendingTakerFill bridge only
    # once BinaryOrderPlaced lands, so it can still be null on a row whose
    # taker is already stamped. The Order carries the authoritative side from
    # the moment it exists, which is what the portfolio reads have always used.
    takerOrder { owner side }
  }
`);

/**
 *  Recent fills for a pool (either market type), newest first — a one-shot
 *  indexer query. For a continuously-updating trade tape on a binary pool, use
 *  the live-store reader `getLiveFills` (or the `useLiveFills` hook) instead.
 *
 * **Details**
 *
 * - `pool`: Pool address (case-insensitive).
 * - `opts`: Paging + `since`/`until` window ({@link FillsOptions}).
 */
export async function getFills(pool: string, opts: FillsOptions = {}, indexerUrl: string): Promise<FillRow[]> {
  const where = applyFillWindow({ pool: { _eq: pool.toLowerCase() } }, opts);
  const data = await IndexerRead.gqlRequest(FillsQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.Fill;
}

/**
 *  Fills a user participated in (as maker OR taker), newest first — the one-shot
 *  indexer counterpart to the live-store `getLiveUserFills`. Optionally scoped to
 *  one market and/or pool and/or a `since`/`until` window.
 *
 *  Scope by `market` (or `markets` for several) to get those markets' fills: on
 *  binary a pool is recycled across successive markets, so `pool` alone also
 *  returns the fills of that pool's earlier lives. Every predicate runs at the
 *  indexer, so the `limit` applies to the rows you asked for rather than to a
 *  mixed set.
 */
export async function getUserFills(
  account: string,
  opts: FillsScope = {},
  indexerUrl: string,
): Promise<FillRow[]> {
  const acct = account.toLowerCase();
  const where = applyFillScope({ _or: participatedAs(acct) }, opts);
  const data = await IndexerRead.gqlRequest(UserFillsQuery,
    { where, limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    indexerUrl,
  );
  return data.Fill;
}

/**
 *  One fill by its id (`${blockNumber}_${logIndex}`) with both parties' order
 *  linkage and the market it executed on — the single lookup behind a fill
 *  detail view. Null when the id isn't indexed (yet — the indexer can lag a
 *  just-executed fill by a beat).
 */
export async function getFill(id: string, indexerUrl: string): Promise<FillDetail | null> {
  const data = await IndexerRead.gqlRequest(FillDetailQuery, { id }, indexerUrl);
  const f = data.Fill[0];
  if (!f) return null;
  const { marketRef, ...rest } = f;
  // `marketRef` is a nullable RELATIONSHIP whose owning `market_id` is `String!`
  // — never actually absent (same asserted invariant as getOrders' pool).
  return { ...rest, marketRef: IndexerRead.narrowIndexerInvariant<MarketRef>([marketRef])[0]! };
}

/**
 *  Every fill one order participated in — either side, newest first. Order ids
 *  are never reused (monotonic low-64 counter per pool), so `(pool, orderId)`
 *  names exactly one order forever. Rides the (pool, timestamp) composite index
 *  down to one pool before the order-id filter.
 */
export async function getOrderFills(
  pool: string,
  orderId: bigint | string,
  opts: { limit?: number } = {},
  indexerUrl: string,
): Promise<OrderFillRow[]> {
  const oid = orderId.toString();
  const data = await IndexerRead.gqlRequest(OrderFillsQuery,
    { pool: pool.toLowerCase(), oid, limit: opts.limit ?? 200 },
    indexerUrl,
  );
  return data.Fill;
}

/**
 *  Server-side COUNT of the fills `account` participated in (maker OR taker),
 *  optionally scoped to one market and/or pool + a `since`/`until` window — a
 *  history-page total without fetching rows (Hasura `Fill_aggregate`, bounded fallback on
 *  the public role).
 *
 *  WITHOUT THAT HEADER THE TOTAL IS A LOWER BOUND. The fallback scan stops at
 *  {@link IndexerRead.COUNT_FALLBACK_CAP} rows and reports the cap, and `Fill`
 *  is the deepest counted table in production. No bounded variant of this helper
 *  exists yet; `countMarketsBounded` on the client is the pattern to copy.
 */
export async function countUserFills(
  account: string,
  opts: FillsScope = {},
  indexerUrl: string,
  headers?: Record<string, string>,
): Promise<number> {
  const acct = account.toLowerCase();
  const where = applyFillScope({ _or: participatedAs(acct) }, opts);
  return IndexerRead.aggregateCount("Fill", "Fill_bool_exp", where, indexerUrl, headers);
}

/**
 *  One fill as the indexer recorded it (mirror of the unified `Fill` entity —
 *  spot, perp and binary fills share it).
 *
 * @category fills
 */
export type FillRow = {
  /** Fill id (`${blockNumber}_${logIndex}`). */
  id: string;
  /**
   *  The market's bytes32 marketId — the STABLE identity of the market this fill
   *  executed in.
   *
   *  Group and label by this, never by `pool` alone: a binary pool is recycled
   *  across successive markets, so fills from a pool's earlier life carry the
   *  same pool address as the market currently on it. On SPOT/PERP the pool
   *  address IS the market id. Pass it to
   *  {@link SomniaMarketsClient.getMarket | client.getMarket} for the full row.
   */
  market: string;
  /**
   *  Lowercased pool address the fill executed on. A TIME-VARYING binding — see
   *  `market` for the identity that does not move.
   */
  pool: string;
  /**
   *  Execution price, raw quote units per whole base (binary: YES-probability
   *  scale). SPOT/PERP: the maker's limit price.
   */
  fillPrice: string;
  /** Base/outcome-token quantity filled, raw units. */
  quantity: string;
  /** Quote/collateral value = quantity × fillPrice / 10^baseDecimals (raw, floored). */
  quoteQuantity: string;
  /** Maker (resting) wallet, lowercased; null when unknown. */
  maker: string | null;
  /** BINARY only — the maker's YES/NO side; null on SPOT/PERP. */
  makerSide: BinarySide | null;
  /**
   *  Taker wallet, lowercased. Denormalized from the taker's OrderPlaced (which
   *  fires after the fill in the same tx) — null until that bridge lands.
   */
  taker: string | null;
  /**
   *  BINARY only — the taker's YES/NO side; null on SPOT/PERP or until the
   *  taker's OrderPlaced is bridged.
   */
  takerSide: BinarySide | null;
  /**
   *  BINARY only — how the fill settled (direct trade vs mint/burn of a pair);
   *  null on SPOT/PERP or until the taker side is known.
   */
  kind: BinaryFillKind | null;
  /**
   *  True when the taker bought the base/YES (the maker was the ask); null until
   *  the taker side is known.
   */
  takerIsBid: boolean | null;
  /**
   *  The taker's ORDER (owner + side), when the indexer has it.
   *
   *  Prefer `takerOrder.side` over {@link FillRow.takerSide} on binary: the
   *  latter is a denormalized copy the taker bridge backfills, so it lags and
   *  can be null on a row that already names its taker.
   */
  takerOrder: { owner: string; side: BinarySide | null } | null;
  /** uint128 id of the resting (maker) order, decimal string. */
  makerOrderId: string;
  /** uint128 id of the aggressing (taker) order, decimal string. */
  takerOrderId: string;
  /** Timestamp (unix seconds) of the fill. */
  timestamp: string;
  /** Tx hash the fill landed in. */
  txHash: string;
};

/**
 *  A fill with its order linkage — {@link FillRow} plus the two order ids and
 *  the post-fill remainders. What {@link SomniaMarketsClient.getOrderFills} returns.
 */
export type OrderFillRow = FillRow & {
  /** Taker order's unfilled remainder AFTER this fill, raw units. */
  takerRemainingQuantity: string;
  /** Maker order's unfilled remainder AFTER this fill, raw units. */
  makerRemainingQuantity: string;
  /** Block the fill landed in (decimal string). */
  blockNumber: string;
  /** Log index within the block (with blockNumber: the fill's id). */
  logIndex: number;
};

/**
 *  The market a fill/order belongs to, as detail reads embed it — enough to
 *  label and scale the row (symbols + decimals) and route to the market's page,
 *  without dragging in the full per-kind {@link Market} union.
 */
export type MarketRef = {
  /** Market entity id (pool address for SPOT/PERP; marketId bytes32 for BINARY). */
  id: string;
  marketType: "SPOT" | "PERP" | "BINARY";
  /** Lowercased pool address serving the market. */
  poolAddress: string;
  /** BinaryMarket contract address; null on SPOT/PERP. */
  marketAddress: string | null;
  baseSymbol: string | null;
  quoteSymbol: string | null;
  baseDecimals: number;
  quoteDecimals: number;
  /** Underlying asset label (BINARY); null on SPOT/PERP. */
  asset: string | null;
  /** The market's question text (BINARY); null on SPOT/PERP. */
  question: string | null;
};

/**
 *  {@link OrderFillRow} plus the market it executed on — one fill, fully framed.
 *
 *  The embed is `marketRef`, not `market`, because the name is already taken:
 *  {@link FillRow.market} is the bytes32 marketId STRING (aliased from
 *  `market_id` in `FillQueryFields`, load-bearing for binary-PnL market
 *  scoping). Two fields cannot share it — GraphQL refuses to select the
 *  `market` relationship alongside the `market: market_id` alias, and the TS
 *  intersection `string & MarketRef` is uninhabitable.
 */
export type FillDetail = OrderFillRow & { marketRef: MarketRef };

/**
 *  The two seats an account can occupy on a fill, as indexed columns.
 *
 *  Both are `@index`ed on the `Fill` entity, so this is two index seeks OR-ed
 *  together (SDK-IO-004).
 *
 *  **Why the taker ORDER's owner is not a third arm.** It used to be, on the
 *  belief that `Fill.taker` was denormalized only on spot and was null on
 *  binary. That belief is stale: `backfillTakerFills` in the indexer's
 *  `handlers/orderbook.ts` is called from `OrderPlaced` for SPOT, PERP *and*
 *  binary, and stamps the taker address unconditionally — "still stamp the
 *  taker address so it is never lost" — keeping the bridge open afterwards only
 *  to await the binary `takerSide`/`kind`. The taker's order is always placed in
 *  the SAME transaction as the fill it crosses (a resting order occupies the
 *  maker seat by definition), so no committed row can lack it. The indexer's own
 *  `schema.graphql` says as much (`takerOrder: Order!`), though Hasura re-exposes
 *  the relationship as nullable — which is why every call site still uses `?.`.
 *  The non-null guarantee that survives to the wire is `takerOrder_id: String!`:
 *  every fill names a taker order, whether or not the join is proved.
 *
 *  The arm was therefore matching rows the first two already matched, and it was
 *  not free. A relationship predicate compiles to a correlated `EXISTS`
 *  subquery, which Postgres cannot combine with a bitmap OR over the `maker`
 *  and `taker` indexes. The plan walks the `timestamp` index backwards and tests
 *  each row, so the cost is set by how far it must walk to fill `limit` — and
 *  with the arm, every row walked past costs a lookup into `Order`.
 *
 *  That makes the penalty worst for the accounts that matter most. A busy
 *  market maker whose fills are dense in recent history reaches `limit` quickly
 *  and barely notices. An ORDINARY wallet is sparse in a table the bots fill, so
 *  the scan runs long and pays the subquery the whole way down. Measured against
 *  the development indexer, sweeping four real single-fill wallets took 2.78s,
 *  4.50s, 8.75s and 10.93s with the arm, against 0.04s, 0.41s, 0.26s and 0.27s
 *  without it — 11x to 72x. A wallet with no fills at all showed the same shape:
 *  a median 2,035ms to return nothing, against 28ms.
 *
 *  `takerOrder { owner side }` stays in the SELECTION set — `side` is what the
 *  binary lens reads when the fill's own `takerSide` copy is still lagging, and
 *  selecting a non-null relationship is an ordinary join, not a filter.
 *
 *  What makes the invariant hold rather than merely happen to be true: the
 *  indexer writes `Fill.taker` and `Order.owner` from the SAME local in the SAME
 *  handler (`applyOrderPlaced` passes its `owner` both into the Order row and
 *  into `backfillTakerFills`), so the two cannot disagree — delegated and
 *  operator-placed orders included.
 *
 *  `sdk-e2e/test/query.test.ts` asserts it against a live indexer, but that suite
 *  is `test:reads` and CI runs only `test:unit` — so it is a hand-run check, not
 *  a gate. Run it after any change to the indexer's taker backfill.
 */
function participatedAs(acct: string): Record<string, unknown>[] {
  return [{ maker: { _eq: acct } }, { taker: { _eq: acct } }];
}

/**
 *  Add the `market` / `pool` / `since` / `until` predicates a {@link FillsScope}
 *  supplies to a Fill `where` object. Only supplied values are added, so an
 *  omitted field never narrows the query (SDK-IO-004).
 */
function applyFillScope(where: Record<string, unknown>, opts: FillsScope): Record<string, unknown> {
  const marketId: Record<string, unknown> = {};
  if (opts.market != null) marketId._eq = opts.market.toLowerCase();
  if (opts.markets != null) marketId._in = opts.markets.map((m) => m.toLowerCase());
  if (Object.keys(marketId).length) where.market_id = marketId;
  if (opts.pool != null) where.pool = { _eq: opts.pool.toLowerCase() };
  return applyFillWindow(where, opts);
}

/** Add a `since`/`until` window to a Fill `where` object (unix seconds). */
function applyFillWindow(where: Record<string, unknown>, opts: FillsOptions): Record<string, unknown> {
  const ts: Record<string, number> = {};
  if (opts.since != null) ts._gte = opts.since;
  if (opts.until != null) ts._lte = opts.until;
  if (Object.keys(ts).length) where.timestamp = ts;
  return where;
}

/**
 *  One side's order on a fill — the resting order, or the one that crossed it.
 *
 *  A narrower shape than {@link OrderRow}: this describes an order in the context
 *  of a fill whose market is already known, so it carries no market labelling.
 *  Amounts are raw units.
 */
export type FillOrder = {
  /** Order id (`${pool}_${orderId}`). */
  id: string;
  /** uint128 OrderId as a decimal string. */
  orderId: string;
  /** Owner wallet, lowercased. */
  owner: string;
  /**
   *  True = bid (buy). Set on every market kind, unlike `side`, which the indexer
   *  fills in only for binary.
   */
  isBid: boolean;
  /** BINARY only — the YES/NO side; null on spot and perp. */
  side: BinarySide | null;
  /** Limit price, raw quote units per whole base. */
  price: string;
  /** Original size, raw base/outcome units. */
  fullQuantity: string;
  /** Cumulative filled size, raw base/outcome units. */
  filledQuantity: string;
  /** Unfilled remainder, raw base/outcome units. */
  quantityRemaining: string;
  /** Reconciled lifecycle status (Open/Filled/Cancelled/Expired/Closed). */
  status: OrderStatus;
  /** Whether the order ever rested on the book (an `OrderRested` fired). */
  rested: boolean;
  /**
   *  WHY the PROTOCOL cancelled the order, when it was not the owner. Null for an
   *  owner cancel and for an order that was never cancelled — so a `Cancelled`
   *  status with a null reason means the owner did it.
   */
  cancelReason: string | null;
  /** Timestamp (unix seconds) the order was placed. */
  placedAtTimestamp: string;
  /** Transaction the order was PLACED in — usually not the fill's transaction. */
  placedTxHash: string;
};

/**
 *  Everything the indexer knows about ONE fill: the trade itself, the market it
 *  executed in, both sides' orders, the fees it paid, and the other fills its
 *  transaction produced.
 *
 *  The shape of a trade detail view. Each piece may be absent on its own terms —
 *  see the field docs — and absence is normal rather than an error.
 *
 *  Distinct from {@link FillDetail}, which is the one-query lookup behind
 *  {@link SomniaMarketsClient.getFill}: that names the fill and its market, this
 *  adds the surrounding CONTEXT — both orders resolved, the fees, the rest of the
 *  transaction — at the cost of a second round-trip. A caller that only needs to
 *  render the trade wants `getFill`.
 */
export type TradeContext = {
  /** The fill, with its block position and post-fill remainders. */
  fill: OrderFillRow;
  /**
   *  The market the fill executed in; null only when the indexer has no market
   *  row for it (an unregistered pool).
   */
  market: Market | null;
  /**
   *  The resting order that was filled; null until the indexer has that order's
   *  row.
   */
  makerOrder: FillOrder | null;
  /** The aggressing order that crossed the book; null until its row is indexed. */
  takerOrder: FillOrder | null;
  /**
   *  The OTHER fills of the same transaction, newest first — the rest of a
   *  taker's sweep. Empty when this fill was the whole trade. Excludes this fill.
   */
  siblings: OrderFillRow[];
  /**
   *  Protocol fees charged in the same transaction. BINARY only, and empty when
   *  no fee was skimmed.
   *
   *  Transaction-scoped, not fill-scoped: a fee record names the ORDER it was
   *  charged on, not the fill, so a multi-fill sweep cannot be split into
   *  per-fill fees. Match `orderId` against the fill's `makerOrder`/`takerOrder`
   *  to attribute what can be attributed.
   */
  protocolFees: ProtocolFeeRecord[];
  /** Builder fees charged in the same transaction, on the same terms as {@link TradeContext.protocolFees}. */
  builderFees: BuilderFeeRecord[];
};

/**
 *  One fill in full, by id — the trade, its market, both orders, its fees, and
 *  the rest of its transaction.
 *
 *  This is the read behind a trade detail view. Use it when a caller has picked
 *  ONE trade out of a tape or activity feed and wants everything about it;
 *  {@link getFills} and `getMarketActivity` are the list reads that produce the id.
 *
 *  Returns `null` when no fill has this id — a mistyped or stale link, not a
 *  failure. A failed read throws (SDK-IO-002).
 *
 *  Two round-trips: the fill (with its market and both orders) has to resolve
 *  before its transaction's siblings and fees can be selected, because those are
 *  anchored on the fill's timestamp so the indexer can serve them from an index.
 *
 *  @param id - Fill id, `${blockNumber}_${logIndex}` (as `FillRow.id` carries it).
 *  @throws {@link IndexerError} when the indexer read fails.
 *
 *  ```ts
 *  const detail = await client.getTradeContext("441083911_5");
 *  if (detail) {
 *    console.log(detail.fill.fillPrice, detail.makerOrder?.owner, detail.siblings.length);
 *  }
 *  ```
 */
export async function getTradeContext(id: string, indexerUrl: string): Promise<TradeContext | null> {
  const head = await IndexerRead.gqlRequest(TradeContextQuery, { id }, indexerUrl);
  const row = head.Fill_by_pk;
  if (row == null) return null;

  const fill = toTradeFill(row);
  // Anchored on `timestamp`, indexed on all three entities, with `txHash` as
  // the narrowing predicate. `Fill.txHash` gained an `@index` in this release,
  // but the anchor stays: it is the predicate the OTHER two entities are served
  // by, and it costs nothing here.
  const rest = await IndexerRead.gqlRequest(
    FillTxContextQuery,
    { timestamp: fill.timestamp, txHash: fill.txHash, market: fill.market, id: fill.id },
    indexerUrl,
  );
  return {
    fill,
    market: row.market == null ? null : toMarket(row.market),
    makerOrder: row.makerOrder == null ? null : toFillOrder(row.makerOrder),
    takerOrder: row.takerOrder == null ? null : toFillOrder(row.takerOrder),
    siblings: rest.Fill.map(toTradeFill),
    protocolFees: rest.ProtocolFeeRecord,
    builderFees: rest.BuilderFeeRecord,
  };
}

/** Map a fill row to the public {@link OrderFillRow}. */
function toTradeFill(r: ResultOf<typeof TradeContextFillFields>): OrderFillRow {
  return {
    id: r.id,
    market: r.market_id,
    pool: r.pool,
    makerOrderId: r.makerOrderId,
    takerOrderId: r.takerOrderId,
    takerRemainingQuantity: r.takerRemainingQuantity,
    makerRemainingQuantity: r.makerRemainingQuantity,
    fillPrice: r.fillPrice,
    quantity: r.quantity,
    quoteQuantity: r.quoteQuantity,
    maker: r.maker,
    makerSide: r.makerSide,
    taker: r.taker,
    takerSide: r.takerSide,
    kind: r.kind,
    takerIsBid: r.takerIsBid,
    takerOrder: r.takerOrder == null ? null : { owner: r.takerOrder.owner, side: r.takerOrder.side },
    timestamp: r.timestamp,
    txHash: r.txHash,
    blockNumber: r.blockNumber,
    logIndex: r.logIndex,
  };
}

/** Map an order row to the public {@link FillOrder}. */
function toFillOrder(o: ResultOf<typeof FillOrderFields>): FillOrder {
  return {
    id: o.id,
    orderId: o.orderId,
    owner: o.owner,
    isBid: o.isBid,
    side: o.side,
    price: o.price,
    fullQuantity: o.fullQuantity,
    filledQuantity: o.filledQuantity,
    quantityRemaining: o.quantityRemaining,
    status: o.status,
    rested: o.rested,
    cancelReason: o.cancelReason,
    placedAtTimestamp: o.placedAtTimestamp,
    placedTxHash: o.placedTxHash,
  };
}

// ---------------------------------------------------------------------------
// Typed documents for the reads above. Hoisted here (rather than inline at each
// call site) to keep this file's reading order: functions first, GraphQL after.
// Result and variable types are derived from the committed schema snapshot.

// prettier-ignore
const FillsQuery = graphql(`
  query Fills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {
        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {
          ...FillQueryFields
        }
      }
`);

// prettier-ignore
const UserFillsQuery = graphql(`
  query UserFills($where: Fill_bool_exp!, $limit: Int, $offset: Int) {
        Fill(where: $where, order_by: [{timestamp: desc}, {blockNumber: desc}], limit: $limit, offset: $offset) {
          ...FillQueryFields
        }
      }
`);

// prettier-ignore
/**
 *  The selection behind {@link MarketRef}, declared ONCE. Both detail reads land
 *  their row through `narrowIndexerInvariant`, an unchecked cast — so a field
 *  added to `MarketRef` and to only one of two copied selections would surface
 *  as `undefined` at runtime with no type error. One fragment removes that.
 */
export const MarketRefFields = graphql(`
  fragment MarketRefFields on Market {
    id marketType poolAddress marketAddress baseSymbol quoteSymbol
    baseDecimals quoteDecimals asset question
  }
`);

// prettier-ignore
const FillDetailQuery = graphql(`
  query FillDetail($id: String!) {
        Fill(where: { id: { _eq: $id } }, limit: 1) {
          ...FillQueryFields
          takerRemainingQuantity makerRemainingQuantity
          blockNumber logIndex
          marketRef: market { ...MarketRefFields }
        }
      }
`);

// prettier-ignore
const OrderFillsQuery = graphql(`
  query OrderFills($pool: String!, $oid: numeric!, $limit: Int) {
        Fill(
          where: { pool: { _eq: $pool }, _or: [{ takerOrderId: { _eq: $oid } }, { makerOrderId: { _eq: $oid } }] }
          order_by: [{timestamp: desc}, {blockNumber: desc}]
          limit: $limit
        ) {
          ...FillQueryFields
          takerRemainingQuantity makerRemainingQuantity
          blockNumber logIndex
        }
      }
`);

// The trade-detail documents. `TradeContextFillFields` selects everything FillQueryFields
// does plus the block position, and is reused for the sibling rows so one mapper
// serves both. The market row is selected through `MarketRowFields` so `toMarket`
// can narrow it — the same seam every other market read uses.

// prettier-ignore
const TradeContextFillFields = graphql(`
  fragment TradeContextFillFields on Fill {
    id
    market_id
    pool
    fillPrice
    quantity
    quoteQuantity
    maker
    makerSide
    taker
    takerSide
    kind
    takerIsBid
    takerOrder { owner side }
    makerOrderId
    takerOrderId
    takerRemainingQuantity
    makerRemainingQuantity
    blockNumber
    timestamp
    logIndex
    txHash
  }
`);

// prettier-ignore
const FillOrderFields = graphql(`
  fragment FillOrderFields on Order {
    id
    orderId
    owner
    isBid
    side
    price
    fullQuantity
    filledQuantity
    quantityRemaining
    status
    rested
    cancelReason
    placedAtTimestamp
    placedTxHash
  }
`);

// prettier-ignore
const TradeContextQuery = graphql(`
  query TradeContext($id: String!) {
         Fill_by_pk(id: $id) {
           ...TradeContextFillFields
           market { ...MarketFields }
           makerOrder { ...FillOrderFields }
           takerOrder { ...FillOrderFields }
         }
       }
`);

// prettier-ignore
const FillTxContextQuery = graphql(`
  query FillTxContext($timestamp: numeric!, $txHash: String!, $market: String!, $id: String!) {
         Fill(
           where: {timestamp: {_eq: $timestamp}, txHash: {_eq: $txHash}, id: {_neq: $id}}
           order_by: [{blockNumber: desc}, {logIndex: desc}]
           limit: 100
         ) {
           ...TradeContextFillFields
         }
         ProtocolFeeRecord(
           where: {market_id: {_eq: $market}, timestamp: {_eq: $timestamp}, txHash: {_eq: $txHash}}
           order_by: {id: asc}
           limit: 100
         ) {
           ...ProtocolFeeFields
         }
         BuilderFeeRecord(
           where: {market_id: {_eq: $market}, timestamp: {_eq: $timestamp}, txHash: {_eq: $txHash}}
           order_by: {id: asc}
           limit: 100
         ) {
           ...BuilderFeeFields
         }
       }
`);
