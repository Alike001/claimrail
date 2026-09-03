// Market activity — the transaction feed of one market.
//
// This module answers one question: what has happened on this market, in the
// order it happened? The indexer records each answer in its own entity, one per
// event shape. A `Fill` is a trade. A `RouterActionRecord` is a complete-set
// mint, a merge, or a redemption. A `MarketResolutionEvent` is the oracle
// settling the market. A `MarketStatusUpdate` is a lifecycle transition. A
// caller that wants the market's history needs all four, interleaved by time.
//
// The concept here is the interleaving. Each source entity already has an owner
// module (`fills`, `router`, `markets`, `binary/settlement`), and each of those
// answers a different question — one stream, for one purpose, in its own shape.
// This module owns the merged view: one timeline, one row type, one round-trip.
// It is a SHARED concept, because a market of every kind has a timeline; the
// binary-only streams simply return nothing on spot and perp.
//
// Read-only by nature. Activity is what the chain did, never something a caller
// asks for. Errors propagate (see CONVENTIONS.md): an empty array means "this
// market has no activity in the window", never "the read failed".

import { type ResultOf } from "@graphql-typed-document-node/core";
import * as IndexerRead from "./indexerRead.js";
import { graphql } from "./gql/gql.js";
import type { BinaryMarketStatus, BinarySide } from "./store.js";
import type { FillOrder } from "./fills.js";
import type { BuilderFeeRecord, ProtocolFeeRecord } from "./fees.js";
import type { Market } from "./markets.js";
import * as Markets from "./markets.js";

/**
 *  What a {@link MarketActivity} row records.
 *
 *  `TRADE` occurs on every market kind. The other five are binary-only, because
 *  complete sets, oracle resolution and the market lifecycle exist only there —
 *  a spot or perp market yields `TRADE` rows and nothing else.
 */
export type MarketActivityKind =
  /** A fill: two orders crossed. */
  | "TRADE"
  /** Collateral became a complete set of outcome tokens. */
  | "MINT_SET"
  /** A complete set of outcome tokens became collateral again. */
  | "MERGE_SET"
  /** Outcome tokens were burned for their settled value. */
  | "REDEEM"
  /** The oracle settled, skipped or failed the market. */
  | "RESOLUTION"
  /** The market moved between lifecycle states. */
  | "STATUS";

/**
 *  The fields every {@link MarketActivity} row carries, whatever its kind.
 *
 *  Sort and page on `timestamp`. Group by `txHash` to recover the rows that one
 *  transaction produced — a taker order that also minted a set writes a `TRADE`
 *  and a `MINT_SET` under the same hash.
 */
export type MarketActivityBase = {
  /**
   *  Feed-unique row id, `${kind}:${entityId}`.
   *
   *  Prefixed because the source entities number their ids independently: a
   *  `Fill` and a `MarketStatusUpdate` in the same block and log position share
   *  an entity id. Stable across reads, so it is safe as a list key.
   */
  id: string;
  /** Kind discriminator — narrow on this. */
  kind: MarketActivityKind;
  /** The market's bytes32 marketId, lowercased. */
  market: string;
  /** Timestamp (unix seconds) of the block the row landed in. */
  timestamp: string;
  /** Block the row landed in (decimal string). */
  blockNumber: string;
  /** Transaction the row landed in. */
  txHash: string;
};

/**
 *  A trade: one fill of one resting order by one incoming order.
 *
 *  Amounts are raw units. `fillPrice` is quote units per whole base — on binary,
 *  the YES-probability scale.
 */
export type MarketTradeActivity = MarketActivityBase & {
  kind: "TRADE";
  /** Pool the fill executed on, lowercased. */
  pool: string;
  /** Execution price, raw quote units per whole base. */
  fillPrice: string;
  /** Base/outcome quantity filled, raw units. */
  quantity: string;
  /** Quote/collateral value of the fill, raw units. */
  quoteQuantity: string;
  /** Maker (resting) wallet, lowercased; null when the indexer has not joined it. */
  maker: string | null;
  /** BINARY only — the maker's YES/NO side; null on spot and perp. */
  makerSide: BinarySide | null;
  /**
   *  Taker (aggressing) wallet, lowercased; null when the indexer has not joined
   *  it yet.
   *
   *  Read from the taker's ORDER when the fill's own denormalized copy is absent.
   *  `Fill.taker` is populated only on spot, by a bridge that runs after the
   *  fill, so a binary trade names its taker through the order or not at all.
   */
  taker: string | null;
  /** BINARY only — the taker's YES/NO side; null on spot and perp. */
  takerSide: BinarySide | null;
  /**
   *  True when the taker bought the base (or YES) and the maker held the ask —
   *  the aggressor's direction. Null until the taker side is known.
   */
  takerIsBid: boolean | null;
};

