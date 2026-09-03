import { claimPrepareRequestSchema, claimPrepareResponseSchema } from "@claimrail/contracts";
import { jsonSafe, prepareManualClaim } from "@/src/server/claimrail";

export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ schemaVersion: "1", error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_json", "Request body must be valid JSON", 400);
  }
  const parsed = claimPrepareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid claim preparation request",
      400,
    );
  }
  try {
    const result = await prepareManualClaim(parsed.data.owner);
    const response = jsonSafe({
      schemaVersion: "1",
      status: result.status,
      plan: result.status === "ready" ? result.plan : result.draft,
    });
    return Response.json(claimPrepareResponseSchema.parse(response), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim preparation failed";
    const clientFailure =
      message.includes("no verified claimable") ||
      message.includes("no candidate") ||
      message.includes("complete wallet scan") ||
      message.includes("fresh position evidence");
    return errorResponse(
      clientFailure ? "claim_not_ready" : "claim_preparation_unavailable",
      message,
      clientFailure ? 409 : 503,
    );
  }
}
