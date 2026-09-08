import type { MarketResolutionEvent } from "@somnia-chain/markets-sdk";
import type { IndexedResolution } from "../chain/types.js";

type Fetcher = typeof fetch;

const eventsQuery = `
  query ClaimRailResolutionEvents($id: String!) {
    MarketResolutionEvent(
      where: { market_id: { _eq: $id } }
      order_by: { timestamp: asc }
    ) {
      id
      market: market_id
      kind
      winningOutcome: outcomeIdx
      payoutNumerators
      payoutDenominator
      voided
      blockNumber
      timestamp
      txHash
    }
  }
`;

const referenceQuery = `
  query ClaimRailReferenceLink($id: String!) {
    MarketReferenceLink(where: { market_id: { _eq: $id } }, limit: 1) {
      id
      market: market_id
      oracleQuestionId: referenceQuestionId
      pending
    }
  }
`;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("DreamDEX indexer returned an invalid object");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

function nullableStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError("payoutNumerators must be an array of strings");
  }
  return value;
}

function event(value: unknown): MarketResolutionEvent {
  const row = record(value);
  const winningOutcome = row.winningOutcome;
  if (winningOutcome !== null && typeof winningOutcome !== "number") {
    throw new TypeError("winningOutcome must be a number or null");
  }
  const voided = row.voided;
  if (voided !== undefined && voided !== null && typeof voided !== "boolean") {
    throw new TypeError("voided must be a boolean or null");
  }
  const payoutNumerators = nullableStringArray(row.payoutNumerators);
  const payoutDenominator =
    row.payoutDenominator === undefined || row.payoutDenominator === null
      ? row.payoutDenominator
      : string(row.payoutDenominator, "payoutDenominator");
  return {
    id: string(row.id, "event id"),
    market: string(row.market, "event market"),
    kind: string(row.kind, "event kind"),
    winningOutcome,
    ...(payoutNumerators === undefined ? {} : { payoutNumerators }),
    ...(payoutDenominator === undefined ? {} : { payoutDenominator }),
    ...(voided === undefined ? {} : { voided }),
    blockNumber: string(row.blockNumber, "event blockNumber"),
    timestamp: string(row.timestamp, "event timestamp"),
    txHash: string(row.txHash, "event txHash"),
  };
}

async function query(
  indexerUrl: string,
  document: string,
  marketId: string,
  fetcher: Fetcher,
  timeoutMs: number,
) {
  const response = await fetcher(indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: document, variables: { id: marketId.toLowerCase() } }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`DreamDEX indexer returned HTTP ${response.status}`);
  const body = record(await response.json());
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const first = record(body.errors[0]);
    throw new Error(
      `DreamDEX indexer query failed: ${typeof first.message === "string" ? first.message : "unknown error"}`,
    );
  }
  return record(body.data);
}

export async function fetchMarketResolutionSummary(
  indexerUrl: string,
  marketId: string,
  options: { readonly fetcher?: Fetcher; readonly timeoutMs?: number } = {},
): Promise<IndexedResolution> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const [eventData, referenceData] = await Promise.all([
    query(indexerUrl, eventsQuery, marketId, fetcher, timeoutMs),
    query(indexerUrl, referenceQuery, marketId, fetcher, timeoutMs),
  ]);
  const eventRows = eventData.MarketResolutionEvent;
  const referenceRows = referenceData.MarketReferenceLink;
  if (!Array.isArray(eventRows) || !Array.isArray(referenceRows)) {
    throw new TypeError("DreamDEX indexer returned invalid resolution collections");
  }
  const referenceRow = referenceRows[0];
  const reference =
    referenceRow === undefined
      ? null
      : (() => {
          const row = record(referenceRow);
          if (typeof row.pending !== "boolean") {
            throw new TypeError("reference pending must be a boolean");
          }
          return {
            id: string(row.id, "reference id"),
            market: string(row.market, "reference market"),
            oracleQuestionId: string(row.oracleQuestionId, "reference oracleQuestionId"),
            pending: row.pending,
          };
        })();
  return {
    events: eventRows.map(event),
    reference,
    closingAnswer: null,
    openingAnswer: null,
  };
}
