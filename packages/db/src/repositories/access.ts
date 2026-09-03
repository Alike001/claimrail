import { and, eq, gt, isNull } from "drizzle-orm";
import type { ClaimRailDatabase } from "../client.js";
import { accessChallenges, accessTokens, auditRecords } from "../schema/index.js";
import { toJsonObject } from "../json.js";

export interface StoredAccessChallenge {
  readonly id: string;
  readonly ownerAddress: string;
  readonly purpose: string;
  readonly messageHash: string;
  readonly expiresAt: Date;
}

export class AccessRepository {
  constructor(private readonly db: ClaimRailDatabase) {}

  async createChallenge(input: {
    readonly id: string;
    readonly ownerAddress: string;
    readonly purpose: string;
    readonly messageHash: string;
    readonly expiresAt: Date;
    readonly createdAt: Date;
  }): Promise<void> {
    await this.db.insert(accessChallenges).values({
      ...input,
      ownerAddress: input.ownerAddress.toLowerCase(),
    });
  }

  async getPendingChallenge(id: string): Promise<StoredAccessChallenge | null> {
    const rows = await this.db
      .select({
        id: accessChallenges.id,
        ownerAddress: accessChallenges.ownerAddress,
        purpose: accessChallenges.purpose,
        messageHash: accessChallenges.messageHash,
        expiresAt: accessChallenges.expiresAt,
      })
      .from(accessChallenges)
      .where(and(eq(accessChallenges.id, id), isNull(accessChallenges.usedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async consumeAndCreateToken(input: {
    readonly challengeId: string;
    readonly expectedMessageHash: string;
    readonly tokenHash: string;
    readonly scopes: readonly string[];
    readonly expiresAt: Date;
    readonly now: Date;
  }): Promise<{ readonly ownerAddress: string; readonly expiresAt: Date }> {
    return this.db.transaction(async (tx) => {
      const consumed = await tx
        .update(accessChallenges)
        .set({ usedAt: input.now })
        .where(
          and(
            eq(accessChallenges.id, input.challengeId),
            isNull(accessChallenges.usedAt),
            eq(accessChallenges.messageHash, input.expectedMessageHash),
            gt(accessChallenges.expiresAt, input.now),
          ),
        )
        .returning({
          ownerAddress: accessChallenges.ownerAddress,
          purpose: accessChallenges.purpose,
        });
      const challenge = consumed[0];
      if (challenge === undefined) throw new Error("access challenge was already used or expired");
      if (challenge.purpose !== "delivery_console")
        throw new Error("access challenge purpose mismatch");
      const tokens = await tx
        .insert(accessTokens)
        .values({
          ownerAddress: challenge.ownerAddress,
          tokenHash: input.tokenHash,
          scopes: input.scopes,
          expiresAt: input.expiresAt,
          createdAt: input.now,
        })
        .returning({ id: accessTokens.id });
      const token = tokens[0];
      if (token === undefined) throw new Error("access token was not stored");
      await tx.insert(auditRecords).values({
        idempotencyKey: `access-token:${token.id}`,
        action: "delivery_console.access_granted",
        actorType: "wallet",
        actorId: challenge.ownerAddress,
        subjectType: "access_token",
        subjectId: token.id,
        details: toJsonObject({ scopes: input.scopes, challengeId: input.challengeId }),
        occurredAt: input.now,
      });
      return { ownerAddress: challenge.ownerAddress, expiresAt: input.expiresAt };
    });
  }

  async authenticate(input: {
    readonly tokenHash: string;
    readonly scope: string;
    readonly now?: Date;
  }): Promise<{ readonly ownerAddress: string } | null> {
    const now = input.now ?? new Date();
    const rows = await this.db
      .select({ ownerAddress: accessTokens.ownerAddress, scopes: accessTokens.scopes })
      .from(accessTokens)
      .where(
        and(
          eq(accessTokens.tokenHash, input.tokenHash),
          isNull(accessTokens.revokedAt),
          gt(accessTokens.expiresAt, now),
        ),
      )
      .limit(1);
    const token = rows[0];
    if (token === undefined || !token.scopes.includes(input.scope)) return null;
    return { ownerAddress: token.ownerAddress };
  }
}