/**
 *  A complete-set mint, a merge, or a redemption — collateral crossing into or
 *  out of outcome tokens.
 *
 *  BINARY only. Amounts are raw units.
 */
export type MarketSupplyActivity = MarketActivityBase & {
  kind: "MINT_SET" | "MERGE_SET" | "REDEEM";
  /** Acting wallet, lowercased. */
  account: string;
  /**
   *  `REDEEM`: outcome tokens burned. `MINT_SET` / `MERGE_SET`: the size of the
   *  complete set, meaning the amount of EACH outcome. Raw outcome-token units.
   */
  amount: string;
  /** `REDEEM` only: collateral paid out, raw units. Null on a mint or a merge. */
  payout: string | null;
  /**
   *  The periphery entry the flow used — `NativeMint`, `Permit2Mint` or
   *  `NativeRedeem`. Null on a direct call to the module.
   */
  routedVia: string | null;
};

/**
 *  The oracle acting on the market.
 *
 *  BINARY only. `outcome` is the indexer's own word for what happened, so a
 *  caller can show a market that failed to resolve as distinct from one that
 *  resolved.
 */
export type MarketResolutionActivity = MarketActivityBase & {
  kind: "RESOLUTION";
  /** `Resolved`, `Skipped` or `Failed`. */
  outcome: string;
  /**
   *  The winning outcome index (0 = YES, 1 = NO), derived from a one-hot payout
   *  vector. Null on a void, a `Skipped` and a `Failed`.
   */
  outcomeIdx: number | null;
  /** True when the market resolved void. Null when the event carried no verdict. */
  voided: boolean | null;
};

/**
 *  A lifecycle transition, such as Trading to Locked.
 *
 *  BINARY only.
 */
export type MarketStatusActivity = MarketActivityBase & {
  kind: "STATUS";
  /** Status before the transition. */
  oldStatus: BinaryMarketStatus;
  /** Status after the transition. */
  newStatus: BinaryMarketStatus;
};

/**
 *  One row of a market's activity feed. Narrow on `kind`.
 *
 *  ```ts
 *  for (const row of await client.getMarketActivity(marketId)) {
 *    if (row.kind === "TRADE") console.log(row.fillPrice, row.quantity);
 *    else if (row.kind === "RESOLUTION") console.log(row.outcome);
 *  }
 *  ```
 */
export type MarketActivity =
  | MarketTradeActivity
  | MarketSupplyActivity
  | MarketResolutionActivity
  | MarketStatusActivity;

/** Options for {@link SomniaMarketsClient.getMarketActivity}. All optional. */
export type MarketActivityOptions = {
  /**
   *  Max rows to return (default 50).
   *
   *  Each source stream is asked for this many rows, and the merge keeps the
   *  newest `limit` of the union. So the result is the market's newest `limit`
   *  events, whichever kinds they are.
   */
  limit?: number;
  /**
   *  Which kinds to read (default: every kind).
   *
   *  A kind left out is excluded at the indexer, not dropped afterwards. An
   *  empty array therefore reads nothing and returns `[]`.
   */
  kinds?: readonly MarketActivityKind[];
  /** Only rows at/after this unix-seconds timestamp. */
  since?: number;
  /**
   *  Only rows at/before this unix-seconds timestamp.
   *
   *  This is the paging cursor. To read the page before the one you hold, pass
   *  the `timestamp` of its last row. There is no `offset`, because a row offset
   *  cannot page a merged feed: each stream would skip its own `offset` rows, so
   *  the second page would omit whatever the first page did not have room for.
   *
   *  KNOWN LIMIT — the cursor has one-second resolution, and the bound is
   *  inclusive, so the boundary second is re-read on the next page: expect a few
   *  duplicate ids across a page edge and de-duplicate by `id` if that matters.
   *  A second holding `limit` or more rows cannot be paged past at all, because
   *  the next request returns that same second again.
   *
   *  Tightening this needs a composite (timestamp, blockNumber, logIndex) cursor.
   *  The entity schema now carries `logIndex` on all four streams — this release
   *  adds it to the three that lacked it — so the cursor is expressible as soon
   *  as a REINDEXED deployment serves the column. It is not adopted here on
   *  purpose: ordering on a column the live Hasura does not serve is a
   *  validation error that fails the whole read, not a null, so the SDK would
   *  break against every indexer that has not caught up yet.
   */
  until?: number;
  /**
   *  The market's pool address, when the caller already knows it.
   *
   *  An optimization, and safe to omit. Trades are selected by market id either
   *  way; supplying the pool adds the predicate that lets the indexer read them
   *  through the `(pool, timestamp)` index instead of sorting the market's fills.
   *  It cannot widen the result — on binary a recycled pool's earlier markets are
   *  still excluded by the market-id predicate, and on spot and perp the pool
   *  address IS the market id.
   */
  pool?: string;
};

