import { evmAddressSchema, walletHistoryResponseSchema } from "@claimrail/contracts";
import { jsonSafe, readWalletClaimReceipts, readWalletInbox } from "@/src/server/claimrail";

export const dynamic = "force-dynamic";

const historicalStates = new Set([
  "winning_unfinalized",
  "claimable",
  "losing",
  "void_refundable",
  "claim_submitted",
  "redeemed",
  "payout_owed",
]);

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ address: string }> },
) {
  const parsed = evmAddressSchema.safeParse((await context.params).address);
  if (!parsed.success)
    return Response.json(
      { schemaVersion: "1", error: { code: "invalid_address", message: "Invalid EVM address" } },
      { status: 400 },
    );
  try {
    const [{ result }, claimHistory] = await Promise.all([
      readWalletInbox(parsed.data),
      readWalletClaimReceipts(parsed.data),
    ]);
    const markets = new Map(
      result.markets.map(({ market }) => [market.identity.marketId, market] as const),
    );
    const entries = result.positions.positions
      .filter(({ state }) => historicalStates.has(state))
      .map((position) => {
        const market = markets.get(position.marketId);
        const rawCost = position.costBasis?.rawCost;
        return {
          positionIdentity: position.identity,
          marketId: position.marketId,
          market: market
            ? `${market.display.asset}/${market.display.collateralSymbol}`
            : "unknown market",
          side: position.side,
          state: position.state,
          verifiedBalance: position.verifiedBalance,
          expectedPayout: position.expectedPayout,
          rawCost: rawCost ?? null,
          realizedDelta: rawCost === undefined ? null : position.expectedPayout - rawCost,
          pnlCompleteness: position.costBasis?.completeness ?? "failed",
          evidence: position.evidence,
        };
      });
    return Response.json(
      walletHistoryResponseSchema.parse(
        jsonSafe({
          schemaVersion: "1",
          address: result.address,
          completeness: result.positions.completeness,
          observedAt: new Date(result.positions.completedAt).toISOString(),
          verifiedBlock: result.positions.evidence.verifiedBlock?.toString() ?? null,
          entries,
          claims: claimHistory.receipts,
          claimHistoryCompleteness: claimHistory.available ? "complete" : "unavailable",
        }),
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        schemaVersion: "1",
        error: { code: "upstream_unavailable", message: "DreamDEX or Somnia could not be reached" },
      },
      { status: 503 },
    );
  }
}
