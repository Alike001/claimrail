import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  browserConfigurationResponseSchema,
  browserSubscriptionChallengeResponseSchema,
  browserSubscriptionVerificationResponseSchema,
  buildBrowserSubscriptionChallengeMessage,
  buildSubscriptionChallengeMessage,
  type BrowserConfigurationResponse,
  type BrowserSubscriptionChallengeResponse,
  type BrowserSubscriptionRequest,
  type BrowserSubscriptionVerificationResponse,
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

function vapidPublicKey(): string | null {
  const value = process.env.CLAIMRAIL_VAPID_PUBLIC_KEY?.trim();
  return value && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

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

export function browserNotificationConfiguration(): BrowserConfigurationResponse {
  const publicKey = vapidPublicKey();
  return browserConfigurationResponseSchema.parse({
    schemaVersion: "1",
    available: publicKey !== null,
    publicKey,
  });
}

export async function createBrowserSubscriptionChallenge(
  input: BrowserSubscriptionRequest,
): Promise<BrowserSubscriptionChallengeResponse> {
  if (vapidPublicKey() === null) throw new Error("browser notification delivery is unavailable");
  const owner = getAddress(input.owner);
  const challengeId = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + CHALLENGE_TTL_MS);
  const endpointFingerprint = messageHash(input.subscription.endpoint);
  const message = buildBrowserSubscriptionChallengeMessage({
    challengeId,
    owner,
    chainId: SHANNON_DREAMDEX.chain.id,
    endpointFingerprint,
    eventTypes: input.eventTypes,
    nonce: randomBytes(18).toString("base64url"),
    expiresAt,
  });
  const database = createDatabase(databaseUrl(), {
    maxConnections: 2,
    applicationName: "claimrail-web-browser-challenge",
  });
  try {
    await new SubscriptionRepository(database.db).createBrowserChallenge({
      id: challengeId,
      ownerAddress: owner,
      endpointFingerprint,
      eventTypes: input.eventTypes,
      subscriptionCiphertext: encryptSecret(JSON.stringify(input.subscription), encryptionKey()),
      challengeHash: messageHash(message),
      expiresAt,
      createdAt,
    });
  } finally {
    await database.close();
  }
  return browserSubscriptionChallengeResponseSchema.parse({
    schemaVersion: "1",
    challengeId,
    owner,
    message,
    expiresAt: expiresAt.toISOString(),
    endpointFingerprint,
  });
}

export async function verifyBrowserSubscription(
  input: SubscriptionVerificationRequest,
): Promise<BrowserSubscriptionVerificationResponse> {
  const database = createDatabase(databaseUrl(), {
    maxConnections: 2,
    applicationName: "claimrail-web-browser-verify",
  });
  try {
    const repository = new SubscriptionRepository(database.db);
    const challenge = await repository.getPendingBrowserChallenge(input.challengeId);
    if (challenge === null) throw new Error("browser challenge was not found or already used");
    const providedHash = messageHash(input.message);
    if (!hashesMatch(providedHash, challenge.challengeHash)) {
      throw new Error("signed message does not match the stored browser challenge");
    }
    const verifiedAt = new Date();
    if (challenge.expiresAt.getTime() <= verifiedAt.getTime()) {
      throw new Error("browser notification challenge has expired");
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
    if (!valid) throw new Error("wallet signature does not match the browser subscription owner");
    const activated = await repository.activateBrowser({
      challengeId: input.challengeId,
      expectedChallengeHash: challenge.challengeHash,
      verifiedAt,
    });
    return browserSubscriptionVerificationResponseSchema.parse({
      schemaVersion: "1",
      subscription: {
        id: activated.id,
        owner: getAddress(activated.ownerAddress),
        kind: "browser",
        endpointFingerprint: activated.endpointFingerprint,
        eventTypes: activated.eventTypes,
        active: true,
        verifiedAt: activated.verifiedAt.toISOString(),
      },
    });
  } finally {
    await database.close();
  }
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
