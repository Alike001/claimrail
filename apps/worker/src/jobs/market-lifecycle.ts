import { idleJob, type WorkerJob } from "../runtime.js";

export function createMarketLifecycleJob(run?: WorkerJob): WorkerJob {
  return run ?? idleJob("market lifecycle polling is scaffolded for the API phase");
}
