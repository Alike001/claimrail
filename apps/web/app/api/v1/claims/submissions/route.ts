import { claimSubmissionRequestSchema, claimSubmissionResponseSchema } from "@claimrail/contracts";
import { persistClaimSubmission } from "@/src/server/claimrail";

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
  const parsed = claimSubmissionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid claim submission request",
      400,
    );
  }
  try {
    const result = await persistClaimSubmission(parsed.data);
    return Response.json(
      claimSubmissionResponseSchema.parse({
        schemaVersion: "1",
        status: "pending",
        planHash: parsed.data.planHash,
        ...result,
      }),
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim submission could not be stored";
    const conflict =
      message.includes("not found") ||
      message.includes("does not match") ||
      message.includes("expired") ||
      message.includes("already has") ||
      message.includes("does not exist");
    return errorResponse(
      conflict ? "claim_plan_conflict" : "claim_submission_unavailable",
      message,
      conflict ? 409 : 503,
    );
  }
}
