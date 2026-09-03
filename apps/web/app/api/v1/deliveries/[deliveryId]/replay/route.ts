import { deliveryIdSchema, deliveryReplayResponseSchema } from "@claimrail/contracts";
import { replayAuthorizedDelivery } from "@/src/server/deliveries";

export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ schemaVersion: "1", error: { code, message } }, { status });
}

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ readonly deliveryId: string }> },
) {
  const parsedId = deliveryIdSchema.safeParse(decodeURIComponent((await params).deliveryId));
  if (!parsedId.success) return errorResponse("invalid_delivery_id", "Invalid delivery ID", 400);
  try {
    const replay = await replayAuthorizedDelivery(request, parsedId.data);
    if (replay === null) {
      return errorResponse(
        "delivery_not_replayable",
        "The delivery was not found or is not in the dead-letter state",
        404,
      );
    }
    return Response.json(deliveryReplayResponseSchema.parse(replay), {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery could not be replayed";
    const unauthorized = message.includes("bearer token") || message.includes("invalid or expired");
    return errorResponse(
      unauthorized ? "unauthorized" : "delivery_unavailable",
      message,
      unauthorized ? 401 : 503,
    );
  }
}
