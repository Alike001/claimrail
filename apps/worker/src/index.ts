import {
  ClaimRailStateRepository,
  ClaimRepository,
  createDatabase,
  databaseReadiness,
  OutboxJobRepository,
} from "@claimrail/db";
import { ClaimRailReadService, DreamDexSdkGateway, SHANNON_DREAMDEX } from "@claimrail/dreamdex";
import { publicWorkerConfig, readWorkerConfig } from "./config.js";
import { createWorkerHealth } from "./health.js";
import { createClaimReceiptJob } from "./jobs/claim-receipt.js";
import { createDeliveryDispatchJob } from "./jobs/delivery-dispatch.js";
import { createMarketLifecycleJob } from "./jobs/market-lifecycle.js";
import { createWalletScanJob } from "./jobs/wallet-scan.js";
import { WorkerRuntime } from "./runtime.js";

async function closeWithin(close: () => Promise<void>, timeoutMs = 5_000): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      close(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const config = readWorkerConfig();
  const database = createDatabase(config.databaseUrl, {
    applicationName: config.workerId,
    maxConnections: 8,
  });
  const gateway = new DreamDexSdkGateway(SHANNON_DREAMDEX);
  const runtime = new WorkerRuntime({
    "market-lifecycle": createMarketLifecycleJob(),
    "wallet-scan": createWalletScanJob(
      config.syncWallet === undefined
        ? undefined
        : {
            wallet: config.syncWallet,
            deployment: SHANNON_DREAMDEX,
            service: new ClaimRailReadService({ deployment: SHANNON_DREAMDEX, gateway }),
            repository: new ClaimRailStateRepository(database.db),
          },
    ),
    "claim-receipt": createClaimReceiptJob({
      repository: new ClaimRepository(database.db),
      deployment: SHANNON_DREAMDEX,
      gateway,
      workerId: config.workerId,
      leaseMs: config.leaseMs,
    }),
    "delivery-dispatch": createDeliveryDispatchJob({
      repository: new OutboxJobRepository(database.db),
      workerId: config.workerId,
      leaseMs: config.leaseMs,
    }),
  });
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  try {
    const readiness = await databaseReadiness(database);
    if (readiness.status !== "healthy") {
      process.stdout.write(
        `${JSON.stringify({ config: publicWorkerConfig(config), health: createWorkerHealth(config.workerId, readiness, runtime.snapshot()) })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (!config.runOnce) {
      process.stdout.write(
        `${JSON.stringify({ config: publicWorkerConfig(config), health: createWorkerHealth(config.workerId, readiness, runtime.snapshot()) })}\n`,
      );
    }
    if (config.runOnce) await runtime.runCycle();
    else await runtime.runUntilStopped(stop.signal, config.pollIntervalMs);
    const health = createWorkerHealth(
      config.workerId,
      await databaseReadiness(database),
      runtime.snapshot(),
    );
    process.stdout.write(`${JSON.stringify({ config: publicWorkerConfig(config), health })}\n`);
    if (health.status !== "ready") process.exitCode = 1;
  } finally {
    await closeWithin(() => gateway.close());
    await closeWithin(() => database.close());
  }
}

void main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ service: "claimrail-worker", status: "failed", error: error instanceof Error ? error.name : "UnknownError" })}\n`,
    );
    process.exit(1);
  },
);
