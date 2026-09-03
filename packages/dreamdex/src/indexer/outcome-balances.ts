import { asAddress, asTimestampMs, type EvidenceSummary, type PositionScan } from "@claimrail/core";
import { getAddress, type Address } from "viem";

export interface IndexedPositionMarket {
  readonly id: `0x${string}`;
  readonly marketAddress: Address;
  readonly poolAddress: Address;
  readonly asset: string;
  readonly question: string;
  readonly clobStatus: string;
  readonly expiry: string;
  readonly winningOutcome: number | null;
  readonly voided: boolean;
  readonly quoteDecimals: number;
  readonly intervalSec: string | null;
}

export interface OutcomeBalanceRow {
  readonly id: string;
  readonly account: Address;
  readonly outcomeIndex: number;
  readonly tokenId: string;
  readonly balance: string;
  readonly market: IndexedPositionMarket | null;
}

export interface OutcomeBalancePageRequest {
  readonly account: Address;
  readonly limit: number;
  readonly offset: number;
  readonly signal: AbortSignal;
}

export type OutcomeBalancePageFetcher = (
  request: OutcomeBalancePageRequest,
) => Promise<readonly OutcomeBalanceRow[]>;

export interface OutcomeBalanceScan extends PositionScan<OutcomeBalanceRow> {
  readonly pageSize: number;
  readonly nextOffset: number | null;
}

export interface DiscoverOutcomeBalancesOptions {
  readonly account: string;
  readonly fetchPage: OutcomeBalancePageFetcher;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly source?: string;
}

export const OUTCOME_BALANCE_QUERY = `
  query ClaimRailOutcomeBalancePage($account: String!, $limit: Int!, $offset: Int!) {
    OutcomeBalance(
      where: { account: { _eq: $account }, balance: { _gt: "0" } }
      order_by: { id: asc }
      limit: $limit
      offset: $offset
    ) {
      id
      account
      outcomeIndex
      tokenId
      balance
      market {
        id
        marketAddress
        poolAddress
        asset
        question
        clobStatus
        expiry
        winningOutcome
        voided
        quoteDecimals
        intervalSec
      }
    }
  }
`;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
}

function timeoutSignal(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException(`page timed out after ${timeoutMs}ms`, "TimeoutError")),
    timeoutMs,
  );
  const abort = () => controller.abort(external?.reason);
  external?.addEventListener("abort", abort, { once: true });
  if (external?.aborted) abort();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      external?.removeEventListener("abort", abort);
    },
  };
}

function failureReason(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export async function discoverOutcomeBalances(
  options: DiscoverOutcomeBalancesOptions,
): Promise<OutcomeBalanceScan> {
  const pageSize = positiveInteger(options.pageSize ?? 100, "pageSize");
  const maxPages = positiveInteger(options.maxPages ?? 100, "maxPages");
  const timeoutMs = positiveInteger(options.timeoutMs ?? 10_000, "timeoutMs");
  const account = asAddress(getAddress(options.account));
  const now = options.now ?? Date.now;
  const source = options.source ?? "dreamdex-indexer:OutcomeBalance";
  const startedAt = asTimestampMs(now());
  const byId = new Map<string, OutcomeBalanceRow>();
  const failures: { source: string; page?: number; reason: string }[] = [];
  let pagesRead = 0;
  let rowsRead = 0;
  let nextOffset: number | null = 0;
  let exhausted = false;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const bounded = timeoutSignal(options.signal, timeoutMs);
    try {
      const rows = await options.fetchPage({
        account,
        limit: pageSize,
        offset,
        signal: bounded.signal,
      });
      pagesRead += 1;
      rowsRead += rows.length;
      for (const row of rows) {
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
      if (rows.length < pageSize) {
        exhausted = true;
        nextOffset = null;
        break;
      }
      nextOffset = offset + pageSize;
    } catch (error) {
      nextOffset = offset;
      failures.push({ source, page, reason: failureReason(error) });
      break;
    } finally {
      bounded.dispose();
    }
  }

  const positions = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
  const completedAt = asTimestampMs(now());
  const completeness = exhausted ? "complete" : positions.length > 0 ? "partial" : "failed";
  if (!exhausted && failures.length === 0) {
    failures.push({
      source,
      page: maxPages,
      reason: `maxPages limit (${maxPages}) reached before an empty or short page`,
    });
  }
  const evidence: EvidenceSummary = {
    version: "dreamdex-outcome-balance-scan/v1",
    freshness: failures.length === 0 ? "fresh" : "unknown",
    observedAt: completedAt,
    conflicts: [],
  };
  return {
    completeness,
    source,
    pageCount: pagesRead,
    pageSize,
    rowCount: rowsRead,
    uniquePositionCount: positions.length,
    startedAt,
    completedAt,
    nextOffset,
    evidence,
    positions,
    failures,
  };
}

interface GraphQlResponse {
  readonly data?: { readonly OutcomeBalance?: readonly OutcomeBalanceRow[] };
  readonly errors?: readonly { readonly message?: string }[];
}

export function createOutcomeBalancePageFetcher(
  indexerUrl: string,
  fetcher: typeof fetch = fetch,
): OutcomeBalancePageFetcher {
  return async ({ account, limit, offset, signal }) => {
    const response = await fetcher(indexerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: OUTCOME_BALANCE_QUERY,
        variables: { account: account.toLowerCase(), limit, offset },
      }),
      signal,
    });
    if (!response.ok) throw new Error(`indexer returned HTTP ${response.status}`);
    const body = (await response.json()) as GraphQlResponse;
    if (body.errors?.length) {
      throw new Error(body.errors.map(({ message }) => message ?? "GraphQL error").join("; "));
    }
    if (body.data?.OutcomeBalance === undefined) {
      throw new Error("indexer response omitted OutcomeBalance");
    }
    return body.data.OutcomeBalance;
  };
}
