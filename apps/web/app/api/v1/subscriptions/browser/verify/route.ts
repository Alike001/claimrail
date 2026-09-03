import {
  browserSubscriptionVerificationRequestSchema,
  browserSubscriptionVerificationResponseSchema,
} from "@claimrail/contracts";
import { verifyBrowserSubscription } from "@/src/server/subscriptions";

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
  const parsed = browserSubscriptionVerificationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid browser verification request",
      400,
    );
  }
  try {
    const subscription = await verifyBrowserSubscription(parsed.data);
    return Response.json(browserSubscriptionVerificationResponseSchema.parse(subscription), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser subscription failed";
    const invalid =
      message.includes("not found") ||
      message.includes("already used") ||
      message.includes("expired") ||
      message.includes("does not match") ||
      message.includes("signature");
    return errorResponse(
      invalid ? "browser_verification_failed" : "browser_subscription_unavailable",
      message,
      invalid ? 409 : 503,
    );
  }
}
