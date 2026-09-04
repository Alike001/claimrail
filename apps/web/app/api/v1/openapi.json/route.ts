import { createClaimRailOpenApiDocument } from "@claimrail/contracts";

export function GET() {
  return Response.json(createClaimRailOpenApiDocument(), {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
