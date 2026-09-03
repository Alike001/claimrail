import { browserConfigurationResponseSchema } from "@claimrail/contracts";
import { browserNotificationConfiguration } from "@/src/server/subscriptions";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    browserConfigurationResponseSchema.parse(browserNotificationConfiguration()),
    {
      headers: { "cache-control": "no-store" },
    },
  );
}
