import { z } from "zod";
import { canonicalEventTypeSchema } from "../events/webhook.js";
import { evmAddressSchema } from "../http/schemas.js";
import { buildClaimRailSiweMessage, type ClaimRailSiweContext } from "../siwe.js";
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
  readonly challengeId: ClaimRailSiweContext["challengeId"];
  readonly owner: ClaimRailSiweContext["owner"];
  readonly chainId: ClaimRailSiweContext["chainId"];
  readonly domain: ClaimRailSiweContext["domain"];
  readonly uri: ClaimRailSiweContext["uri"];
  readonly eventTypes: readonly string[];
  readonly nonce: ClaimRailSiweContext["nonce"];
  readonly issuedAt: ClaimRailSiweContext["issuedAt"];
  readonly expiresAt: ClaimRailSiweContext["expiresAt"];
}) {
  return buildClaimRailSiweMessage(
    input,
    "Link a private Telegram chat to ClaimRail alerts. This does not authorize transactions, token approvals, claims, or gas spending.",
    [
      "urn:claimrail:permission:telegram-notifications",
      ...[...input.eventTypes].sort().map((event) => `urn:claimrail:event:${event}`),
    ],
  );
}

export type TelegramSubscriptionRequest = z.infer<typeof telegramSubscriptionRequestSchema>;
export type TelegramSubscriptionChallengeResponse = z.infer<
  typeof telegramSubscriptionChallengeResponseSchema
>;
export type TelegramLinkResponse = z.infer<typeof telegramLinkResponseSchema>;
