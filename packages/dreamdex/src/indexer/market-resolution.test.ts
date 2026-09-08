import { describe, expect, it, vi } from "vitest";
import { fetchMarketResolutionSummary } from "./market-resolution.js";

function response(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchMarketResolutionSummary", () => {
  it("loads the two bounded resolution collections in parallel", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          MarketResolutionEvent: [
            {
              id: "10_2",
              market: "0xmarket",
              kind: "Resolved",
              winningOutcome: 1,
              payoutNumerators: ["0", "10000000"],
              payoutDenominator: "10000000",
              voided: false,
              blockNumber: "10",
              timestamp: "20",
              txHash: "0xtx",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          MarketReferenceLink: [
            {
              id: "0xmarket",
              market: "0xmarket",
              oracleQuestionId: "42",
              pending: false,
            },
          ],
        }),
      );

    const result = await fetchMarketResolutionSummary(
      "https://indexer.example/graphql",
      "0xMARKET",
      {
        fetcher,
      },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.events[0]).toMatchObject({ winningOutcome: 1, txHash: "0xtx" });
    expect(result.reference).toMatchObject({ oracleQuestionId: "42", pending: false });
    expect(result.closingAnswer).toBeNull();
  });

  it("rejects malformed indexer rows instead of treating them as evidence", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ MarketResolutionEvent: [{ id: 10 }] }))
      .mockResolvedValueOnce(response({ MarketReferenceLink: [] }));

    await expect(
      fetchMarketResolutionSummary("https://indexer.example/graphql", "0xmarket", { fetcher }),
    ).rejects.toThrow(TypeError);
  });

  it("surfaces an indexer HTTP failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));

    await expect(
      fetchMarketResolutionSummary("https://indexer.example/graphql", "0xmarket", { fetcher }),
    ).rejects.toThrow("DreamDEX indexer returned HTTP 503");
  });
});
