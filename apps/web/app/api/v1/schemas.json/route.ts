import { createClaimRailJsonSchemaBundle } from "@claimrail/contracts";

export function GET() {
  return Response.json(createClaimRailJsonSchemaBundle(), {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
