export const WORKER_JOB_NAMES = [
  "market-lifecycle",
  "wallet-scan",
  "claim-receipt",
  "delivery-dispatch",
] as const;

export type WorkerJobName = (typeof WORKER_JOB_NAMES)[number];

export interface WorkerJobResult {
  readonly status: "idle" | "worked";
  readonly detail: string;
  readonly count?: number;
}

export type WorkerJob = () => Promise<WorkerJobResult>;

export interface JobHeartbeat {
  readonly status: "idle" | "running" | "succeeded" | "failed";
  readonly lastStartedAt?: string;
  readonly lastFinishedAt?: string;
  readonly lastResult?: WorkerJobResult;
  readonly error?: string;
}

function initialHeartbeats(): Record<WorkerJobName, JobHeartbeat> {
  return Object.fromEntries(WORKER_JOB_NAMES.map((name) => [name, { status: "idle" }])) as Record<
    WorkerJobName,
    JobHeartbeat
  >;
}

export class WorkerRuntime {
  private readonly heartbeats = initialHeartbeats();

  constructor(private readonly jobs: Readonly<Record<WorkerJobName, WorkerJob>>) {}

  snapshot(): Readonly<Record<WorkerJobName, JobHeartbeat>> {
    return structuredClone(this.heartbeats);
  }

  async runCycle(): Promise<Readonly<Record<WorkerJobName, JobHeartbeat>>> {
    await Promise.all(WORKER_JOB_NAMES.map((name) => this.runJob(name)));
    return this.snapshot();
  }

  async runUntilStopped(signal: AbortSignal, pollIntervalMs: number): Promise<void> {
    while (!signal.aborted) {
      await this.runCycle();
      if (signal.aborted) return;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timeout);
          signal.removeEventListener("abort", finish);
          resolve();
        };
        const timeout = setTimeout(finish, pollIntervalMs);
        signal.addEventListener("abort", finish, { once: true });
      });
    }
  }

  private async runJob(name: WorkerJobName): Promise<void> {
    const startedAt = new Date().toISOString();
    this.heartbeats[name] = { status: "running", lastStartedAt: startedAt };
    try {
      const result = await this.jobs[name]();
      this.heartbeats[name] = {
        status: "succeeded",
        lastStartedAt: startedAt,
        lastFinishedAt: new Date().toISOString(),
        lastResult: result,
      };
    } catch (error) {
      this.heartbeats[name] = {
        status: "failed",
        lastStartedAt: startedAt,
        lastFinishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.name : "UnknownError",
      };
    }
  }
}

export function idleJob(detail: string): WorkerJob {
  return async () => ({ status: "idle", detail });
}
