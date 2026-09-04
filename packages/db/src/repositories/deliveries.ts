import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { canonicalDeliveryEventSchema, type CanonicalDeliveryEvent } from "@claimrail/contracts";
import type { ClaimRailDatabase } from "../client.js";
import {
  canonicalEvents,
  claims,
  auditRecords,
  deliveryAttempts,
  deliveries,
  positions,
  subscriptions,
  watchedWallets,
} from "../schema/index.js";

export interface LeasedWebhookDelivery {
  readonly id: string;
  readonly subscriptionId: string;
  readonly destination: string;
  readonly kind: "webhook" | "browser" | "telegram";
  readonly secretCiphertext: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly leaseOwner: string;
  readonly event: CanonicalDeliveryEvent;
}

export interface StoredDeliveryListItem {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: CanonicalDeliveryEvent["type"];
  readonly owner: string;
  readonly destination: string;
  readonly kind: "webhook" | "browser" | "telegram";
  readonly status: "pending" | "delivering" | "delivered" | "failed" | "dead";
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly lastAttemptAt: Date | null;
  readonly nextAttemptAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
}

export interface StoredDeliveryAttempt {
  readonly attempt: number;
  readonly status: string;
  readonly httpStatus: number | null;
  readonly providerMessageId: string | null;
  readonly error: string | null;
  readonly signatureVersion: string | null;
  readonly requestTimestamp: number | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

export interface StoredDeliveryDetail extends StoredDeliveryListItem {
  readonly event: CanonicalDeliveryEvent;
  readonly attempts: readonly StoredDeliveryAttempt[];
}

export interface EnqueuedTestNotification {
  readonly eventId: string;
  readonly status: "queued" | "cooldown";
  readonly routeCount: number;
  readonly deliveryCount: number;
  readonly nextAllowedAt: Date;
}

interface DeliveryLeaseRow extends Record<string, unknown> {
  readonly id: string;
  readonly subscriptionId: string;
  readonly destination: string;
  readonly kind: "webhook" | "browser" | "telegram";
  readonly secretCiphertext: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly leaseOwner: string;
  readonly event: unknown;
}

function positiveMilliseconds(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function payloadOwner(payload: Record<string, unknown>): string | null {
  for (const key of ["wallet", "owner"] as const) {
    const value = payload[key];
    if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
      return value.toLowerCase();
    }
  }
  return null;
}

export class DeliveryRepository {
  constructor(private readonly db: ClaimRailDatabase) {}

