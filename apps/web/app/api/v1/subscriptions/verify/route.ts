import {
  subscriptionVerificationRequestSchema,
  subscriptionVerificationResponseSchema,
} from "@claimrail/contracts";
import { verifyWebhookSubscription } from "@/src/server/subscriptions";

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
  const parsed = subscriptionVerificationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid subscription verification request",
      400,
    );
  }
  try {
    const subscription = await verifyWebhookSubscription(parsed.data);
    return Response.json(subscriptionVerificationResponseSchema.parse(subscription), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription could not be verified";
    const conflict =
      message.includes("not found") ||
      message.includes("already used") ||
      message.includes("expired") ||
      message.includes("does not match") ||
      message.includes("signature");
    return errorResponse(
      conflict ? "subscription_verification_failed" : "subscription_unavailable",
      message,
      conflict ? 409 : 503,
    );
  }
}
