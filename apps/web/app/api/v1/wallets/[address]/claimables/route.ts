import { evmAddressSchema, walletClaimablesResponseSchema } from "@claimrail/contracts";
import { jsonSafe, readWalletInbox } from "@/src/server/claimrail";

export const dynamic = "force-dynamic";
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
    const { result, view } = await readWalletInbox(parsed.data);
    const body = walletClaimablesResponseSchema.parse(
      jsonSafe({
        schemaVersion: "1",
        address: result.address,
        completeness: result.positions.completeness,
        observedAt: view.observedAt,
        verifiedBlock: result.positions.evidence.verifiedBlock?.toString() ?? null,
        total: {
          raw: view.claimableRaw,
          decimals: result.markets[0]?.market.display.collateralDecimals ?? 6,
          symbol: result.markets[0]?.market.display.collateralSymbol ?? "USDso",
          display: view.claimable,
        },
        positions: result.positions.positions.filter(
          ({ state }) => state === "claimable" || state === "void_refundable",
        ),
      }),
    );
    return Response.json(body, { headers: { "cache-control": "no-store" } });
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