  async enqueueTestNotification(input: {
    readonly ownerAddress: string;
    readonly now?: Date;
    readonly cooldownMs?: number;
  }): Promise<EnqueuedTestNotification | null> {
    const owner = input.ownerAddress.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(owner)) throw new Error("valid owner address is required");
    const now = input.now ?? new Date();
    const cooldownMs = positiveMilliseconds(input.cooldownMs ?? 60_000, "cooldownMs");
    const earliestAllowed = new Date(now.getTime() - cooldownMs);
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`claimrail:test:${owner}`}, 0))`,
      );
      const routes = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.ownerAddress, owner),
            eq(subscriptions.active, true),
            isNotNull(subscriptions.verifiedAt),
            isNotNull(subscriptions.secretCiphertext),
          ),
        );
      if (routes.length === 0) return null;
      const recent = await tx
        .select({ id: canonicalEvents.id, occurredAt: canonicalEvents.occurredAt })
        .from(canonicalEvents)
        .where(
          and(
            eq(canonicalEvents.type, "notification.test"),
            eq(canonicalEvents.aggregateType, "wallet"),
            eq(canonicalEvents.aggregateId, owner),
            gt(canonicalEvents.occurredAt, earliestAllowed),
          ),
        )
        .orderBy(desc(canonicalEvents.occurredAt))
        .limit(1);
      const previous = recent[0];
      if (previous !== undefined) {
        return {
          eventId: previous.id,
          status: "cooldown" as const,
          routeCount: routes.length,
          deliveryCount: 0,
          nextAllowedAt: new Date(previous.occurredAt.getTime() + cooldownMs),
        };
      }
      const eventId = `0x${createHash("sha256")
        .update(`notification.test:${owner}:${now.toISOString()}`)
        .digest("hex")}`;
      const notice =
        "This is a ClaimRail test notification. It is not a market settlement or claimable payout.";
      await tx.insert(canonicalEvents).values({
        id: eventId,
        type: "notification.test",
        aggregateType: "wallet",
        aggregateId: owner,
        schemaVersion: "1",
        payload: { owner, testOnly: true, notice },
        occurredAt: now,
        createdAt: now,
      });
      const inserted = await tx
        .insert(deliveries)
        .values(
          routes.map(({ id }) => ({
            subscriptionId: id,
            eventId,
            status: "pending" as const,
            nextAttemptAt: now,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing({ target: [deliveries.subscriptionId, deliveries.eventId] })
        .returning({ id: deliveries.id });
      await tx.insert(auditRecords).values({
        idempotencyKey: `notification-test:${eventId}`,
        action: "notification.test_queued",
        actorType: "wallet",
        actorId: owner,
        subjectType: "canonical_event",
        subjectId: eventId,
        details: { routeCount: routes.length, testOnly: true },
        occurredAt: now,
      });
      return {
        eventId,
        status: "queued" as const,
        routeCount: routes.length,
        deliveryCount: inserted.length,
        nextAllowedAt: new Date(now.getTime() + cooldownMs),
      };
    });
  }

  async materializeEvent(eventId: string, now = new Date()): Promise<number> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(canonicalEvents)
        .where(eq(canonicalEvents.id, eventId))
        .limit(1);
      const event = rows[0];
      if (event === undefined) throw new Error("canonical delivery event was not found");
      let owner =
        event.aggregateType === "wallet" && /^0x[0-9a-fA-F]{40}$/.test(event.aggregateId)
          ? event.aggregateId.toLowerCase()
          : payloadOwner(event.payload);
      if (owner === null && event.aggregateType === "claim") {
        const claimRows = await tx
          .select({ owner: claims.owner })
          .from(claims)
          .where(eq(claims.id, event.aggregateId))
          .limit(1);
        owner = claimRows[0]?.owner.toLowerCase() ?? null;
      }
      if (owner === null && event.aggregateType === "position") {
        const positionRows = await tx
          .select({ owner: watchedWallets.address })
          .from(positions)
          .innerJoin(watchedWallets, eq(watchedWallets.id, positions.walletId))
          .where(eq(positions.identity, event.aggregateId))
          .limit(1);
        owner = positionRows[0]?.owner.toLowerCase() ?? null;
      }
      if (owner === null) return 0;
      const routes = await tx
        .select({
          id: subscriptions.id,
          eventTypes: subscriptions.eventTypes,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.ownerAddress, owner),
            eq(subscriptions.active, true),
            isNotNull(subscriptions.verifiedAt),
            isNotNull(subscriptions.secretCiphertext),
          ),
        );
      const matching = routes.filter(({ eventTypes }) => eventTypes.includes(event.type));
      if (matching.length === 0) return 0;
      const inserted = await tx
        .insert(deliveries)
        .values(
          matching.map(({ id }) => ({
            subscriptionId: id,
            eventId: event.id,
            status: "pending" as const,
            nextAttemptAt: now,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing({ target: [deliveries.subscriptionId, deliveries.eventId] })
        .returning({ id: deliveries.id });
      return inserted.length;
    });
  }

  async leaseNext(input: {
    readonly workerId: string;
    readonly leaseMs: number;
    readonly enabledKinds?: readonly ("webhook" | "browser" | "telegram")[];
    readonly now?: Date;
  }): Promise<LeasedWebhookDelivery | null> {
    if (input.workerId.trim() === "") throw new Error("workerId is required");
    const leaseMs = positiveMilliseconds(input.leaseMs, "leaseMs");
    const now = input.now ?? new Date();
    const enabledKinds = input.enabledKinds ?? ["webhook"];
    if (enabledKinds.length === 0) return null;
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    return this.db.transaction(async (tx) => {
      const result = await tx.execute<DeliveryLeaseRow>(sql`
        with candidate as (
          select delivery.id
          from deliveries as delivery
          join subscriptions as subscription on subscription.id = delivery.subscription_id
          where subscription.active = true
            and subscription.verified_at is not null
            and subscription.secret_ciphertext is not null
            and (
              (subscription.kind = 'webhook' and ${enabledKinds.includes("webhook")})
              or (subscription.kind = 'browser' and ${enabledKinds.includes("browser")})
              or (subscription.kind = 'telegram' and ${enabledKinds.includes("telegram")})
            )
            and delivery.attempt_count < delivery.max_attempts
            and coalesce(delivery.next_attempt_at, delivery.created_at) <= ${now}
            and (
              delivery.status in ('pending', 'failed')
              or (delivery.status = 'delivering' and delivery.lease_expires_at <= ${now})
            )
          order by coalesce(delivery.next_attempt_at, delivery.created_at), delivery.created_at
          for update of delivery skip locked
          limit 1
        )
        update deliveries as delivery
        set status = 'delivering',
            lease_owner = ${input.workerId},
            lease_expires_at = ${leaseExpiresAt},
            attempt_count = delivery.attempt_count + 1,
            updated_at = ${now}
        from candidate, subscriptions as subscription, canonical_events as event
        where delivery.id = candidate.id
          and subscription.id = delivery.subscription_id
          and event.id = delivery.event_id
        returning
          delivery.id,
          delivery.subscription_id as "subscriptionId",
          subscription.destination,
          subscription.kind,
          subscription.secret_ciphertext as "secretCiphertext",
          delivery.attempt_count as attempt,
          delivery.max_attempts as "maxAttempts",
          delivery.lease_owner as "leaseOwner",
          jsonb_build_object(
            'id', event.id,
            'schemaVersion', event.schema_version,
            'type', event.type,
            'aggregateType', event.aggregate_type,
            'aggregateId', event.aggregate_id,
            'occurredAt', to_char(event.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'payload', event.payload,
            'sourceTransactionHash', event.source_transaction_hash,
            'sourceLogIndex', event.source_log_index,
            'blockNumber', case when event.block_number is null then null else event.block_number::text end
          ) as event
      `);
      const row = result.rows[0];
      if (row === undefined) return null;
      await tx
        .insert(deliveryAttempts)
        .values({
          deliveryId: row.id,
          attemptNumber: row.attempt,
          status: "delivering",
          startedAt: now,
        })
        .onConflictDoNothing({
          target: [deliveryAttempts.deliveryId, deliveryAttempts.attemptNumber],
        });
      return { ...row, event: canonicalDeliveryEventSchema.parse(row.event) };
    });
  }

  async complete(input: {
    readonly deliveryId: string;
    readonly workerId: string;
    readonly attempt: number;
    readonly providerMessageId?: string;
    readonly httpStatus?: number;
    readonly signatureVersion?: string;
    readonly requestTimestamp?: number;
    readonly now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(deliveries)
        .set({
          status: "delivered",
          providerMessageId: input.providerMessageId ?? null,
          deliveredAt: now,
          nextAttemptAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(deliveries.id, input.deliveryId),
            eq(deliveries.status, "delivering"),
            eq(deliveries.leaseOwner, input.workerId),
            eq(deliveries.attemptCount, input.attempt),
          ),
        )
        .returning({ id: deliveries.id });
      if (rows.length !== 1) return false;
      await tx
        .update(deliveryAttempts)
        .set({
          status: "delivered",
          providerMessageId: input.providerMessageId ?? null,
          httpStatus: input.httpStatus ?? null,
          signatureVersion: input.signatureVersion ?? null,
          requestTimestamp: input.requestTimestamp ?? null,
          finishedAt: now,
        })
        .where(
          and(
            eq(deliveryAttempts.deliveryId, input.deliveryId),
            eq(deliveryAttempts.attemptNumber, input.attempt),
          ),
        );
      return true;
    });
  }

  async fail(input: {
    readonly deliveryId: string;
    readonly workerId: string;
    readonly attempt: number;
    readonly error: string;
    readonly httpStatus?: number;
    readonly signatureVersion?: string;
    readonly requestTimestamp?: number;
    readonly terminal?: boolean;
    readonly now?: Date;
    readonly baseBackoffMs?: number;
    readonly maxBackoffMs?: number;
  }): Promise<"failed" | "dead" | "not_owned"> {
    const now = input.now ?? new Date();
    const rows = await this.db
      .select({
        attemptCount: deliveries.attemptCount,
        maxAttempts: deliveries.maxAttempts,
        subscriptionId: deliveries.subscriptionId,
      })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.id, input.deliveryId),
          eq(deliveries.status, "delivering"),
          eq(deliveries.leaseOwner, input.workerId),
        ),
      )
      .limit(1);
    const delivery = rows[0];
    if (delivery === undefined) return "not_owned";
    const dead = input.terminal === true || delivery.attemptCount >= delivery.maxAttempts;
    const base = positiveMilliseconds(input.baseBackoffMs ?? 1_000, "baseBackoffMs");
    const cap = positiveMilliseconds(input.maxBackoffMs ?? 300_000, "maxBackoffMs");
    const exponent = Math.min(Math.max(delivery.attemptCount - 1, 0), 20);
    const delay = Math.min(base * 2 ** exponent, cap);
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(deliveries)
        .set({
          status: dead ? "dead" : "failed",
          nextAttemptAt: dead ? null : new Date(now.getTime() + delay),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: input.error.slice(0, 4_000),
          updatedAt: now,
        })
        .where(
          and(
            eq(deliveries.id, input.deliveryId),
            eq(deliveries.status, "delivering"),
            eq(deliveries.leaseOwner, input.workerId),
            eq(deliveries.attemptCount, input.attempt),
          ),
        )
        .returning({ id: deliveries.id });
      if (updated.length !== 1) return "not_owned" as const;
      await tx
        .update(deliveryAttempts)
        .set({
          status: "failed",
          error: input.error.slice(0, 4_000),
          httpStatus: input.httpStatus ?? null,
          signatureVersion: input.signatureVersion ?? null,
          requestTimestamp: input.requestTimestamp ?? null,
          finishedAt: now,
        })
        .where(
          and(
            eq(deliveryAttempts.deliveryId, input.deliveryId),
            eq(deliveryAttempts.attemptNumber, input.attempt),
          ),
        );
      if (input.terminal === true) {
        await tx
          .update(subscriptions)
          .set({ active: false, updatedAt: now })
          .where(eq(subscriptions.id, delivery.subscriptionId));
      }
      return dead ? ("dead" as const) : ("failed" as const);
    });
  }

  async listForOwner(ownerAddress: string): Promise<{
    readonly activeRoutes: number;
    readonly deliveries: readonly StoredDeliveryListItem[];
  }> {
    const owner = ownerAddress.toLowerCase();
    const [rows, routes] = await Promise.all([
      this.db
        .select({
          id: deliveries.id,
          eventId: deliveries.eventId,
          eventType: canonicalEvents.type,
          owner: subscriptions.ownerAddress,
          destination: subscriptions.destination,
          kind: subscriptions.kind,
          status: deliveries.status,
          attemptCount: deliveries.attemptCount,
          maxAttempts: deliveries.maxAttempts,
          nextAttemptAt: deliveries.nextAttemptAt,
          deliveredAt: deliveries.deliveredAt,
          lastError: deliveries.lastError,
          createdAt: deliveries.createdAt,
        })
        .from(deliveries)
        .innerJoin(subscriptions, eq(subscriptions.id, deliveries.subscriptionId))
        .innerJoin(canonicalEvents, eq(canonicalEvents.id, deliveries.eventId))
        .where(eq(subscriptions.ownerAddress, owner))
        .orderBy(desc(deliveries.createdAt)),
      this.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.ownerAddress, owner),
            eq(subscriptions.active, true),
            isNotNull(subscriptions.verifiedAt),
          ),
        ),
    ]);
    const ids = rows.map(({ id }) => id);
    const attempts =
      ids.length === 0
        ? []
        : await this.db
            .select({
              deliveryId: deliveryAttempts.deliveryId,
              startedAt: deliveryAttempts.startedAt,
            })
            .from(deliveryAttempts)
            .where(inArray(deliveryAttempts.deliveryId, ids))
            .orderBy(desc(deliveryAttempts.startedAt));
    const lastAttempt = new Map<string, Date>();
    for (const attempt of attempts) {
      if (!lastAttempt.has(attempt.deliveryId))
        lastAttempt.set(attempt.deliveryId, attempt.startedAt);
    }
    return {
      activeRoutes: routes.length,
      deliveries: rows.map((row) => ({
        ...row,
        lastAttemptAt: lastAttempt.get(row.id) ?? null,
      })),
    };
  }

  async getForOwner(
    deliveryId: string,
    ownerAddress: string,
  ): Promise<StoredDeliveryDetail | null> {
    const rows = await this.db
      .select({
        id: deliveries.id,
        eventId: deliveries.eventId,
        eventType: canonicalEvents.type,
        owner: subscriptions.ownerAddress,
        destination: subscriptions.destination,
        kind: subscriptions.kind,
        status: deliveries.status,
        attemptCount: deliveries.attemptCount,
        maxAttempts: deliveries.maxAttempts,
        nextAttemptAt: deliveries.nextAttemptAt,
        deliveredAt: deliveries.deliveredAt,
        lastError: deliveries.lastError,
        createdAt: deliveries.createdAt,
        aggregateType: canonicalEvents.aggregateType,
        aggregateId: canonicalEvents.aggregateId,
        schemaVersion: canonicalEvents.schemaVersion,
        payload: canonicalEvents.payload,
        sourceTransactionHash: canonicalEvents.sourceTransactionHash,
        sourceLogIndex: canonicalEvents.sourceLogIndex,
        blockNumber: canonicalEvents.blockNumber,
        occurredAt: canonicalEvents.occurredAt,
      })
      .from(deliveries)
      .innerJoin(subscriptions, eq(subscriptions.id, deliveries.subscriptionId))
      .innerJoin(canonicalEvents, eq(canonicalEvents.id, deliveries.eventId))
      .where(
        and(
          eq(deliveries.id, deliveryId),
          eq(subscriptions.ownerAddress, ownerAddress.toLowerCase()),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    const attempts = await this.db
      .select({
        attempt: deliveryAttempts.attemptNumber,
        status: deliveryAttempts.status,
        httpStatus: deliveryAttempts.httpStatus,
        providerMessageId: deliveryAttempts.providerMessageId,
        error: deliveryAttempts.error,
        signatureVersion: deliveryAttempts.signatureVersion,
        requestTimestamp: deliveryAttempts.requestTimestamp,
        startedAt: deliveryAttempts.startedAt,
        finishedAt: deliveryAttempts.finishedAt,
      })
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.deliveryId, deliveryId))
      .orderBy(asc(deliveryAttempts.attemptNumber));
    const event = canonicalDeliveryEventSchema.parse({
      id: row.eventId,
      schemaVersion: row.schemaVersion,
      type: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      occurredAt: row.occurredAt.toISOString(),
      payload: row.payload,
      sourceTransactionHash: row.sourceTransactionHash,
      sourceLogIndex: row.sourceLogIndex,
      blockNumber: row.blockNumber?.toString() ?? null,
    });
    return {
      id: row.id,
      eventId: row.eventId,
      eventType: row.eventType,
      owner: row.owner,
      destination: row.destination,
      kind: row.kind,
      status: row.status,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      lastAttemptAt: attempts.at(-1)?.startedAt ?? null,
      nextAttemptAt: row.nextAttemptAt,
      deliveredAt: row.deliveredAt,
      lastError: row.lastError,
      createdAt: row.createdAt,
      event,
      attempts,
    };
  }

  async replayDead(input: {
    readonly deliveryId: string;
    readonly ownerAddress: string;
    readonly now?: Date;
    readonly additionalAttempts?: number;
  }): Promise<{ readonly nextAttemptAt: Date; readonly attemptsRemaining: number } | null> {
    const now = input.now ?? new Date();
    const additionalAttempts = input.additionalAttempts ?? 8;
    if (!Number.isSafeInteger(additionalAttempts) || additionalAttempts <= 0) {
      throw new RangeError("additionalAttempts must be a positive integer");
    }
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: deliveries.id,
          attemptCount: deliveries.attemptCount,
          maxAttempts: deliveries.maxAttempts,
        })
        .from(deliveries)
        .innerJoin(subscriptions, eq(subscriptions.id, deliveries.subscriptionId))
        .where(
          and(
            eq(deliveries.id, input.deliveryId),
            eq(deliveries.status, "dead"),
            eq(subscriptions.ownerAddress, input.ownerAddress.toLowerCase()),
          ),
        )
        .limit(1);
      const delivery = rows[0];
      if (delivery === undefined) return null;
      const maxAttempts =
        Math.max(delivery.maxAttempts, delivery.attemptCount) + additionalAttempts;
      const updated = await tx
        .update(deliveries)
        .set({
          status: "failed",
          maxAttempts,
          nextAttemptAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(and(eq(deliveries.id, input.deliveryId), eq(deliveries.status, "dead")))
        .returning({ id: deliveries.id });
      if (updated.length !== 1) return null;
      await tx.insert(auditRecords).values({
        idempotencyKey: `delivery-replay:${input.deliveryId}:${now.toISOString()}`,
        action: "delivery.replay_requested",
        actorType: "wallet",
        actorId: input.ownerAddress.toLowerCase(),
        subjectType: "delivery",
        subjectId: input.deliveryId,
        details: { additionalAttempts, previousAttemptCount: delivery.attemptCount },
        occurredAt: now,
      });
      return { nextAttemptAt: now, attemptsRemaining: maxAttempts - delivery.attemptCount };
    });
  }
}
