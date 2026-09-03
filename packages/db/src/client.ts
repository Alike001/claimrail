import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type ClaimRailDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseContext {
  readonly pool: Pool;
  readonly db: ClaimRailDatabase;
  close(): Promise<void>;
}

export interface DatabaseHealth {
  readonly status: "healthy" | "unhealthy";
  readonly database: "reachable" | "unreachable";
  readonly checkedAt: string;
  readonly error?: string;
}

export interface DatabaseReadiness extends DatabaseHealth {
  readonly schema: "ready" | "missing" | "unknown";
}

export function createDatabase(
  connectionString: string,
  options: { readonly maxConnections?: number; readonly applicationName?: string } = {},
): DatabaseContext {
  if (connectionString.trim() === "") throw new Error("database connection string is required");
  const pool = new Pool({
    connectionString,
    max: options.maxConnections ?? 10,
    application_name: options.applicationName ?? "claimrail",
  });
  return {
    pool,
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

export async function migrateDatabase(
  context: DatabaseContext,
  migrationsFolder: string,
): Promise<void> {
  await migrate(context.db, { migrationsFolder });
}

export async function databaseHealth(context: DatabaseContext): Promise<DatabaseHealth> {
  const checkedAt = new Date().toISOString();
  try {
    await context.pool.query("select 1");
    return { status: "healthy", database: "reachable", checkedAt };
  } catch (error) {
    return {
      status: "unhealthy",
      database: "unreachable",
      checkedAt,
      error: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

export async function databaseReadiness(context: DatabaseContext): Promise<DatabaseReadiness> {
  const health = await databaseHealth(context);
  if (health.status === "unhealthy") return { ...health, schema: "unknown" };
  try {
    const result = await context.pool.query<{ table_name: string | null }>(
      "select to_regclass('public.outbox_jobs')::text as table_name",
    );
    const schema = result.rows[0]?.table_name === "outbox_jobs" ? "ready" : "missing";
    return {
      ...health,
      status: schema === "ready" ? "healthy" : "unhealthy",
      schema,
      ...(schema === "ready" ? {} : { error: "SchemaMissing" }),
    };
  } catch (error) {
    return {
      ...health,
      status: "unhealthy",
      schema: "unknown",
      error: error instanceof Error ? error.name : "UnknownError",
    };
  }
}
