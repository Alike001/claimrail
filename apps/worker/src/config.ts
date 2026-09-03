export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly workerId: string;
  readonly runOnce: boolean;
  readonly pollIntervalMs: number;
  readonly leaseMs: number;
  readonly syncWallet?: string;
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
  };
}

export function publicWorkerConfig(config: WorkerConfig) {
  return {
    workerId: config.workerId,
    runOnce: config.runOnce,
    pollIntervalMs: config.pollIntervalMs,
    leaseMs: config.leaseMs,
    shannonWalletSyncEnabled: config.syncWallet !== undefined,
  };
}