/**
 *  One market's activity, newest first — trades interleaved with complete-set
 *  mints and merges, redemptions, oracle resolution and lifecycle transitions.
 *
 *  This is the market's transaction history: every row names the transaction it
 *  landed in, so a caller can follow any row to the chain. It is the one-shot
 *  INDEXER read, so it carries the history a page needs on first paint. It does
 *  not update itself. For trades arriving with no indexer round-trip, read the
 *  live store as well ({@link SomniaMarketsClient.getLiveFills}, or the
 *  `useLiveFills` hook) and merge on the trade rows' `id`, which is `TRADE:`
 *  followed by the fill id.
 *
 *  A spot or perp market returns `TRADE` rows only. The other four kinds come
 *  from binary-only entities, so their streams are simply empty — asking for
 *  them on spot or perp is not an error.
 *
 *  One round-trip. Every predicate runs at the indexer, so `limit` applies to
 *  the rows you asked for. The merge itself is the only work done here, over
 *  results the server has already bounded.
 *
 *  @param market - The market's bytes32 marketId (case-insensitive). On spot and
 *  perp this is the pool address.
 *  @param opts - Paging, kind selection and the `pool` hint
 *  ({@link MarketActivityOptions}).
 *  @throws {@link IndexerError} when the indexer read fails.
 *
 *  ```ts
 *  const page = await client.getMarketActivity(marketId, { limit: 100, pool });
 *  const older = await client.getMarketActivity(marketId, {
 *    limit: 100,
 *    pool,
 *    until: Number(page[page.length - 1].timestamp),
 *  });
 *  ```
 */
export async function getMarketActivity(
  market: string,
  opts: MarketActivityOptions = {},
  indexerUrl: string,
): Promise<MarketActivity[]> {
  const marketId = market.toLowerCase();
  const limit = opts.limit ?? 50;
  const kinds = new Set<MarketActivityKind>(opts.kinds ?? ALL_ACTIVITY_KINDS);
  const routerKinds = ROUTER_KIND_BY_ACTIVITY_KIND.filter(([activityKind]) =>
    kinds.has(activityKind),
  ).map(([, routerKind]) => routerKind);

  // A stream the caller did not ask for is limited to zero rows rather than
  // dropped from the document. That keeps ONE static, fully typed query for
  // every combination of `kinds`, and keeps the exclusion at the indexer, where
  // `LIMIT 0` costs nothing.
  const fillWhere: Record<string, unknown> = { market_id: { _eq: marketId } };
  if (opts.pool != null) fillWhere.pool = { _eq: opts.pool.toLowerCase() };
  const routerWhere: Record<string, unknown> = { market_id: { _eq: marketId } };
  if (routerKinds.length) routerWhere.kind = { _in: routerKinds };
  const resolutionWhere: Record<string, unknown> = { market_id: { _eq: marketId } };
  const statusWhere: Record<string, unknown> = { market_id: { _eq: marketId } };
  for (const where of [fillWhere, routerWhere, resolutionWhere, statusWhere]) {
    applyActivityWindow(where, opts);
  }

  const data = await IndexerRead.gqlRequest(
    MarketActivityQuery,
    {
      fillWhere,
      routerWhere,
      resolutionWhere,
      statusWhere,
      fillLimit: kinds.has("TRADE") ? limit : 0,
      routerLimit: routerKinds.length ? limit : 0,
      resolutionLimit: kinds.has("RESOLUTION") ? limit : 0,
      statusLimit: kinds.has("STATUS") ? limit : 0,
    },
    indexerUrl,
  );

  const rows: MarketActivity[] = [
    ...data.Fill.map(toTradeActivity),
    // `kind` is a plain `String!` column the handlers only ever fill with the
    // three router verbs, so the mapper's lookup is total in practice. A row
    // whose verb is unknown is dropped rather than typed as one of them.
    ...data.RouterActionRecord.flatMap(toSupplyActivity),
    ...data.MarketResolutionEvent.map(toResolutionActivity),
    ...data.MarketStatusUpdate.map(toStatusActivity),
  ];
  // Each stream arrives newest-first and bounded to `limit`, so merging them and
  // keeping the first `limit` is exactly the newest `limit` events overall.
  return rows.sort(byNewestFirst).slice(0, limit);
}

