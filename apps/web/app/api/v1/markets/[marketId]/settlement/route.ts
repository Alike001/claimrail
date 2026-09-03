import { marketIdSchema, marketSettlementResponseSchema } from "@claimrail/contracts";
import { jsonSafe, readMarketSettlement } from "@/src/server/claimrail";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ marketId: string }> },
) {
  const parsed = marketIdSchema.safeParse((await context.params).marketId);
  if (!parsed.success)
    return Response.json(
      {
        schemaVersion: "1",
        error: { code: "invalid_market_id", message: "Invalid 32-byte market ID" },
      },
      { status: 400 },
    );
  try {
    const result = await readMarketSettlement(parsed.data);
    const body = jsonSafe({
      schemaVersion: "1",
      marketId: parsed.data.toLowerCase(),
      lifecycle: result.market.lifecycle,
      observedAt: new Date(result.market.evidence.observedAt).toISOString(),
      market: result.market,
      explanation: result.explanation,
    });
    return Response.json(marketSettlementResponseSchema.parse(body), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        schemaVersion: "1",
        error: {
          code: "upstream_unavailable",
          message: "Settlement evidence could not be verified",
        },
      },
      { status: 503 },
    );
  }
}
