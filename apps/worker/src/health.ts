import type { DatabaseReadiness } from "@claimrail/db";
import type { JobHeartbeat, WorkerJobName } from "./runtime.js";

export interface WorkerHealth {
  readonly service: "claimrail-worker";
  readonly status: "ready" | "degraded";
  readonly workerId: string;
  readonly checkedAt: string;
  readonly database: DatabaseReadiness["database"];
  readonly schema: DatabaseReadiness["schema"];
  readonly jobs: Readonly<Record<WorkerJobName, JobHeartbeat>>;
}

export function createWorkerHealth(
  workerId: string,
  database: DatabaseReadiness,
  jobs: Readonly<Record<WorkerJobName, JobHeartbeat>>,
): WorkerHealth {
  const failedJob = Object.values(jobs).some(({ status }) => status === "failed");
  return {
    service: "claimrail-worker",
    status: database.status === "healthy" && !failedJob ? "ready" : "degraded",
    workerId,
    checkedAt: new Date().toISOString(),
    database: database.database,
    schema: database.schema,
    jobs,
  };
}
