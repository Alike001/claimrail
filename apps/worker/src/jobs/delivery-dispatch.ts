import { DeliveryRepository, OutboxJobRepository, type LeasedWebhookDelivery } from "@claimrail/db";
import type { WorkerJob } from "../runtime.js";

export type WebhookDispatcher = (
  delivery: LeasedWebhookDelivery,
) => Promise<{ readonly providerMessageId: string }>;

export interface DeliveryDispatchOptions {
  readonly outboxRepository: OutboxJobRepository;
  readonly deliveryRepository: DeliveryRepository;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly dispatch?: WebhookDispatcher;
}

export function createDeliveryDispatchJob(options: DeliveryDispatchOptions): WorkerJob {
  return async () => {
    if (options.dispatch === undefined) {
      return { status: "idle", detail: "webhook delivery encryption key is not configured" };
    }
    const delivery = await options.deliveryRepository.leaseNext({
      workerId: options.workerId,
      leaseMs: options.leaseMs,
    });
    if (delivery !== null) {
      try {
        const result = await options.dispatch(delivery);
        const completed = await options.deliveryRepository.complete({
          deliveryId: delivery.id,
          workerId: options.workerId,
          providerMessageId: result.providerMessageId,
        });
        if (!completed) throw new Error("DeliveryLeaseOwnershipError");
        return { status: "worked", detail: "signed webhook delivered", count: 1 };
      } catch (error) {
        await options.deliveryRepository.fail({
          deliveryId: delivery.id,
          workerId: options.workerId,
          error: error instanceof Error ? error.name : "UnknownError",
        });
        throw error;
      }
    }
    const job = await options.outboxRepository.leaseNext({
      workerId: options.workerId,
      leaseMs: options.leaseMs,
    });
    if (job === null) return { status: "idle", detail: "no ready event or delivery" };
    try {
      const created = await options.deliveryRepository.materializeEvent(job.eventId);
      const completed = await options.outboxRepository.complete(job.id, options.workerId);
      if (!completed) throw new Error("OutboxLeaseOwnershipError");
      return {
        status: "worked",
        detail: `canonical event routed to ${created} webhook subscriptions`,
        count: created,
      };
    } catch (error) {
      await options.outboxRepository.fail({
        jobId: job.id,
        workerId: options.workerId,
        error: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  };
}
