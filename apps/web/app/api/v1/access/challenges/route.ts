import {
  deliveryConsoleChallengeRequestSchema,
  deliveryConsoleChallengeResponseSchema,
} from "@claimrail/contracts";
import { createDeliveryConsoleChallenge } from "@/src/server/deliveries";

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
  const parsed = deliveryConsoleChallengeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid delivery-console challenge request",
      400,
    );
  }
  try {
    const challenge = await createDeliveryConsoleChallenge(parsed.data.owner);
    return Response.json(deliveryConsoleChallengeResponseSchema.parse(challenge), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Challenge could not be created";
    return errorResponse("access_unavailable", message, 503);
  }
}
