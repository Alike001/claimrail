import type { DatabaseReadiness, OutboxJobRepository } from "@claimrail/db";
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
    });
    const publicConfig = publicWorkerConfig(config);
    expect(publicConfig).toMatchObject({
      workerId: "worker-a",
      runOnce: true,
      shannonWalletSyncEnabled: true,
    });
    expect(JSON.stringify(publicConfig)).not.toContain("secret");
    expect(JSON.stringify(publicConfig)).not.toContain("0xe1da");
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
      repository: { leaseNext } as unknown as OutboxJobRepository,
      workerId: "worker-a",
      leaseMs: 30_000,
    });
    await expect(job()).resolves.toMatchObject({ status: "idle" });
    expect(leaseNext).not.toHaveBeenCalled();
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