/**
 *  One order placed in a transaction — {@link FillOrder} plus the market it was
 *  placed in, which a transaction view needs because one transaction can touch
 *  more than one market.
 */
export type TransactionOrder = FillOrder & {
  /** The market's bytes32 marketId, lowercased. */
  market: string;
};

/**
 *  Everything the protocol did in ONE transaction.
 *
 *  The transaction-scoped counterpart of {@link SomniaMarketsClient.getMarketActivity}: same event
 *  union, same row ids, but selected by transaction rather than by market. A
 *  transaction that touched nothing the indexer follows comes back with empty
 *  collections and a null `blockNumber` — that is "not a protocol transaction",
 *  not a failure.
 */
export type TransactionActivity = {
  /** The transaction hash, LOWER-CASED — not necessarily as the caller spelled it. */
  txHash: string;
  /**
   *  Block the transaction landed in; null when the indexer has nothing for this
   *  hash. Read off the events, so it is the indexer's view of the block rather
   *  than the chain's.
   */
  blockNumber: string | null;
  /** Block timestamp (unix seconds); null on the same terms as `blockNumber`. */
  timestamp: string | null;
  /**
   *  What the transaction did, in LOG ORDER — earliest first, the order the chain
   *  executed it in. The opposite of {@link SomniaMarketsClient.getMarketActivity}, which is a feed
   *  and reads newest-first.
   */
  events: MarketActivity[];
  /**
   *  Orders PLACED in this transaction. A taker order that filled immediately
   *  appears here AND as the taker of a `TRADE` event; a maker order that only
   *  rested appears here alone.
   */
  ordersPlaced: TransactionOrder[];
  /** Protocol fees charged in this transaction. BINARY only. */
  protocolFees: ProtocolFeeRecord[];
  /** Builder fees charged in this transaction. BINARY only. */
  builderFees: BuilderFeeRecord[];
  /**
   *  The markets these events touched, keyed by lowercased market id — so a
   *  caller can NAME each row without a lookup per row.
   */
  markets: Record<string, Market>;
};

/** Options for {@link SomniaMarketsClient.getTransactionActivity}. */
export type TransactionActivityOptions = {
  /** Max rows per event stream (default 100). */
  limit?: number;
};

/**
 *  Everything the protocol did in one transaction — trades, complete-set mints
 *  and merges, redemptions, oracle resolution, lifecycle transitions, the orders
 *  it placed, and the fees it paid.
 *
 *  This is the read behind a transaction detail view, and the counterpart to
 *  {@link getTradeContext}: that one starts from a trade and shows its transaction
 *  as context, this one starts from a transaction and shows every trade in it.
 *  `events` is the same {@link MarketActivity} union
 *  {@link SomniaMarketsClient.getMarketActivity} returns, with the same row ids, so a caller can
 *  render both with one component and link a `TRADE:` row straight to its detail.
 *
 *  Returns empty collections and a null `blockNumber` for a hash the indexer has
 *  nothing for — an unknown hash, or a transaction that touched no protocol
 *  contract. That is absence, not failure (SDK-IO-002).
 *
 *  Two round-trips. The first selects the events BY transaction hash, which is
 *  the only predicate available at the start and is not an indexed column on
 *  `Fill`. The second uses the block timestamp the first one found, so the fees,
 *  the placed orders and the market rows are all index-served.
 *
 *  @param txHash - Transaction hash (case-insensitive).
 *  @throws {@link IndexerError} when the indexer read fails.
 *
 *  ```ts
 *  const tx = await client.getTransactionActivity(hash);
 *  for (const event of tx.events) {
 *    if (event.kind === "TRADE") console.log(tx.markets[event.market]?.marketType);
 *  }
 *  ```
 */
