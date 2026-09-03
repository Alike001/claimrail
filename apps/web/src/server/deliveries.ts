import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  accessVerificationResponseSchema,
  buildDeliveryConsoleChallengeMessage,
  deliveryConsoleChallengeResponseSchema,
  deliveryDetailResponseSchema,
  deliveryListResponseSchema,
  deliveryReplayResponseSchema,
  type AccessVerificationResponse,
  type DeliveryConsoleChallengeResponse,
  type DeliveryDetailResponse,
  type DeliveryListResponse,
  type DeliveryReplayResponse,
} from "@claimrail/contracts";
import {
  AccessRepository,
  createDatabase,
  DeliveryRepository,
  hashSecret,
  type StoredDeliveryListItem,
} from "@claimrail/db";
import { SHANNON_DREAMDEX } from "@claimrail/dreamdex";
import { createPublicClient, getAddress, http, type Hex } from "viem";

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const ACCESS_TTL_MS = 15 * 60 * 1_000;
const ACCESS_SCOPES = ["deliveries:read", "deliveries:replay"] as const;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (value === undefined || value.trim() === "") {
    throw new Error("durable delivery storage is unavailable");
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

function serializeListItem(item: StoredDeliveryListItem) {
  return {
    ...item,
    owner: getAddress(item.owner),
    lastAttemptAt: item.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: item.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: item.deliveredAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  };
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (match?.[1] === undefined) throw new Error("valid delivery-console bearer token is required");
  return match[1];
}

export async function createDeliveryConsoleChallenge(
  ownerInput: string,
): Promise<DeliveryConsoleChallengeResponse> {
  const owner = getAddress(ownerInput);
  const challengeId = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + CHALLENGE_TTL_MS);
  const message = buildDeliveryConsoleChallengeMessage({
    challengeId,
    owner,
    chainId: SHANNON_DREAMDEX.chain.id,
    nonce: randomBytes(18).toString("base64url"),
    expiresAt,
  });
  const database = createDatabase(databaseUrl(), {
    maxConnections: 2,
    applicationName: "claimrail-web-console-challenge",
  });
  try {
    await new AccessRepository(database.db).createChallenge({
      id: challengeId,
      ownerAddress: owner,
      purpose: "delivery_console",
      messageHash: messageHash(message),
      expiresAt,
      createdAt,
    });
  } finally {
    await database.close();
  }
  return deliveryConsoleChallengeResponseSchema.parse({
    schemaVersion: "1",
    challengeId,
    owner,
    purpose: "delivery_console",
    message,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function verifyDeliveryConsoleAccess(input: {
  readonly challengeId: string;
  readonly message: string;
  readonly signature: string;
}): Promise<AccessVerificationResponse> {
  const database = createDatabase(databaseUrl(), {
    maxConnections: 2,
    applicationName: "claimrail-web-console-verify",
  });
  try {
    const repository = new AccessRepository(database.db);
    const challenge = await repository.getPendingChallenge(input.challengeId);
    if (challenge === null) throw new Error("access challenge was not found or already used");
    const providedHash = messageHash(input.message);
    if (!hashesMatch(providedHash, challenge.messageHash)) {
      throw new Error("signed message does not match the stored access challenge");
    }
    const now = new Date();
    if (challenge.expiresAt.getTime() <= now.getTime())
      throw new Error("access challenge has expired");
    const client = createPublicClient({
      chain: SHANNON_DREAMDEX.chain,
      transport: http(SHANNON_DREAMDEX.rpcHttpUrl),
    });
    const valid = await client.verifyMessage({
      address: getAddress(challenge.ownerAddress),
      message: input.message,
      signature: input.signature as Hex,
    });
    if (!valid) throw new Error("wallet signature does not match the access owner");
    const accessToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + ACCESS_TTL_MS);
    const created = await repository.consumeAndCreateToken({
      challengeId: input.challengeId,
      expectedMessageHash: challenge.messageHash,
      tokenHash: hashSecret(accessToken),
      scopes: ACCESS_SCOPES,
      expiresAt,
      now,
    });
    return accessVerificationResponseSchema.parse({
      schemaVersion: "1",
      owner: getAddress(created.ownerAddress),
      accessToken,
      scopes: ACCESS_SCOPES,
      expiresAt: created.expiresAt.toISOString(),
    });
  } finally {
    await database.close();
  }
}

async function authorizedDatabase(request: Request, scope: (typeof ACCESS_SCOPES)[number]) {
  const token = bearerToken(request);
  const database = createDatabase(databaseUrl(), {
    maxConnections: 2,
    applicationName: "claimrail-web-delivery-console",
  });
  let access: { readonly ownerAddress: string } | null;
  try {
    access = await new AccessRepository(database.db).authenticate({
      tokenHash: hashSecret(token),
      scope,
    });
  } catch (error) {
    await database.close();
    throw error;
  }
  if (access === null) {
    await database.close();
    throw new Error("delivery-console access is invalid or expired");
  }
  return { database, ownerAddress: access.ownerAddress };
}

export async function listAuthorizedDeliveries(request: Request): Promise<DeliveryListResponse> {
  const { database, ownerAddress } = await authorizedDatabase(request, "deliveries:read");
  try {
    const result = await new DeliveryRepository(database.db).listForOwner(ownerAddress);
    const items = result.deliveries.map(serializeListItem);
    return deliveryListResponseSchema.parse({
      schemaVersion: "1",
      owner: getAddress(ownerAddress),
      summary: {
        total: items.length,
        activeRoutes: result.activeRoutes,
        pending: items.filter(({ status }) => status === "pending" || status === "delivering")
          .length,
        retrying: items.filter(({ status }) => status === "failed").length,
        delivered: items.filter(({ status }) => status === "delivered").length,
        dead: items.filter(({ status }) => status === "dead").length,
      },
      deliveries: items,
    });
  } finally {
    await database.close();
  }
}

export async function readAuthorizedDelivery(
  request: Request,
  deliveryId: string,
): Promise<DeliveryDetailResponse | null> {
  const { database, ownerAddress } = await authorizedDatabase(request, "deliveries:read");
  try {
    const detail = await new DeliveryRepository(database.db).getForOwner(deliveryId, ownerAddress);
    if (detail === null) return null;
    return deliveryDetailResponseSchema.parse({
      ...serializeListItem(detail),
      schemaVersion: "1",
      event: detail.event,
      attempts: detail.attempts.map((attempt) => ({
        ...attempt,
        startedAt: attempt.startedAt.toISOString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
      })),
    });
  } finally {
    await database.close();
  }
}

export async function replayAuthorizedDelivery(
  request: Request,
  deliveryId: string,
): Promise<DeliveryReplayResponse | null> {
  const { database, ownerAddress } = await authorizedDatabase(request, "deliveries:replay");
  try {
    const replay = await new DeliveryRepository(database.db).replayDead({
      deliveryId,
      ownerAddress,
    });
    if (replay === null) return null;
    return deliveryReplayResponseSchema.parse({
      schemaVersion: "1",
      deliveryId,
      status: "failed",
      nextAttemptAt: replay.nextAttemptAt.toISOString(),
      attemptsRemaining: replay.attemptsRemaining,
    });
  } finally {
    await database.close();
  }
}
