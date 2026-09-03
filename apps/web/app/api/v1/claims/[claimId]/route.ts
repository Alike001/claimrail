import { claimIdSchema } from "@claimrail/contracts";
import { readClaimReceipt } from "@/src/server/claimrail";

export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ schemaVersion: "1", error: { code, message } }, { status });
}

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly claimId: string }> },
) {
  let claimId: string;
  try {
    claimId = decodeURIComponent((await params).claimId);
  } catch {
    return errorResponse("invalid_claim_id", "Invalid claim ID", 400);
  }
  const parsed = claimIdSchema.safeParse(claimId);
  if (!parsed.success) return errorResponse("invalid_claim_id", "Invalid claim ID", 400);
  try {
    const receipt = await readClaimReceipt(parsed.data);
    if (receipt === null) return errorResponse("claim_not_found", "Claim receipt not found", 404);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return Response.json(receipt, {
      headers: {
        "cache-control": "no-store",
        ...(download
          ? { "content-disposition": `attachment; filename="claimrail-${receipt.planHash}.json"` }
          : {}),
      },
    });
  } catch {
    return errorResponse(
      "claim_receipt_unavailable",
      "Claim receipt is temporarily unavailable",
      503,
    );
  }
}
