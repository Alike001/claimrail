import { z } from "zod";
import { canonicalEventTypeSchema } from "../events/webhook.js";
import { evmAddressSchema } from "../http/schemas.js";
import { subscriptionVerificationRequestSchema } from "./challenge.js";

export const telegramSubscriptionRequestSchema = z
  .object({
    owner: evmAddressSchema,
    kind: z.literal("telegram"),
    eventTypes: z.array(canonicalEventTypeSchema).min(1).max(32),
  })
  .strict()
  .refine((value) => new Set(value.eventTypes).size === value.eventTypes.length, {
    message: "Event types must be unique",
    path: ["eventTypes"],
  });

export const telegramSubscriptionChallengeResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  challengeId: z.uuid(),
  owner: evmAddressSchema,
  message: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export const telegramSubscriptionVerificationRequestSchema = subscriptionVerificationRequestSchema;

export const telegramLinkResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  owner: evmAddressSchema,
  deepLink: z.url(),
  expiresAt: z.iso.datetime(),
});

export function buildTelegramChallengeMessage(input: {
  readonly challengeId: string;
  readonly owner: string;
  readonly chainId: number;
  readonly eventTypes: readonly string[];
  readonly nonce: string;
  readonly expiresAt: Date;
}) {
  return [
    "ClaimRail Telegram notifications",
    "",
    "Prove that you control this wallet before linking a private Telegram chat.",
    "This signature does not authorize trades, claims, token approvals, or gas spending.",
    "",
    `Wallet: ${input.owner}`,
    `Chain ID: ${input.chainId}`,
    `Events: ${[...input.eventTypes].sort().join(", ")}`,
    `Challenge ID: ${input.challengeId}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

export type TelegramSubscriptionRequest = z.infer<typeof telegramSubscriptionRequestSchema>;
export type TelegramSubscriptionChallengeResponse = z.infer<
  typeof telegramSubscriptionChallengeResponseSchema
>;
export type TelegramLinkResponse = z.infer<typeof telegramLinkResponseSchema>;
