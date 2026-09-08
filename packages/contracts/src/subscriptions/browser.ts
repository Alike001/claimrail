import { z } from "zod";
import { canonicalEventTypeSchema } from "../events/webhook.js";
import { evmAddressSchema } from "../http/schemas.js";
import { buildClaimRailSiweMessage, type ClaimRailSiweContext } from "../siwe.js";
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
  readonly challengeId: ClaimRailSiweContext["challengeId"];
  readonly owner: ClaimRailSiweContext["owner"];
  readonly chainId: ClaimRailSiweContext["chainId"];
  readonly domain: ClaimRailSiweContext["domain"];
  readonly uri: ClaimRailSiweContext["uri"];
  readonly endpointFingerprint: string;
  readonly eventTypes: readonly string[];
  readonly nonce: ClaimRailSiweContext["nonce"];
  readonly issuedAt: ClaimRailSiweContext["issuedAt"];
  readonly expiresAt: ClaimRailSiweContext["expiresAt"];
}): string {
  return buildClaimRailSiweMessage(
    input,
    "Enable ClaimRail browser notifications. This does not authorize transactions, token approvals, claims, or gas spending.",
    [
      "urn:claimrail:permission:browser-notifications",
      `urn:claimrail:browser-endpoint:${input.endpointFingerprint}`,
      ...[...input.eventTypes].sort().map((event) => `urn:claimrail:event:${event}`),
    ],
  );
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
