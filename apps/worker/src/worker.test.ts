import type {
  DatabaseReadiness,
  DeliveryRepository,
  LeasedWebhookDelivery,
  OutboxJobRepository,
} from "@claimrail/db";
import { describe, expect, it, vi } from "vitest";
import { publicWorkerConfig, readWorkerConfig } from "./config.js";
import { createWorkerHealth } from "./health.js";
import { createDeliveryDispatchJob } from "./jobs/delivery-dispatch.js";
import { WORKER_JOB_NAMES, WorkerRuntime, type WorkerJob } from "./runtime.js";

function jobs(overrides: Partial<Record<(typeof WORKER_JOB_NAMES)[number], WorkerJob>> = {}) {
  const idle: WorkerJob = async () => ({ status: "idle", detail: "nothing ready" });
  return {
    "market-lifecycle": overrides["market-lifecycle"] ?? idle,
    "wallet-scan": overrides["wallet-scan"] ?? idle,
    "claim-receipt": overrides["claim-receipt"] ?? idle,
    "delivery-dispatch": overrides["delivery-dispatch"] ?? idle,
  };
}

describe("worker runtime", () => {
  it("parses config while keeping the database URL and watched address private", () => {
    const config = readWorkerConfig({
      DATABASE_URL: "postgresql://claimrail:secret@database.internal/claimrail",
      CLAIMRAIL_WORKER_ID: "worker-a",
      CLAIMRAIL_RUN_ONCE: "true",
      CLAIMRAIL_SYNC_WALLET: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
      CLAIMRAIL_SECRET_ENCRYPTION_KEY: "secret-that-must-not-be-logged",
    });
    const publicConfig = publicWorkerConfig(config);
    expect(publicConfig).toMatchObject({
      workerId: "worker-a",
      runOnce: true,
      shannonWalletSyncEnabled: true,
      webhookDeliveryEnabled: true,
    });
    expect(JSON.stringify(publicConfig)).not.toContain("secret");
    expect(JSON.stringify(publicConfig)).not.toContain("0xe1da");
    expect(JSON.stringify(publicConfig)).not.toContain("secret-that");
  });

  it("runs all four lanes and records error classes without error messages", async () => {
    const called = vi.fn();
    const worked: WorkerJob = async () => {
      called();
      return { status: "worked", detail: "processed", count: 1 };
    };
    const runtime = new WorkerRuntime(
      jobs({
        "market-lifecycle": worked,
        "wallet-scan": async () => {
          throw new TypeError("postgresql://user:password@internal");
        },
        "claim-receipt": worked,
        "delivery-dispatch": worked,
      }),
    );
    const snapshot = await runtime.runCycle();
    expect(called).toHaveBeenCalledTimes(3);
    expect(snapshot["wallet-scan"]).toMatchObject({ status: "failed", error: "TypeError" });
    expect(JSON.stringify(snapshot)).not.toContain("password");
  });

  it("does not lease an outbox job until a delivery transport exists", async () => {
    const leaseNext = vi.fn();
    const job = createDeliveryDispatchJob({
      outboxRepository: { leaseNext } as unknown as OutboxJobRepository,
      deliveryRepository: { leaseNext } as unknown as DeliveryRepository,
      workerId: "worker-a",
      leaseMs: 30_000,
    });
    await expect(job()).resolves.toMatchObject({ status: "idle" });
    expect(leaseNext).not.toHaveBeenCalled();
  });

  it("completes one independently leased signed webhook delivery", async () => {
    const leased = {
      id: "0d904bb5-4a5f-442d-a3fe-734646d50d58",
      subscriptionId: "c742d9c7-b1af-4e14-b90f-bf58355318ad",
      destination: "https://agent.example.test/claimrail",
      secretCiphertext: "v1.iv.tag.ciphertext",
      attempt: 1,
      maxAttempts: 8,
      leaseOwner: "worker-a",
      event: {
        id: "event-1",
        schemaVersion: "1",
        type: "wallet.claimable",
        aggregateType: "wallet",
        aggregateId: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
        occurredAt: "2026-09-03T12:00:00.000Z",
        payload: {},
        sourceTransactionHash: null,
        sourceLogIndex: null,
        blockNumber: null,
      },
    } satisfies LeasedWebhookDelivery;
    const complete = vi.fn(async () => true);
    const dispatch = vi.fn(async () => ({ providerMessageId: "receiver-42" }));
    const job = createDeliveryDispatchJob({
      outboxRepository: { leaseNext: vi.fn() } as unknown as OutboxJobRepository,
      deliveryRepository: {
        leaseNext: vi.fn(async () => leased),
        complete,
      } as unknown as DeliveryRepository,
      workerId: "worker-a",
      leaseMs: 30_000,
      dispatch,
    });
    await expect(job()).resolves.toMatchObject({ status: "worked", count: 1 });
    expect(dispatch).toHaveBeenCalledWith(leased);
    expect(complete).toHaveBeenCalledWith({
      deliveryId: leased.id,
      workerId: "worker-a",
      providerMessageId: "receiver-42",
    });
  });

  it("reports readiness without endpoints or database errors", () => {
    const database: DatabaseReadiness = {
      status: "healthy",
      database: "reachable",
      schema: "ready",
      checkedAt: new Date(0).toISOString(),
    };
    const health = createWorkerHealth("worker-a", database, new WorkerRuntime(jobs()).snapshot());
    expect(health).toMatchObject({ status: "ready", database: "reachable", schema: "ready" });
    expect(JSON.stringify(health)).not.toContain("postgresql://");
  });
});
