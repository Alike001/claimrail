import { z } from "zod";
import { decimalIntegerSchema, transactionHashSchema } from "../http/schemas.js";

export const canonicalEventTypeSchema = z.enum([
  "market.locked",
  "market.resolved",
  "market.finalized",
  "market.voided",
  "wallet.claimable",
  "wallet.payout_owed",
  "claim.plan_created",
  "claim.submitted",
  "claim.confirmed",
  "claim.failed",
  "claim.superseded",
  "notification.test",
]);

export const canonicalDeliveryEventSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal("1"),
  type: canonicalEventTypeSchema,
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
  sourceTransactionHash: transactionHashSchema.nullable(),
  sourceLogIndex: z.number().int().nonnegative().nullable(),
  blockNumber: decimalIntegerSchema.nullable(),
});

export const webhookEnvelopeSchema = z.object({
  schemaVersion: z.literal("1"),
  deliveryId: z.uuid(),
  attempt: z.number().int().positive(),
  sentAt: z.iso.datetime(),
  event: canonicalDeliveryEventSchema,
});

export type CanonicalDeliveryEvent = z.infer<typeof canonicalDeliveryEventSchema>;
export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

const encoder = new TextEncoder();
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hmac(secret: string, message: string): Promise<string> {
  if (encoder.encode(secret).length < 32)
    throw new Error("webhook secret must be at least 32 bytes");
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(message))),
  );
}

export async function signWebhook(input: {
  readonly secret: string;
  readonly timestamp: number;
  readonly body: string;
}): Promise<string> {
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp < 0) {
    throw new RangeError("webhook timestamp must be non-negative Unix seconds");
  }
  return `v1=${await hmac(input.secret, `${input.timestamp}.${input.body}`)}`;
}

export async function verifyWebhook(input: {
  readonly secret: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly body: string;
  readonly now?: number;
  readonly toleranceSeconds?: number;
}): Promise<{ readonly valid: boolean; readonly reason?: string }> {
  if (!/^(0|[1-9][0-9]*)$/.test(input.timestamp)) {
    return { valid: false, reason: "invalid timestamp" };
  }
  const timestamp = Number(input.timestamp);
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(now)) {
    return { valid: false, reason: "invalid timestamp" };
  }
  if (!Number.isSafeInteger(tolerance) || tolerance <= 0) {
    throw new RangeError("webhook tolerance must be a positive integer");
  }
  if (Math.abs(now - timestamp) > tolerance) {
    return { valid: false, reason: "stale timestamp" };
  }
  const match = SIGNATURE_PATTERN.exec(input.signature);
  if (match === null) return { valid: false, reason: "invalid signature format" };
  const expected = await signWebhook({ secret: input.secret, timestamp, body: input.body });
  return safeEqual(expected, input.signature.toLowerCase())
    ? { valid: true }
    : { valid: false, reason: "signature mismatch" };
}
