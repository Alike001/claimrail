import { createDatabase, databaseReadiness } from "@claimrail/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return Response.json(
      {
        service: "claimrail-web",
        status: "unhealthy",
        database: "unconfigured",
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const database = createDatabase(databaseUrl, {
    maxConnections: 1,
    applicationName: "claimrail-web-health",
  });
  try {
    const readiness = await databaseReadiness(database);
    return Response.json(
      {
        service: "claimrail-web",
        status: readiness.status === "healthy" ? "ready" : "unhealthy",
        database: readiness.database,
        schema: readiness.schema,
        checkedAt: readiness.checkedAt,
      },
      {
        status: readiness.status === "healthy" ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } finally {
    await database.close();
  }
}
