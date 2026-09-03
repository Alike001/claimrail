import { and, eq, gt, ne, sql } from "drizzle-orm";
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

export interface StoredBrowserChallenge {
  readonly id: string;
  readonly ownerAddress: string;
  readonly endpointFingerprint: string;
  readonly eventTypes: readonly string[];
  readonly subscriptionCiphertext: string;
  readonly challengeHash: string;
  readonly expiresAt: Date;
}

export interface ActivatedBrowserSubscription {
  readonly id: string;
  readonly ownerAddress: string;
  readonly endpointFingerprint: string;
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

  async createBrowserChallenge(input: {
    readonly id: string;
    readonly ownerAddress: string;
    readonly endpointFingerprint: string;
    readonly eventTypes: readonly string[];
    readonly subscriptionCiphertext: string;
    readonly challengeHash: string;
    readonly expiresAt: Date;
    readonly createdAt: Date;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(notificationBindings)
        .set({ status: "revoked", updatedAt: input.createdAt })
        .where(
          and(
            eq(notificationBindings.ownerAddress, input.ownerAddress.toLowerCase()),
            eq(notificationBindings.channel, "browser"),
            ne(notificationBindings.status, "revoked"),
          ),
        );
      await tx.insert(notificationBindings).values({
        id: input.id,
        ownerAddress: input.ownerAddress.toLowerCase(),
        channel: "browser",
        externalId: input.endpointFingerprint,
        configuration: toJsonObject({
          eventTypes: input.eventTypes,
          subscriptionCiphertext: input.subscriptionCiphertext,
        }),
        status: "pending",
        challengeHash: input.challengeHash,
        challengeExpiresAt: input.expiresAt,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });
    });
  }

  async createTelegramChallenge(input: {
    readonly id: string;
    readonly ownerAddress: string;
    readonly eventTypes: readonly string[];
    readonly challengeHash: string;
    readonly expiresAt: Date;
    readonly createdAt: Date;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(notificationBindings)
        .set({ status: "revoked", updatedAt: input.createdAt })
        .where(
          and(
            eq(notificationBindings.ownerAddress, input.ownerAddress.toLowerCase()),
            eq(notificationBindings.channel, "telegram"),
            ne(notificationBindings.status, "revoked"),
          ),
        );
      await tx.insert(notificationBindings).values({
        id: input.id,
        ownerAddress: input.ownerAddress.toLowerCase(),
        channel: "telegram",
        externalId: `pending:${input.id}`,
        configuration: toJsonObject({ eventTypes: input.eventTypes }),
        status: "pending",
        challengeHash: input.challengeHash,
        challengeExpiresAt: input.expiresAt,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });
    });
  }

  async markTelegramProofVerified(input: {
    readonly challengeId: string;
    readonly expectedChallengeHash: string;
    readonly linkTokenHash: string;
    readonly linkExpiresAt: Date;
    readonly verifiedAt: Date;
  }): Promise<{ readonly ownerAddress: string; readonly eventTypes: readonly string[] }> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          ownerAddress: notificationBindings.ownerAddress,
          configuration: notificationBindings.configuration,
        })
        .from(notificationBindings)
        .where(
          and(
            eq(notificationBindings.id, input.challengeId),
            eq(notificationBindings.channel, "telegram"),
            eq(notificationBindings.status, "pending"),
            eq(notificationBindings.challengeHash, input.expectedChallengeHash),
            gt(notificationBindings.challengeExpiresAt, input.verifiedAt),
          ),
        )
        .limit(1);
      const binding = rows[0];
      if (binding === undefined) throw new Error("Telegram challenge was already used or expired");
      const eventTypes = binding.configuration.eventTypes;
      if (!Array.isArray(eventTypes) || !eventTypes.every((value) => typeof value === "string")) {
        throw new Error("stored Telegram challenge is invalid");
      }
      const updated = await tx
        .update(notificationBindings)
        .set({
          challengeHash: null,
          challengeExpiresAt: null,
          configuration: toJsonObject({
            eventTypes,
            linkTokenHash: input.linkTokenHash,
            linkExpiresAt: input.linkExpiresAt.toISOString(),
          }),
          updatedAt: input.verifiedAt,
        })
        .where(
          and(
            eq(notificationBindings.id, input.challengeId),
            eq(notificationBindings.challengeHash, input.expectedChallengeHash),
          ),
        )
        .returning({ id: notificationBindings.id });
      if (updated.length !== 1) throw new Error("Telegram challenge was already used or expired");
      return { ownerAddress: binding.ownerAddress, eventTypes };
    });
  }

  async activateTelegramLink(input: {
    readonly linkTokenHash: string;
    readonly chatFingerprint: string;
    readonly chatCiphertext: string;
    readonly now: Date;
  }): Promise<{ readonly ownerAddress: string } | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: notificationBindings.id,
          ownerAddress: notificationBindings.ownerAddress,
          configuration: notificationBindings.configuration,
        })
        .from(notificationBindings)
        .where(
          and(
            eq(notificationBindings.channel, "telegram"),
            eq(notificationBindings.status, "pending"),
            sql`${notificationBindings.configuration}->>'linkTokenHash' = ${input.linkTokenHash}`,
          ),
        )
        .limit(1);
      const binding = rows[0];
      if (binding === undefined) return null;
      const eventTypes = binding.configuration.eventTypes;
      const expiry = binding.configuration.linkExpiresAt;
      if (
        !Array.isArray(eventTypes) ||
        !eventTypes.every((value) => typeof value === "string") ||
        typeof expiry !== "string" ||
        new Date(expiry).getTime() <= input.now.getTime()
      ) {
        return null;
      }
      const updated = await tx
        .update(notificationBindings)
        .set({
          status: "verified",
          externalId: input.chatFingerprint,
          configuration: toJsonObject({ eventTypes }),
          verifiedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(eq(notificationBindings.id, binding.id), eq(notificationBindings.status, "pending")),
        )
        .returning({ id: notificationBindings.id });
      if (updated.length !== 1) return null;
      await tx
        .update(subscriptions)
        .set({ active: false, updatedAt: input.now })
        .where(
          and(
            eq(subscriptions.ownerAddress, binding.ownerAddress),
            eq(subscriptions.kind, "telegram"),
            eq(subscriptions.active, true),
          ),
        );
      const subscriptionsRows = await tx
        .insert(subscriptions)
        .values({
          ownerAddress: binding.ownerAddress,
          kind: "telegram",
          destination: input.chatFingerprint,
          eventTypes,
          secretHash: input.chatFingerprint,
          secretCiphertext: input.chatCiphertext,
          active: true,
          verifiedAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [subscriptions.ownerAddress, subscriptions.kind, subscriptions.destination],
          set: {
            eventTypes,
            secretCiphertext: input.chatCiphertext,
            active: true,
            verifiedAt: input.now,
            updatedAt: input.now,
          },
        })
        .returning({ id: subscriptions.id });
      const subscription = subscriptionsRows[0];
      if (subscription === undefined) throw new Error("Telegram subscription was not stored");
      await tx.insert(auditRecords).values({
        idempotencyKey: `subscription:${subscription.id}:telegram-linked:${binding.id}`,
        action: "subscription.telegram_verified",
        actorType: "wallet",
        actorId: binding.ownerAddress,
        subjectType: "subscription",
        subjectId: subscription.id,
        details: toJsonObject({ bindingId: binding.id, eventTypes }),
        occurredAt: input.now,
      });
      return { ownerAddress: binding.ownerAddress };
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

  async getPendingTelegramChallenge(id: string): Promise<StoredNotificationChallenge | null> {
    const challenge = await this.getPendingChallenge(id);
    if (challenge === null) return null;
    const rows = await this.db
      .select({ channel: notificationBindings.channel })
      .from(notificationBindings)
      .where(eq(notificationBindings.id, id))
      .limit(1);
    return rows[0]?.channel === "telegram" ? challenge : null;
  }

  async getPendingBrowserChallenge(id: string): Promise<StoredBrowserChallenge | null> {
    const rows = await this.db
      .select({
        id: notificationBindings.id,
        ownerAddress: notificationBindings.ownerAddress,
        endpointFingerprint: notificationBindings.externalId,
        configuration: notificationBindings.configuration,
        challengeHash: notificationBindings.challengeHash,
        expiresAt: notificationBindings.challengeExpiresAt,
      })
      .from(notificationBindings)
      .where(
        and(
          eq(notificationBindings.id, id),
          eq(notificationBindings.channel, "browser"),
          eq(notificationBindings.status, "pending"),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (row === undefined || row.challengeHash === null || row.expiresAt === null) return null;
    const eventTypes = row.configuration.eventTypes;
    const subscriptionCiphertext = row.configuration.subscriptionCiphertext;
    if (
      !Array.isArray(eventTypes) ||
      !eventTypes.every((value) => typeof value === "string") ||
      typeof subscriptionCiphertext !== "string"
    ) {
      throw new Error("stored browser challenge is invalid");
    }
    return {
      ...row,
      challengeHash: row.challengeHash,
      expiresAt: row.expiresAt,
      eventTypes,
      subscriptionCiphertext,
    };
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

  async activateBrowser(input: {
    readonly challengeId: string;
    readonly expectedChallengeHash: string;
    readonly verifiedAt: Date;
  }): Promise<ActivatedBrowserSubscription> {
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
            eq(notificationBindings.channel, "browser"),
            eq(notificationBindings.status, "pending"),
            eq(notificationBindings.challengeHash, input.expectedChallengeHash),
            gt(notificationBindings.challengeExpiresAt, input.verifiedAt),
          ),
        )
        .returning({
          id: notificationBindings.id,
          ownerAddress: notificationBindings.ownerAddress,
          endpointFingerprint: notificationBindings.externalId,
          configuration: notificationBindings.configuration,
        });
      const binding = updated[0];
      if (binding === undefined) throw new Error("browser notification challenge was already used");
      const eventTypes = binding.configuration.eventTypes;
      const subscriptionCiphertext = binding.configuration.subscriptionCiphertext;
      if (
        !Array.isArray(eventTypes) ||
        !eventTypes.every((value) => typeof value === "string") ||
        typeof subscriptionCiphertext !== "string"
      ) {
        throw new Error("stored browser challenge is invalid");
      }
      const inserted = await tx
        .insert(subscriptions)
        .values({
          ownerAddress: binding.ownerAddress,
          kind: "browser",
          destination: binding.endpointFingerprint,
          eventTypes,
          secretHash: binding.endpointFingerprint,
          secretCiphertext: subscriptionCiphertext,
          active: true,
          verifiedAt: input.verifiedAt,
          createdAt: input.verifiedAt,
          updatedAt: input.verifiedAt,
        })
        .onConflictDoUpdate({
          target: [subscriptions.ownerAddress, subscriptions.kind, subscriptions.destination],
          set: {
            eventTypes,
            secretCiphertext: subscriptionCiphertext,
            active: true,
            verifiedAt: input.verifiedAt,
            updatedAt: input.verifiedAt,
          },
        })
        .returning({ id: subscriptions.id });
      const subscription = inserted[0];
      if (subscription === undefined) throw new Error("browser subscription was not stored");
      await tx.insert(auditRecords).values({
        idempotencyKey: `subscription:${subscription.id}:verified:${input.challengeId}`,
        action: "subscription.browser_verified",
        actorType: "wallet",
        actorId: binding.ownerAddress,
        subjectType: "subscription",
        subjectId: subscription.id,
        details: toJsonObject({
          challengeId: input.challengeId,
          endpointFingerprint: binding.endpointFingerprint,
          eventTypes,
        }),
        occurredAt: input.verifiedAt,
      });
      return {
        id: subscription.id,
        ownerAddress: binding.ownerAddress,
        endpointFingerprint: binding.endpointFingerprint,
        eventTypes,
        verifiedAt: input.verifiedAt,
      };
    });
  }
}
