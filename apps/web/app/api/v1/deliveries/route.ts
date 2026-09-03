import { deliveryListResponseSchema } from "@claimrail/contracts";
import { listAuthorizedDeliveries } from "@/src/server/deliveries";

export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ schemaVersion: "1", error: { code, message } }, { status });
}

export async function GET(request: Request) {
  try {
    const list = await listAuthorizedDeliveries(request);
    return Response.json(deliveryListResponseSchema.parse(list), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deliveries could not be loaded";
    const unauthorized = message.includes("bearer token") || message.includes("invalid or expired");
    return errorResponse(
      unauthorized ? "unauthorized" : "deliveries_unavailable",
      message,
      unauthorized ? 401 : 503,
    );
  }
}
