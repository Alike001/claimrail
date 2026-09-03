import {
  browserSubscriptionChallengeResponseSchema,
  browserSubscriptionRequestSchema,
} from "@claimrail/contracts";
import { createBrowserSubscriptionChallenge } from "@/src/server/subscriptions";

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
  const parsed = browserSubscriptionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid browser subscription request",
      400,
    );
  }
  try {
    const challenge = await createBrowserSubscriptionChallenge(parsed.data);
    return Response.json(browserSubscriptionChallengeResponseSchema.parse(challenge), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Challenge could not be created";
    return errorResponse("browser_subscription_unavailable", message, 503);
  }
}
