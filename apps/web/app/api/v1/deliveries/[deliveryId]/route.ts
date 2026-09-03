import { deliveryDetailResponseSchema, deliveryIdSchema } from "@claimrail/contracts";
import { readAuthorizedDelivery } from "@/src/server/deliveries";

export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ schemaVersion: "1", error: { code, message } }, { status });
}

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly deliveryId: string }> },
) {
  const parsedId = deliveryIdSchema.safeParse(decodeURIComponent((await params).deliveryId));
  if (!parsedId.success) return errorResponse("invalid_delivery_id", "Invalid delivery ID", 400);
  try {
    const delivery = await readAuthorizedDelivery(request, parsedId.data);
    if (delivery === null)
      return errorResponse("delivery_not_found", "Delivery was not found", 404);
    return Response.json(deliveryDetailResponseSchema.parse(delivery), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery could not be loaded";
    const unauthorized = message.includes("bearer token") || message.includes("invalid or expired");
    return errorResponse(
      unauthorized ? "unauthorized" : "delivery_unavailable",
      message,
      unauthorized ? 401 : 503,
    );
  }
}
