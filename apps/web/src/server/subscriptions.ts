import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  buildSubscriptionChallengeMessage,
  type SubscriptionChallengeResponse,
  type SubscriptionVerificationRequest,
  type SubscriptionVerificationResponse,
  type WebhookSubscriptionRequest,
} from "@claimrail/contracts";
import {
  createDatabase,
  encryptSecret,
  generateWebhookSecret,
  hashSecret,
  SubscriptionRepository,
} from "@claimrail/db";
import { SHANNON_DREAMDEX } from "@claimrail/dreamdex";
import { createPublicClient, getAddress, http, type Hex } from "viem";

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (value === undefined || value.trim() === "") {
    throw new Error("durable subscription storage is unavailable");
  }
  return value;
}

function encryptionKey(): string {
  const value = process.env.CLAIMRAIL_SECRET_ENCRYPTION_KEY;
  if (value === undefined || value.trim() === "") {
    throw new Error("subscription secret encryption is unavailable");
  }
  return value;
}

function messageHash(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function createWebhookSubscriptionChallenge(
  input: WebhookSubscriptionRequest,
): Promise<SubscriptionChallengeResponse> {
  const owner = getAddress(input.owner);
  const challengeId = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + CHALLENGE_TTL_MS);
  const message = buildSubscriptionChallengeMessage({
    challengeId,
    owner,
    chainId: SHANNON_DREAMDEX.chain.id,
    destination: input.destination,
    eventTypes: input.eventTypes,
    nonce: randomBytes(18).toString("base64url"),
    expiresAt,
  });
  const database = createDatabase(databaseUrl(), {
    maxConnections: 2,
    applicationName: "claimrail-web-subscription-challenge",
  });
  try {
    await new SubscriptionRepository(database.db).createWebhookChallenge({
      id: challengeId,
      ownerAddress: owner,
      destination: input.destination,
      eventTypes: input.eventTypes,
      challengeHash: messageHash(message),
      expiresAt,
      createdAt,
    });
  } finally {
    await database.close();
  }
  return {
    schemaVersion: "1",
    challengeId,
    owner,
    message,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function verifyWebhookSubscription(
  input: SubscriptionVerificationRequest,
): Promise<SubscriptionVerificationResponse> {
  const key = encryptionKey();
  const database = createDatabase(databaseUrl(), {
    maxConnections: 2,
    applicationName: "claimrail-web-subscription-verify",
  });
  try {
    const repository = new SubscriptionRepository(database.db);
    const challenge = await repository.getPendingChallenge(input.challengeId);
    if (challenge === null) throw new Error("notification challenge was not found or already used");
    const providedHash = messageHash(input.message);
    if (!hashesMatch(providedHash, challenge.challengeHash)) {
      throw new Error("signed message does not match the stored notification challenge");
    }
    const verifiedAt = new Date();
    if (challenge.expiresAt.getTime() <= verifiedAt.getTime()) {
      throw new Error("notification challenge has expired");
    }
    const publicClient = createPublicClient({
      chain: SHANNON_DREAMDEX.chain,
      transport: http(SHANNON_DREAMDEX.rpcHttpUrl),
    });
    const valid = await publicClient.verifyMessage({
      address: getAddress(challenge.ownerAddress),
      message: input.message,
      signature: input.signature as Hex,
    });
    if (!valid) throw new Error("wallet signature does not match the subscription owner");
    const webhookSecret = generateWebhookSecret();
    const activated = await repository.activateWebhook({
      challengeId: input.challengeId,
      expectedChallengeHash: challenge.challengeHash,
      secretHash: hashSecret(webhookSecret),
      secretCiphertext: encryptSecret(webhookSecret, key),
      verifiedAt,
    });
    return {
      schemaVersion: "1",
      subscription: {
        id: activated.id,
        owner: getAddress(activated.ownerAddress),
        kind: "webhook",
        destination: activated.destination,
        eventTypes:
          activated.eventTypes as SubscriptionVerificationResponse["subscription"]["eventTypes"],
        active: true,
        verifiedAt: activated.verifiedAt.toISOString(),
      },
      webhookSecret,
      secretNotice: "Store this secret now. ClaimRail will not display it again.",
    };
  } finally {
    await database.close();
  }
}
