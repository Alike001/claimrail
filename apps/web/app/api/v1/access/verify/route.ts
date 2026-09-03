import {
  accessVerificationRequestSchema,
  accessVerificationResponseSchema,
} from "@claimrail/contracts";
import { verifyDeliveryConsoleAccess } from "@/src/server/deliveries";

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
  const parsed = accessVerificationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid access verification request",
      400,
    );
  }
  try {
    const access = await verifyDeliveryConsoleAccess(parsed.data);
    return Response.json(accessVerificationResponseSchema.parse(access), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access could not be verified";
    const verificationFailure =
      message.includes("not found") ||
      message.includes("already used") ||
      message.includes("expired") ||
      message.includes("does not match") ||
      message.includes("signature");
    return errorResponse(
      verificationFailure ? "access_verification_failed" : "access_unavailable",
      message,
      verificationFailure ? 409 : 503,
    );
  }
}
