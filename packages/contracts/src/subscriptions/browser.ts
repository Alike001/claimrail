import { z } from "zod";
import { canonicalEventTypeSchema } from "../events/webhook.js";
import { evmAddressSchema } from "../http/schemas.js";
import {
  subscriptionChallengeResponseSchema,
  subscriptionVerificationRequestSchema,
} from "./challenge.js";

const base64UrlSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .min(16)
  .max(512);

export const browserPushSubscriptionSchema = z
  .object({
    endpoint: z
      .url()
      .max(4_096)
      .refine((value) => new URL(value).protocol === "https:", "Push endpoint must use HTTPS"),
    expirationTime: z.number().nonnegative().nullable().optional(),
    keys: z
      .object({
        p256dh: base64UrlSchema,
        auth: base64UrlSchema,
      })
      .strict(),
  })
  .strict();

export const browserSubscriptionRequestSchema = z
  .object({
    owner: evmAddressSchema,
    kind: z.literal("browser"),
    subscription: browserPushSubscriptionSchema,
    eventTypes: z.array(canonicalEventTypeSchema).min(1).max(32),
  })
  .strict()
  .refine((value) => new Set(value.eventTypes).size === value.eventTypes.length, {
    message: "Event types must be unique",
    path: ["eventTypes"],
  });

export const browserConfigurationResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  available: z.boolean(),
  publicKey: base64UrlSchema.nullable(),
});

export const browserSubscriptionChallengeResponseSchema =
  subscriptionChallengeResponseSchema.extend({
    endpointFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  });

export const browserSubscriptionVerificationRequestSchema = subscriptionVerificationRequestSchema;

export const browserSubscriptionVerificationResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  subscription: z.object({
    id: z.uuid(),
    owner: evmAddressSchema,
    kind: z.literal("browser"),
    endpointFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    eventTypes: z.array(canonicalEventTypeSchema).min(1),
    active: z.literal(true),
    verifiedAt: z.iso.datetime(),
  }),
});

export function buildBrowserSubscriptionChallengeMessage(input: {
  readonly challengeId: string;
  readonly owner: string;
  readonly chainId: number;
  readonly endpointFingerprint: string;
  readonly eventTypes: readonly string[];
  readonly nonce: string;
  readonly expiresAt: Date;
}): string {
  return [
    "ClaimRail browser notifications",
    "",
    "Prove that you control this wallet to enable notifications on this browser.",
    "This signature does not authorize trades, claims, token approvals, or gas spending.",
    "",
    `Wallet: ${input.owner}`,
    `Chain ID: ${input.chainId}`,
    `Endpoint fingerprint: ${input.endpointFingerprint}`,
    `Events: ${[...input.eventTypes].sort().join(", ")}`,
    `Challenge ID: ${input.challengeId}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

export type BrowserPushSubscription = z.infer<typeof browserPushSubscriptionSchema>;
export type BrowserSubscriptionRequest = z.infer<typeof browserSubscriptionRequestSchema>;
export type BrowserConfigurationResponse = z.infer<typeof browserConfigurationResponseSchema>;
export type BrowserSubscriptionChallengeResponse = z.infer<
  typeof browserSubscriptionChallengeResponseSchema
>;
export type BrowserSubscriptionVerificationResponse = z.infer<
  typeof browserSubscriptionVerificationResponseSchema
>;