export async function getTransactionActivity(
  txHash: string,
  opts: TransactionActivityOptions = {},
  indexerUrl: string,
): Promise<TransactionActivity> {
  const hash = txHash.toLowerCase();
  const limit = opts.limit ?? 100;

  // Pass one: the events, selected by hash. `Fill.txHash` carries an `@index` in
  // the entity schema, so this is an index read rather than the table scan it
  // used to be — but only where the indexer has been REINDEXED since that index
  // was added. Against an older deployment it degrades to the original scan
  // (one scan, returning the page's content rather than merely probing for an
  // anchor), which is correct, just slower. The three other streams are small
  // tables either way.
  const found = await IndexerRead.gqlRequest(TransactionEventsQuery, { txHash: hash, limit }, indexerUrl);

  const events: MarketActivity[] = [
    ...found.Fill.map(toTradeActivity),
    ...found.RouterActionRecord.flatMap(toSupplyActivity),
    ...found.MarketResolutionEvent.map(toResolutionActivity),
    ...found.MarketStatusUpdate.map(toStatusActivity),
  ].sort(byLogOrder);

  // Every event of one transaction shares its block, so any of them anchors the
  // second pass. But a real protocol transaction can produce NO event at all: a
  // limit order that rests without crossing writes only an Order row. Falling
  // through here reported such a transaction as "nothing indexed" and made
  // `ordersPlaced` unreachable on its own, so probe the order table for an
  // anchor before giving up. One extra round-trip, only in the no-event case.
  const [anchor] = events;
  const restingOrders =
    anchor === undefined
      ? (
          await IndexerRead.gqlRequest(
            TransactionOrderAnchorQuery,
            { txHash: hash, limit },
            indexerUrl,
          )
        ).Order ?? []
      : [];

  const anchorTimestamp = anchor?.timestamp ?? restingOrders[0]?.placedAtTimestamp ?? null;
  const anchorBlock = anchor?.blockNumber ?? restingOrders[0]?.placedAtBlock ?? null;
  if (anchorTimestamp === null || anchorBlock === null) {
    // Genuinely nothing the indexer follows — an unknown hash, or a transaction
    // that touched no protocol contract.
    return {
      txHash: hash,
      blockNumber: null,
      timestamp: null,
      events: [],
      ordersPlaced: [],
      protocolFees: [],
      builderFees: [],
      markets: {},
    };
  }

  // Markets to hydrate come from whichever pass found something.
  const marketIds = [
    ...new Set([...events.map((e) => e.market), ...restingOrders.map((o) => o.market_id)]),
  ];

  // Pass two: everything that needs the timestamp to be index-served. The fee
  // and order tables are as large as `Fill`, so these are anchored rather than
  // filtered by hash alone; the market rows are a primary-key lookup.
  const rest = await IndexerRead.gqlRequest(
    TransactionContextQuery,
    // `orderLimit: 0` when the anchor probe already returned the orders: that
    // path ran the same `placedTxHash` predicate, which is not index-served, so
    // repeating it here would scan twice for one answer.
    { txHash: hash, timestamp: anchorTimestamp, marketIds, limit, orderLimit: restingOrders.length > 0 ? 0 : limit },
    indexerUrl,
  );

  const markets: Record<string, Market> = {};
  for (const row of Markets.toMarkets(rest.Market)) markets[row.id] = row;

  return {
    txHash: hash,
    blockNumber: anchorBlock,
    timestamp: anchorTimestamp,
    events,
    ordersPlaced: (restingOrders.length > 0 ? restingOrders : rest.Order).map(toTransactionOrder),
    protocolFees: rest.ProtocolFeeRecord,
    builderFees: rest.BuilderFeeRecord,
    markets,
  };
}

