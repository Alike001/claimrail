import { and, eq, gt, ne } from "drizzle-orm";
import type { ClaimRailDatabase } from "../client.js";
import { toJsonObject } from "../json.js";
import { auditRecords, notificationBindings, subscriptions } from "../schema/index.js";

export interface StoredNotificationChallenge {
  readonly id: string;
  readonly ownerAddress: string;
  readonly destination: string;
  readonly eventTypes: readonly string[];
  readonly challengeHash: string;
  readonly expiresAt: Date;
}

export interface ActivatedWebhookSubscription {
  readonly id: string;
  readonly ownerAddress: string;
  readonly destination: string;
  readonly eventTypes: readonly string[];
  readonly verifiedAt: Date;
}

export class SubscriptionRepository {
  constructor(private readonly db: ClaimRailDatabase) {}

  async createWebhookChallenge(input: {
    readonly id: string;
    readonly ownerAddress: string;
    readonly destination: string;
    readonly eventTypes: readonly string[];
    readonly challengeHash: string;
    readonly expiresAt: Date;
    readonly createdAt: Date;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ status: notificationBindings.status })
        .from(notificationBindings)
        .where(
          and(
            eq(notificationBindings.ownerAddress, input.ownerAddress.toLowerCase()),
            eq(notificationBindings.channel, "webhook"),
            ne(notificationBindings.status, "revoked"),
          ),
        )
        .limit(1);
      if (existing[0]?.status === "verified") {
        throw new Error("a verified webhook binding already exists for this wallet");
      }
      await tx
        .update(notificationBindings)
        .set({ status: "revoked", updatedAt: input.createdAt })
        .where(
          and(
            eq(notificationBindings.ownerAddress, input.ownerAddress.toLowerCase()),
            eq(notificationBindings.channel, "webhook"),
            ne(notificationBindings.status, "revoked"),
          ),
        );
      await tx.insert(notificationBindings).values({
        id: input.id,
        ownerAddress: input.ownerAddress.toLowerCase(),
        channel: "webhook",
        externalId: input.destination,
        configuration: toJsonObject({ eventTypes: input.eventTypes }),
        status: "pending",
        challengeHash: input.challengeHash,
        challengeExpiresAt: input.expiresAt,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });
    });
  }

  async getPendingChallenge(id: string): Promise<StoredNotificationChallenge | null> {
    const rows = await this.db
      .select({
        id: notificationBindings.id,
        ownerAddress: notificationBindings.ownerAddress,
        destination: notificationBindings.externalId,
        configuration: notificationBindings.configuration,
        challengeHash: notificationBindings.challengeHash,
        expiresAt: notificationBindings.challengeExpiresAt,
      })
      .from(notificationBindings)
      .where(and(eq(notificationBindings.id, id), eq(notificationBindings.status, "pending")))
      .limit(1);
    const row = rows[0];
    if (row === undefined || row.challengeHash === null || row.expiresAt === null) return null;
    const eventTypes = row.configuration.eventTypes;
    if (!Array.isArray(eventTypes) || !eventTypes.every((value) => typeof value === "string")) {
      throw new Error("stored notification challenge is invalid");
    }
    return { ...row, challengeHash: row.challengeHash, expiresAt: row.expiresAt, eventTypes };
  }

  async activateWebhook(input: {
    readonly challengeId: string;
    readonly expectedChallengeHash: string;
    readonly secretHash: string;
    readonly secretCiphertext: string;
    readonly verifiedAt: Date;
  }): Promise<ActivatedWebhookSubscription> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(notificationBindings)
        .set({
          status: "verified",
          challengeHash: null,
          challengeExpiresAt: null,
          verifiedAt: input.verifiedAt,
          updatedAt: input.verifiedAt,
        })
        .where(
          and(
            eq(notificationBindings.id, input.challengeId),
            eq(notificationBindings.status, "pending"),
            eq(notificationBindings.challengeHash, input.expectedChallengeHash),
            gt(notificationBindings.challengeExpiresAt, input.verifiedAt),
          ),
        )
        .returning({
          id: notificationBindings.id,
          ownerAddress: notificationBindings.ownerAddress,
          destination: notificationBindings.externalId,
          configuration: notificationBindings.configuration,
        });
      const binding = updated[0];
      if (binding === undefined) throw new Error("notification challenge was already used");
      const eventTypes = binding.configuration.eventTypes;
      if (!Array.isArray(eventTypes) || !eventTypes.every((value) => typeof value === "string")) {
        throw new Error("stored notification challenge is invalid");
      }
      const inserted = await tx
        .insert(subscriptions)
        .values({
          ownerAddress: binding.ownerAddress,
          kind: "webhook",
          destination: binding.destination,
          eventTypes,
          secretHash: input.secretHash,
          secretCiphertext: input.secretCiphertext,
          active: true,
          verifiedAt: input.verifiedAt,
          createdAt: input.verifiedAt,
          updatedAt: input.verifiedAt,
        })
        .onConflictDoUpdate({
          target: [subscriptions.ownerAddress, subscriptions.kind, subscriptions.destination],
          set: {
            eventTypes,
            secretHash: input.secretHash,
            secretCiphertext: input.secretCiphertext,
            active: true,
            verifiedAt: input.verifiedAt,
            updatedAt: input.verifiedAt,
          },
        })
        .returning({ id: subscriptions.id });
      const subscription = inserted[0];
      if (subscription === undefined) throw new Error("webhook subscription was not stored");
      await tx.insert(auditRecords).values({
        idempotencyKey: `subscription:${subscription.id}:verified:${input.challengeId}`,
        action: "subscription.webhook_verified",
        actorType: "wallet",
        actorId: binding.ownerAddress,
        subjectType: "subscription",
        subjectId: subscription.id,
        details: toJsonObject({ challengeId: input.challengeId, eventTypes }),
        occurredAt: input.verifiedAt,
      });
      return {
        id: subscription.id,
        ownerAddress: binding.ownerAddress,
        destination: binding.destination,
        eventTypes,
        verifiedAt: input.verifiedAt,
      };
    });
  }
}
