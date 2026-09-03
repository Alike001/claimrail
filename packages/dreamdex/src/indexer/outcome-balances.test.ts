import { describe, expect, it, vi } from "vitest";
import paginationJson from "../../../../fixtures/dreamdex/live/shannon-50312/paginated-wallet.json" with { type: "json" };
import {
  createOutcomeBalancePageFetcher,
  discoverOutcomeBalances,
  OUTCOME_BALANCE_QUERY,
  type OutcomeBalanceRow,
} from "./outcome-balances.js";

const fixture = paginationJson as unknown as {
  readonly account: string;
  readonly rows: readonly OutcomeBalanceRow[];
};

describe("OutcomeBalance discovery", () => {
  it("exhaustively reads the captured 1,044-position wallet in eleven pages", async () => {
    const fetchPage = vi.fn(({ limit, offset }: { limit: number; offset: number }) =>
      Promise.resolve(fixture.rows.slice(offset, offset + limit)),
    );
    const result = await discoverOutcomeBalances({
      account: fixture.account,
      fetchPage,
      pageSize: 100,
      maxPages: 100,
      now: () => 1_000,
    });
    expect(result).toMatchObject({
      completeness: "complete",
      pageCount: 11,
      rowCount: 1044,
      uniquePositionCount: 1044,
      nextOffset: null,
    });
    expect(new Set(result.positions.map(({ id }) => id)).size).toBe(1044);
    expect(result.positions[0]?.id.localeCompare(result.positions.at(-1)?.id ?? "")).toBeLessThan(
      0,
    );
  });

  it("returns partial data and the failed offset when a page times out", async () => {
    const rows = fixture.rows.slice(0, 2);
    const result = await discoverOutcomeBalances({
      account: fixture.account,
      pageSize: 2,
      timeoutMs: 5,
      fetchPage: ({ offset, signal }) => {
        if (offset === 0) return Promise.resolve(rows);
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    });
    expect(result.completeness).toBe("partial");
    expect(result.nextOffset).toBe(2);
    expect(result.positions).toHaveLength(2);
    expect(result.failures[0]).toMatchObject({
      page: 1,
      source: "dreamdex-indexer:OutcomeBalance",
    });
    expect(result.failures[0]?.reason).toContain("TimeoutError");
  });

  it("deduplicates overlapping pages and never labels a max-page stop complete", async () => {
    const first = fixture.rows.slice(0, 2);
    const result = await discoverOutcomeBalances({
      account: fixture.account,
      pageSize: 2,
      maxPages: 2,
      fetchPage: ({ offset }) =>
        Promise.resolve(offset === 0 ? first : [first[1]!, fixture.rows[2]!]),
    });
    expect(result.completeness).toBe("partial");
    expect(result.rowCount).toBe(4);
    expect(result.uniquePositionCount).toBe(3);
    expect(result.nextOffset).toBe(4);
    expect(result.failures[0]?.reason).toContain("maxPages");
  });

  it("sends a stable id-ordered GraphQL query and classifies GraphQL errors", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ errors: [{ message: "denied" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const page = createOutcomeBalancePageFetcher("https://indexer.invalid/graphql", fetcher);
    await expect(
      page({
        account: fixture.rows[0]!.account,
        limit: 100,
        offset: 0,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("denied");
    expect(OUTCOME_BALANCE_QUERY).toContain("order_by: { id: asc }");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
