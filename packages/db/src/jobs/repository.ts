import { and, eq, sql } from "drizzle-orm";
import type { ClaimRailDatabase } from "../client.js";
import { outboxJobs } from "../schema/index.js";

export interface LeasedOutboxJob {
  readonly id: string;
  readonly eventId: string;
  readonly topic: string;
  readonly payload: Record<string, unknown>;
  readonly status: "leased";
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
}

export interface LeaseOptions {
  readonly workerId: string;
  readonly leaseMs: number;
  readonly now?: Date;
}

export interface FailJobOptions {
  readonly jobId: string;
  readonly workerId: string;
  readonly error: string;
  readonly now?: Date;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

interface LeaseRow extends Record<string, unknown> {
  readonly id: string;
  readonly eventId: string;
  readonly topic: string;
  readonly payload: Record<string, unknown>;
  readonly status: "leased";
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
}

function positiveMilliseconds(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

export class OutboxJobRepository {
  constructor(private readonly db: ClaimRailDatabase) {}

  async leaseNext(options: LeaseOptions): Promise<LeasedOutboxJob | null> {
    const leaseMs = positiveMilliseconds(options.leaseMs, "leaseMs");
    if (options.workerId.trim() === "") throw new Error("workerId is required");
    const now = options.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const result = await this.db.execute<LeaseRow>(sql`
      with candidate as (
        select id
        from outbox_jobs
        where available_at <= ${now}
          and attempts < max_attempts
          and (
            status = 'pending'
            or (status = 'leased' and lease_expires_at <= ${now})
          )
        order by available_at asc, created_at asc
        for update skip locked
        limit 1
      )
      update outbox_jobs as job
      set status = 'leased',
          lease_owner = ${options.workerId},
          lease_expires_at = ${leaseExpiresAt},
          attempts = job.attempts + 1,
          updated_at = ${now}
      from candidate
      where job.id = candidate.id
      returning
        job.id,
        job.event_id as "eventId",
        job.topic,
        job.payload,
        job.status,
        job.attempts,
        job.max_attempts as "maxAttempts",
        job.lease_owner as "leaseOwner",
        job.lease_expires_at as "leaseExpiresAt"
    `);
    return result.rows[0] ?? null;
  }

  async complete(jobId: string, workerId: string, now = new Date()): Promise<boolean> {
    const rows = await this.db
      .update(outboxJobs)
      .set({
        status: "completed",
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(outboxJobs.id, jobId),
          eq(outboxJobs.status, "leased"),
          eq(outboxJobs.leaseOwner, workerId),
        ),
      )
      .returning({ id: outboxJobs.id });
    return rows.length === 1;
  }

  async fail(options: FailJobOptions): Promise<"pending" | "dead" | "not_owned"> {
    const now = options.now ?? new Date();
    const [job] = await this.db
      .select({ attempts: outboxJobs.attempts, maxAttempts: outboxJobs.maxAttempts })
      .from(outboxJobs)
      .where(
        and(
          eq(outboxJobs.id, options.jobId),
          eq(outboxJobs.status, "leased"),
          eq(outboxJobs.leaseOwner, options.workerId),
        ),
      )
      .limit(1);
    if (job === undefined) return "not_owned";
    const dead = job.attempts >= job.maxAttempts;
    const base = positiveMilliseconds(options.baseBackoffMs ?? 1_000, "baseBackoffMs");
    const cap = positiveMilliseconds(options.maxBackoffMs ?? 300_000, "maxBackoffMs");
    const exponent = Math.min(Math.max(job.attempts - 1, 0), 20);
    const delay = Math.min(base * 2 ** exponent, cap);
    const updated = await this.db
      .update(outboxJobs)
      .set({
        status: dead ? "dead" : "pending",
        availableAt: dead ? now : new Date(now.getTime() + delay),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: options.error.slice(0, 4_000),
        updatedAt: now,
      })
      .where(
        and(
          eq(outboxJobs.id, options.jobId),
          eq(outboxJobs.status, "leased"),
          eq(outboxJobs.leaseOwner, options.workerId),
        ),
      )
      .returning({ id: outboxJobs.id });
    return updated.length === 1 ? (dead ? "dead" : "pending") : "not_owned";
  }
}
