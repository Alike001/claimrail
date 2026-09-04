import { notificationTestResponseSchema } from "@claimrail/contracts";
import { enqueueAuthorizedTestNotification } from "@/src/server/deliveries";

export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ schemaVersion: "1", error: { code, message } }, { status });
}

export async function POST(request: Request) {
  try {
    const result = await enqueueAuthorizedTestNotification(request);
    if (result === null) {
      return errorResponse(
        "no_notification_routes",
        "Create and verify a browser, Telegram, or webhook route before sending a test.",
        409,
      );
    }
    return Response.json(notificationTestResponseSchema.parse(result), {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Test notification could not be queued";
    const unauthorized = message.includes("bearer token") || message.includes("invalid or expired");
    return errorResponse(
      unauthorized ? "unauthorized" : "test_notification_unavailable",
      message,
      unauthorized ? 401 : 503,
    );
  }
}
