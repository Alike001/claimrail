import { z } from "zod";
import { canonicalEventTypeSchema } from "../events/webhook.js";
import { evmAddressSchema } from "../http/schemas.js";

export const webhookSubscriptionRequestSchema = z
  .object({
    owner: evmAddressSchema,
    kind: z.literal("webhook"),
    destination: z
      .url()
      .max(2_048)
      .refine((value) => new URL(value).protocol === "https:", "Webhook URL must use HTTPS"),
    eventTypes: z.array(canonicalEventTypeSchema).min(1).max(32),
  })
  .strict()
  .refine((value) => new Set(value.eventTypes).size === value.eventTypes.length, {
    message: "Event types must be unique",
    path: ["eventTypes"],
  });

export const subscriptionChallengeResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  challengeId: z.uuid(),
  owner: evmAddressSchema,
  message: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export const subscriptionVerificationRequestSchema = z
  .object({
    challengeId: z.uuid(),
    message: z.string().min(1).max(8_192),
    signature: z
      .string()
      .regex(/^0x(?:[0-9a-fA-F]{2})+$/, "Expected a hex-encoded wallet signature")
      .max(16_386),
  })
  .strict();

export const subscriptionVerificationResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  subscription: z.object({
    id: z.uuid(),
    owner: evmAddressSchema,
    kind: z.literal("webhook"),
    destination: z.url(),
    eventTypes: z.array(canonicalEventTypeSchema).min(1),
    active: z.literal(true),
    verifiedAt: z.iso.datetime(),
  }),
  webhookSecret: z.string().min(43),
  secretNotice: z.literal("Store this secret now. ClaimRail will not display it again."),
});

export type WebhookSubscriptionRequest = z.infer<typeof webhookSubscriptionRequestSchema>;
export type SubscriptionChallengeResponse = z.infer<typeof subscriptionChallengeResponseSchema>;
export type SubscriptionVerificationRequest = z.infer<typeof subscriptionVerificationRequestSchema>;
export type SubscriptionVerificationResponse = z.infer<
  typeof subscriptionVerificationResponseSchema
>;

export function buildSubscriptionChallengeMessage(input: {
  readonly challengeId: string;
  readonly owner: string;
  readonly chainId: number;
  readonly destination: string;
  readonly eventTypes: readonly string[];
  readonly nonce: string;
  readonly expiresAt: Date;
}): string {
  return [
    "ClaimRail notification subscription",
    "",
    "Prove that you control this wallet to create a webhook subscription.",
    "This signature does not authorize trades, claims, token approvals, or gas spending.",
    "",
    `Wallet: ${input.owner}`,
    `Chain ID: ${input.chainId}`,
    `Destination: ${input.destination}`,
    `Events: ${[...input.eventTypes].sort().join(", ")}`,
    `Challenge ID: ${input.challengeId}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}
