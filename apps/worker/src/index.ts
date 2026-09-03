import {
  ClaimRailStateRepository,
  ClaimRepository,
  createDatabase,
  databaseReadiness,
  DeliveryRepository,
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
import { createBrowserPushTransport } from "./browser-push-transport.js";
import { createTelegramTransport } from "./telegram-transport.js";
import { createWebhookTransport } from "./webhook-transport.js";

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
  const webhookTransport =
    config.secretEncryptionKey === undefined
      ? undefined
      : createWebhookTransport({ encryptionKey: config.secretEncryptionKey });
  const browserTransport =
    config.secretEncryptionKey === undefined || config.vapid === undefined
      ? undefined
      : createBrowserPushTransport({
          encryptionKey: config.secretEncryptionKey,
          vapid: config.vapid,
        });
  const telegramTransport =
    config.secretEncryptionKey === undefined || config.telegramBotToken === undefined
      ? undefined
      : createTelegramTransport({
          encryptionKey: config.secretEncryptionKey,
          botToken: config.telegramBotToken,
        });
  const enabledKinds = [
    ...(webhookTransport ? (["webhook"] as const) : []),
    ...(browserTransport ? (["browser"] as const) : []),
    ...(telegramTransport ? (["telegram"] as const) : []),
  ];
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
      outboxRepository: new OutboxJobRepository(database.db),
      deliveryRepository: new DeliveryRepository(database.db),
      workerId: config.workerId,
      leaseMs: config.leaseMs,
      ...(enabledKinds.length === 0
        ? {}
        : {
            enabledKinds,
            dispatch: async (delivery) => {
              if (delivery.kind === "webhook" && webhookTransport)
                return webhookTransport(delivery);
              if (delivery.kind === "browser" && browserTransport)
                return browserTransport(delivery);
              if (delivery.kind === "telegram" && telegramTransport)
                return telegramTransport(delivery);
              throw new Error("DeliveryTransportUnavailable");
            },
          }),
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
