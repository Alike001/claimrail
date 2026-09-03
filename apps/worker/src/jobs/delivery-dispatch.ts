import { OutboxJobRepository, type LeasedOutboxJob } from "@claimrail/db";
import type { WorkerJob } from "../runtime.js";

export type OutboxDispatcher = (job: LeasedOutboxJob) => Promise<void>;

export interface DeliveryDispatchOptions {
  readonly repository: OutboxJobRepository;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly dispatch?: OutboxDispatcher;
}

export function createDeliveryDispatchJob(options: DeliveryDispatchOptions): WorkerJob {
  return async () => {
    if (options.dispatch === undefined) {
      return { status: "idle", detail: "delivery transport is not configured in Phase 4" };
    }
    const job = await options.repository.leaseNext({
      workerId: options.workerId,
      leaseMs: options.leaseMs,
    });
    if (job === null) return { status: "idle", detail: "no ready outbox job" };
    try {
      await options.dispatch(job);
      const completed = await options.repository.complete(job.id, options.workerId);
      if (!completed) throw new Error("OutboxLeaseOwnershipError");
      return { status: "worked", detail: "outbox job dispatched", count: 1 };
    } catch (error) {
      await options.repository.fail({
        jobId: job.id,
        workerId: options.workerId,
        error: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  };
}
