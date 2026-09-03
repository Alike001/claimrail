import { evmAddressSchema, walletPositionsResponseSchema } from "@claimrail/contracts";
import { jsonSafe, readWalletInbox } from "@/src/server/claimrail";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ address: string }> },
) {
  const parsed = evmAddressSchema.safeParse((await context.params).address);
  if (!parsed.success)
    return Response.json(
      {
        schemaVersion: "1",
        error: {
          code: "invalid_address",
          message: parsed.error.issues[0]?.message ?? "Invalid address",
        },
      },
      { status: 400 },
    );
  try {
    const { result } = await readWalletInbox(parsed.data);
    const body = jsonSafe({
      schemaVersion: "1",
      address: result.address,
      completeness: result.positions.completeness,
      observedAt: new Date(result.positions.completedAt).toISOString(),
      verifiedBlock: result.positions.evidence.verifiedBlock?.toString() ?? null,
      pageCount: result.positions.pageCount,
      rowCount: result.positions.rowCount,
      positions: result.positions.positions,
      failures: result.positions.failures,
    });
    return Response.json(walletPositionsResponseSchema.parse(body), {
      headers: { "cache-control": "no-store" },
    });
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
