import { and, eq, isNotNull, sql } from "drizzle-orm";
import { canonicalDeliveryEventSchema, type CanonicalDeliveryEvent } from "@claimrail/contracts";
import type { ClaimRailDatabase } from "../client.js";
import {
  canonicalEvents,
  claims,
  deliveries,
  positions,
  subscriptions,
  watchedWallets,
} from "../schema/index.js";

export interface LeasedWebhookDelivery {
  readonly id: string;
  readonly subscriptionId: string;
  readonly destination: string;
  readonly secretCiphertext: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly leaseOwner: string;
  readonly event: CanonicalDeliveryEvent;
}

interface DeliveryLeaseRow extends Record<string, unknown> {
  readonly id: string;
  readonly subscriptionId: string;
  readonly destination: string;
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
            eq(subscriptions.kind, "webhook"),
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
    readonly now?: Date;
  }): Promise<LeasedWebhookDelivery | null> {
    if (input.workerId.trim() === "") throw new Error("workerId is required");
    const leaseMs = positiveMilliseconds(input.leaseMs, "leaseMs");
    const now = input.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const result = await this.db.execute<DeliveryLeaseRow>(sql`
      with candidate as (
        select delivery.id
        from deliveries as delivery
        join subscriptions as subscription on subscription.id = delivery.subscription_id
        where subscription.active = true
          and subscription.verified_at is not null
          and subscription.secret_ciphertext is not null
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
    return { ...row, event: canonicalDeliveryEventSchema.parse(row.event) };
  }

  async complete(input: {
    readonly deliveryId: string;
    readonly workerId: string;
    readonly providerMessageId?: string;
    readonly now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const rows = await this.db
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
        ),
      )
      .returning({ id: deliveries.id });
    return rows.length === 1;
  }

  async fail(input: {
    readonly deliveryId: string;
    readonly workerId: string;
    readonly error: string;
    readonly now?: Date;
    readonly baseBackoffMs?: number;
    readonly maxBackoffMs?: number;
  }): Promise<"failed" | "dead" | "not_owned"> {
    const now = input.now ?? new Date();
    const rows = await this.db
      .select({ attemptCount: deliveries.attemptCount, maxAttempts: deliveries.maxAttempts })
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
    const dead = delivery.attemptCount >= delivery.maxAttempts;
    const base = positiveMilliseconds(input.baseBackoffMs ?? 1_000, "baseBackoffMs");
    const cap = positiveMilliseconds(input.maxBackoffMs ?? 300_000, "maxBackoffMs");
    const exponent = Math.min(Math.max(delivery.attemptCount - 1, 0), 20);
    const delay = Math.min(base * 2 ** exponent, cap);
    const updated = await this.db
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
        ),
      )
      .returning({ id: deliveries.id });
    return updated.length === 1 ? (dead ? "dead" : "failed") : "not_owned";
  }
}