/** Map an order row placed in the transaction to the public {@link TransactionOrder}. */
function toTransactionOrder(o: ResultOf<typeof TransactionOrderFields>): TransactionOrder {
  return {
    id: o.id,
    orderId: o.orderId,
    market: o.market_id,
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

/**
 *  Earliest first, by log position — how a transaction reads. Every event of one
 *  transaction shares a block, so the log index alone orders them; block number
 *  is compared first anyway so the comparator stays correct if that ever changes.
 */
function byLogOrder(a: MarketActivity, b: MarketActivity): number {
  if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber) - Number(b.blockNumber);
  return logIndexOf(a) - logIndexOf(b);
}

/** Every kind {@link SomniaMarketsClient.getMarketActivity} reads when `kinds` is omitted. */
const ALL_ACTIVITY_KINDS: readonly MarketActivityKind[] = [
  "TRADE",
  "MINT_SET",
  "MERGE_SET",
  "REDEEM",
  "RESOLUTION",
  "STATUS",
];

/**
 *  The three activity kinds that read from `RouterActionRecord`, paired with the
 *  verb that entity's `kind` column uses. Ordered pairs rather than a record, so
 *  the `kinds` filter maps to a `_in` list in one pass.
 */
const ROUTER_KIND_BY_ACTIVITY_KIND: readonly (readonly [MarketActivityKind, string])[] = [
  ["MINT_SET", "MintCompleteSet"],
  ["MERGE_SET", "MergeCompleteSet"],
  ["REDEEM", "Redeem"],
];

/** Inverse of {@link ROUTER_KIND_BY_ACTIVITY_KIND}, for mapping a row back. */
const ACTIVITY_KIND_BY_ROUTER_KIND = new Map<string, MarketSupplyActivity["kind"]>([
  ["MintCompleteSet", "MINT_SET"],
  ["MergeCompleteSet", "MERGE_SET"],
  ["Redeem", "REDEEM"],
]);

/**
 *  Newest first, breaking a shared timestamp on block then log position.
 *
 *  EXPORTED because it is the order `getMarketActivity` pages by: a caller
 *  merging its own rows into that page (the live tail, say) must sort by the
 *  same rule, and a hand-copied comparator is free to drift from the paging
 *  contract with nothing to catch it.
 *
 *  @category activity
 */
export function byNewestFirst(a: MarketActivity, b: MarketActivity): number {
  if (a.timestamp !== b.timestamp) return Number(b.timestamp) - Number(a.timestamp);
  if (a.blockNumber !== b.blockNumber) return Number(b.blockNumber) - Number(a.blockNumber);
  return logIndexOf(b) - logIndexOf(a);
}

/**
 *  The log index inside a row's id (`${blockNumber}_${logIndex}` for every
 *  source entity here). It orders two rows of the same block, which timestamp
 *  and block number cannot. An id that does not carry one sorts first.
 */
function logIndexOf(row: MarketActivity): number {
  const parsed = Number(row.id.slice(row.id.lastIndexOf("_") + 1));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 *  Map a `Fill` row to a `TRADE`, resolving the taker from its order.
 *
 *  The fill's own `taker` and `takerSide` are denormalized copies a bridge fills
 *  in after the fact. `taker` is written for every pool type, but `takerSide` is
 *  held back on binary until `BinaryOrderPlaced` supplies the side. The taker's
 *  ORDER carries both from the moment it exists, so it wins wherever it is
 *  present — the same precedence `fills.ts` documents on `FillRow.takerOrder`.
 */
function toTradeActivity(row: TradeRowWire): MarketTradeActivity {
  return {
    id: `TRADE:${row.id}`,
    kind: "TRADE",
    market: row.market,
    pool: row.pool,
    fillPrice: row.fillPrice,
    quantity: row.quantity,
    quoteQuantity: row.quoteQuantity,
    maker: row.maker,
    makerSide: row.makerSide,
    taker: row.takerOrder?.owner ?? row.taker,
    takerSide: row.takerOrder?.side ?? row.takerSide,
    takerIsBid: row.takerIsBid,
    blockNumber: row.blockNumber,
    timestamp: row.timestamp,
    txHash: row.txHash,
  };
}

/**
 *  Map a `RouterActionRecord` to its supply row, or to nothing.
 *
 *  Returns an array so an unrecognized verb yields no row. The alternative — a
 *  cast to one of the three known kinds — would put a value the indexer never
 *  wrote into a discriminated union, and every consumer would then trust it.
 */
function toSupplyActivity(row: SupplyRowWire): MarketSupplyActivity[] {
  const kind = ACTIVITY_KIND_BY_ROUTER_KIND.get(row.kind);
  if (kind === undefined) return [];
  return [
    {
      id: `${kind}:${row.id}`,
      kind,
      market: row.market,
      account: row.account,
      amount: row.amount,
      payout: row.payout,
      routedVia: row.routedVia,
      blockNumber: row.blockNumber,
      timestamp: row.timestamp,
      txHash: row.txHash,
    },
  ];
}

/** Map a `MarketResolutionEvent` row to a `RESOLUTION`. */
function toResolutionActivity(row: ResolutionRowWire): MarketResolutionActivity {
  return {
    id: `RESOLUTION:${row.id}`,
    kind: "RESOLUTION",
    market: row.market,
    outcome: row.kind,
    outcomeIdx: row.outcomeIdx,
    voided: row.voided,
    blockNumber: row.blockNumber,
    timestamp: row.timestamp,
    txHash: row.txHash,
  };
}

/** Map a `MarketStatusUpdate` row to a `STATUS`. */
function toStatusActivity(row: StatusRowWire): MarketStatusActivity {
  return {
    id: `STATUS:${row.id}`,
    kind: "STATUS",
    market: row.market,
    oldStatus: row.oldStatus,
    newStatus: row.newStatus,
    blockNumber: row.blockNumber,
    timestamp: row.timestamp,
    txHash: row.txHash,
  };
}

/**
 *  Add the `since`/`until` window to one stream's `where` object (unix seconds).
 *  Only supplied values are added, so an omitted bound never narrows the query
 *  (SDK-IO-004).
 */
function applyActivityWindow(
  where: Record<string, unknown>,
  opts: MarketActivityOptions,
): Record<string, unknown> {
  const ts: Record<string, number> = {};
  if (opts.since != null) ts._gte = opts.since;
  if (opts.until != null) ts._lte = opts.until;
  if (Object.keys(ts).length) where.timestamp = ts;
  return where;
}

// ---------------------------------------------------------------------------
// The typed document for the read above, and the wire row types derived from it.
// Hoisted here, after the functions, to keep this file's reading order. Result
// and variable types come from the committed schema snapshot.
//
// One fragment per source entity, so each mapper's parameter type IS the shape
// the query selects (`ResultOf`), rather than a second hand-written copy of it.
// Schema drift then fails to compile at the mapper instead of at runtime.

// prettier-ignore
const ActivityFillFields = graphql(`
  fragment ActivityFillFields on Fill {
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
    takerIsBid
    # The taker's ORDER, not only the denormalized copy on the fill: Fill.takerSide
    # is backfilled by the PendingTakerFill bridge and stays null on a binary row
    # until BinaryOrderPlaced lands, while the order names the side from the start.
    # Same precedence fills.ts documents on FillRow.takerOrder.
    takerOrder { owner side }
    blockNumber
    timestamp
    txHash
  }
`);

// prettier-ignore
const ActivityRouterFields = graphql(`
  fragment ActivityRouterFields on RouterActionRecord {
    id
    kind
    market: market_id
    account
    amount
    payout
    routedVia
    blockNumber
    timestamp
    txHash
  }
`);

// prettier-ignore
const ActivityResolutionFields = graphql(`
  fragment ActivityResolutionFields on MarketResolutionEvent {
    id
    kind
    market: market_id
    outcomeIdx
    voided
    blockNumber
    timestamp
    txHash
  }
`);

// prettier-ignore
const ActivityStatusFields = graphql(`
  fragment ActivityStatusFields on MarketStatusUpdate {
    id
    market: market_id
    oldStatus
    newStatus
    blockNumber
    timestamp
    txHash
  }
`);

/** The `Fill` shape {@link toTradeActivity} maps, as the query selects it. */
type TradeRowWire = ResultOf<typeof ActivityFillFields>;
/** The `RouterActionRecord` shape {@link toSupplyActivity} maps. */
type SupplyRowWire = ResultOf<typeof ActivityRouterFields>;
/** The `MarketResolutionEvent` shape {@link toResolutionActivity} maps. */
type ResolutionRowWire = ResultOf<typeof ActivityResolutionFields>;
/** The `MarketStatusUpdate` shape {@link toStatusActivity} maps. */
type StatusRowWire = ResultOf<typeof ActivityStatusFields>;

// Four roots in one document: one request, four bounded results. Each root takes
// its own `where` and its own limit, which is what lets `kinds` exclude a stream
// server-side without a second document.

// prettier-ignore
const MarketActivityQuery = graphql(`
  query MarketActivity(
         $fillWhere: Fill_bool_exp!
         $routerWhere: RouterActionRecord_bool_exp!
         $resolutionWhere: MarketResolutionEvent_bool_exp!
         $statusWhere: MarketStatusUpdate_bool_exp!
         $fillLimit: Int!
         $routerLimit: Int!
         $resolutionLimit: Int!
         $statusLimit: Int!
       ) {
         Fill(where: $fillWhere, order_by: [{timestamp: desc}, {blockNumber: desc}, {logIndex: desc}], limit: $fillLimit) {
           ...ActivityFillFields
         }
         RouterActionRecord(where: $routerWhere, order_by: [{timestamp: desc}, {blockNumber: desc}, {id: desc}], limit: $routerLimit) {
           ...ActivityRouterFields
         }
         MarketResolutionEvent(where: $resolutionWhere, order_by: [{timestamp: desc}, {blockNumber: desc}, {id: desc}], limit: $resolutionLimit) {
           ...ActivityResolutionFields
         }
         MarketStatusUpdate(where: $statusWhere, order_by: [{timestamp: desc}, {blockNumber: desc}, {id: desc}], limit: $statusLimit) {
           ...ActivityStatusFields
         }
       }
`);

// The transaction-scoped documents. Pass one selects the events by hash; pass two
// takes the block timestamp pass one found and uses it to keep the large tables
// (fees, orders) on an index, plus a primary-key read of the markets involved.

// prettier-ignore
const TransactionOrderFields = graphql(`
  fragment TransactionOrderFields on Order {
    id
    orderId
    market_id
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
const TransactionEventsQuery = graphql(`
  query TransactionEvents($txHash: String!, $limit: Int!) {
         Fill(where: {txHash: {_eq: $txHash}}, order_by: {logIndex: asc}, limit: $limit) {
           ...ActivityFillFields
         }
         RouterActionRecord(where: {txHash: {_eq: $txHash}}, order_by: {id: asc}, limit: $limit) {
           ...ActivityRouterFields
         }
         MarketResolutionEvent(where: {txHash: {_eq: $txHash}}, order_by: {id: asc}, limit: $limit) {
           ...ActivityResolutionFields
         }
         MarketStatusUpdate(where: {txHash: {_eq: $txHash}}, order_by: {id: asc}, limit: $limit) {
           ...ActivityStatusFields
         }
       }
`);

// prettier-ignore
const TransactionOrderAnchorQuery = graphql(`
  query TransactionOrderAnchor($txHash: String!, $limit: Int!) {
         Order(where: {placedTxHash: {_eq: $txHash}}, order_by: {id: asc}, limit: $limit) {
           ...TransactionOrderFields
           placedAtBlock
         }
       }
`);

const TransactionContextQuery = graphql(`
  query TransactionContext($txHash: String!, $timestamp: numeric!, $marketIds: [String!]!, $limit: Int!, $orderLimit: Int!) {
         Order(
           where: {placedAtTimestamp: {_eq: $timestamp}, placedTxHash: {_eq: $txHash}}
           order_by: {id: asc}
           limit: $orderLimit
         ) {
           ...TransactionOrderFields
         }
         ProtocolFeeRecord(
           where: {timestamp: {_eq: $timestamp}, txHash: {_eq: $txHash}}
           order_by: {id: asc}
           limit: $limit
         ) {
           ...ProtocolFeeFields
         }
         BuilderFeeRecord(
           where: {timestamp: {_eq: $timestamp}, txHash: {_eq: $txHash}}
           order_by: {id: asc}
           limit: $limit
         ) {
           ...BuilderFeeFields
         }
         Market(where: {id: {_in: $marketIds}}) {
           ...MarketFields
         }
       }
`);
