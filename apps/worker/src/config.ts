export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly workerId: string;
  readonly runOnce: boolean;
  readonly pollIntervalMs: number;
  readonly leaseMs: number;
  readonly syncWallet?: string;
  readonly secretEncryptionKey?: string;
  readonly telegramBotToken?: string;
  readonly vapid?: {
    readonly subject: string;
    readonly publicKey: string;
    readonly privateKey: string;
  };
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function boolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function readWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const syncWallet = environment.CLAIMRAIL_SYNC_WALLET?.trim();
  const secretEncryptionKey = environment.CLAIMRAIL_SECRET_ENCRYPTION_KEY?.trim();
  const telegramBotToken = environment.CLAIMRAIL_TELEGRAM_BOT_TOKEN?.trim();
  const vapidSubject = environment.CLAIMRAIL_VAPID_SUBJECT?.trim();
  const vapidPublicKey = environment.CLAIMRAIL_VAPID_PUBLIC_KEY?.trim();
  const vapidPrivateKey = environment.CLAIMRAIL_VAPID_PRIVATE_KEY?.trim();
  const vapidValues = [vapidSubject, vapidPublicKey, vapidPrivateKey];
  if (vapidValues.some(Boolean) && !vapidValues.every(Boolean)) {
    throw new Error("CLAIMRAIL_VAPID_SUBJECT, PUBLIC_KEY, and PRIVATE_KEY must be set together");
  }
  return {
    databaseUrl: required(environment, "DATABASE_URL"),
    workerId: environment.CLAIMRAIL_WORKER_ID?.trim() || `claimrail-${process.pid}`,
    runOnce: boolean(environment.CLAIMRAIL_RUN_ONCE, false, "CLAIMRAIL_RUN_ONCE"),
    pollIntervalMs: positiveInteger(
      environment.CLAIMRAIL_POLL_INTERVAL_MS,
      15_000,
      "CLAIMRAIL_POLL_INTERVAL_MS",
    ),
    leaseMs: positiveInteger(environment.CLAIMRAIL_LEASE_MS, 30_000, "CLAIMRAIL_LEASE_MS"),
    ...(syncWallet ? { syncWallet } : {}),
    ...(secretEncryptionKey ? { secretEncryptionKey } : {}),
    ...(telegramBotToken ? { telegramBotToken } : {}),
    ...(vapidSubject && vapidPublicKey && vapidPrivateKey
      ? { vapid: { subject: vapidSubject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey } }
      : {}),
  };
}

export function publicWorkerConfig(config: WorkerConfig) {
  return {
    workerId: config.workerId,
    runOnce: config.runOnce,
    pollIntervalMs: config.pollIntervalMs,
    leaseMs: config.leaseMs,
    shannonWalletSyncEnabled: config.syncWallet !== undefined,
    webhookDeliveryEnabled: config.secretEncryptionKey !== undefined,
    browserPushDeliveryEnabled:
      config.secretEncryptionKey !== undefined && config.vapid !== undefined,
    telegramDeliveryEnabled:
      config.secretEncryptionKey !== undefined && config.telegramBotToken !== undefined,
  };
}
