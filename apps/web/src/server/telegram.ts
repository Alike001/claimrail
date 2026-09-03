import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  buildTelegramChallengeMessage,
  telegramLinkResponseSchema,
  telegramSubscriptionChallengeResponseSchema,
  type SubscriptionVerificationRequest,
  type TelegramLinkResponse,
  type TelegramSubscriptionRequest,
} from "@claimrail/contracts";
import { createDatabase, encryptSecret, hashSecret, SubscriptionRepository } from "@claimrail/db";
import { SHANNON_DREAMDEX } from "@claimrail/dreamdex";
import { createPublicClient, getAddress, http, type Hex } from "viem";

const CHALLENGE_TTL_MS = 10 * 60_000;
const LINK_TTL_MS = 10 * 60_000;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equal(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function database() {
  return createDatabase(required("DATABASE_URL"), {
    maxConnections: 2,
    applicationName: "claimrail-web-telegram",
  });
}

export async function createTelegramChallenge(input: TelegramSubscriptionRequest) {
  const username = required("CLAIMRAIL_TELEGRAM_BOT_USERNAME");
  required("CLAIMRAIL_TELEGRAM_BOT_TOKEN");
  required("CLAIMRAIL_SECRET_ENCRYPTION_KEY");
  const webhookSecret = required("CLAIMRAIL_TELEGRAM_WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new Error("Telegram bot username is invalid");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
    throw new Error("Telegram webhook secret is invalid");
  }
  const owner = getAddress(input.owner);
  const challengeId = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + CHALLENGE_TTL_MS);
  const message = buildTelegramChallengeMessage({
    challengeId,
    owner,
    chainId: SHANNON_DREAMDEX.chain.id,
    eventTypes: input.eventTypes,
    nonce: randomBytes(18).toString("base64url"),
    expiresAt,
  });
  const context = database();
  try {
    await new SubscriptionRepository(context.db).createTelegramChallenge({
      id: challengeId,
      ownerAddress: owner,
      eventTypes: input.eventTypes,
      challengeHash: digest(message),
      expiresAt,
      createdAt,
    });
  } finally {
    await context.close();
  }
  return telegramSubscriptionChallengeResponseSchema.parse({
    schemaVersion: "1",
    challengeId,
    owner,
    message,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function verifyTelegramChallenge(
  input: SubscriptionVerificationRequest,
): Promise<TelegramLinkResponse> {
  const username = required("CLAIMRAIL_TELEGRAM_BOT_USERNAME");
  const context = database();
  try {
    const repository = new SubscriptionRepository(context.db);
    const challenge = await repository.getPendingTelegramChallenge(input.challengeId);
    if (challenge === null) throw new Error("Telegram challenge was not found or already used");
    if (!equal(digest(input.message), challenge.challengeHash)) {
      throw new Error("signed message does not match the stored Telegram challenge");
    }
    const now = new Date();
    if (challenge.expiresAt.getTime() <= now.getTime())
      throw new Error("Telegram challenge expired");
    const client = createPublicClient({
      chain: SHANNON_DREAMDEX.chain,
      transport: http(SHANNON_DREAMDEX.rpcHttpUrl),
    });
    const valid = await client.verifyMessage({
      address: getAddress(challenge.ownerAddress),
      message: input.message,
      signature: input.signature as Hex,
    });
    if (!valid) throw new Error("wallet signature does not match the Telegram owner");
    const linkToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
    const linked = await repository.markTelegramProofVerified({
      challengeId: input.challengeId,
      expectedChallengeHash: challenge.challengeHash,
      linkTokenHash: hashSecret(linkToken),
      linkExpiresAt: expiresAt,
      verifiedAt: now,
    });
    return telegramLinkResponseSchema.parse({
      schemaVersion: "1",
      owner: getAddress(linked.ownerAddress),
      deepLink: `https://t.me/${username}?start=${linkToken}`,
      expiresAt: expiresAt.toISOString(),
    });
  } finally {
    await context.close();
  }
}

export async function consumeTelegramUpdate(request: Request, update: unknown) {
  const expectedSecret = required("CLAIMRAIL_TELEGRAM_WEBHOOK_SECRET");
  const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expectedSecret);
  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    throw new Error("TelegramWebhookUnauthorized");
  }
  if (typeof update !== "object" || update === null || !("message" in update))
    return { linked: false };
  const message = update.message;
  if (
    typeof message !== "object" ||
    message === null ||
    !("text" in message) ||
    !("chat" in message)
  )
    return { linked: false };
  const text = typeof message.text === "string" ? message.text : "";
  const match = /^\/start(?:@[A-Za-z0-9_]+)? ([A-Za-z0-9_-]{32})$/.exec(text);
  const chat = message.chat;
  if (match?.[1] === undefined || typeof chat !== "object" || chat === null || !("id" in chat))
    return { linked: false };
  const chatId = String(chat.id);
  if (!/^-?[0-9]{1,20}$/.test(chatId)) return { linked: false };
  const context = database();
  try {
    const linked = await new SubscriptionRepository(context.db).activateTelegramLink({
      linkTokenHash: hashSecret(match[1]),
      chatFingerprint: digest(chatId),
      chatCiphertext: encryptSecret(chatId, required("CLAIMRAIL_SECRET_ENCRYPTION_KEY")),
      now: new Date(),
    });
    if (linked === null) return { linked: false };
    const botToken = process.env.CLAIMRAIL_TELEGRAM_BOT_TOKEN?.trim();
    if (botToken) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "ClaimRail linked. Verified DreamDEX settlement events will arrive here.",
        }),
        signal: AbortSignal.timeout(8_000),
      }).catch(() => undefined);
    }
    return { linked: true };
  } finally {
    await context.close();
  }
}
