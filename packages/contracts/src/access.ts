import { z } from "zod";
import { evmAddressSchema } from "./http/schemas.js";
import { buildClaimRailSiweMessage, type ClaimRailSiweContext } from "./siwe.js";

export const deliveryConsoleChallengeRequestSchema = z.object({ owner: evmAddressSchema }).strict();

export const deliveryConsoleChallengeResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  challengeId: z.uuid(),
  owner: evmAddressSchema,
  purpose: z.literal("delivery_console"),
  message: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export const accessVerificationRequestSchema = z
  .object({
    challengeId: z.uuid(),
    message: z.string().min(1).max(8_192),
    signature: z
      .string()
      .regex(/^0x(?:[0-9a-fA-F]{2})+$/, "Expected a hex-encoded wallet signature")
      .max(16_386),
  })
  .strict();

export const accessVerificationResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  owner: evmAddressSchema,
  accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  scopes: z.array(z.enum(["deliveries:read", "deliveries:replay", "notifications:test"])).min(1),
  expiresAt: z.iso.datetime(),
});

export function buildDeliveryConsoleChallengeMessage(input: {
  readonly challengeId: ClaimRailSiweContext["challengeId"];
  readonly owner: ClaimRailSiweContext["owner"];
  readonly chainId: ClaimRailSiweContext["chainId"];
  readonly domain: ClaimRailSiweContext["domain"];
  readonly uri: ClaimRailSiweContext["uri"];
  readonly nonce: ClaimRailSiweContext["nonce"];
  readonly issuedAt: ClaimRailSiweContext["issuedAt"];
  readonly expiresAt: ClaimRailSiweContext["expiresAt"];
}): string {
  return buildClaimRailSiweMessage(
    input,
    "Inspect, test, and replay this wallet's ClaimRail deliveries. This does not authorize transactions, token approvals, claims, or gas spending.",
    [
      "urn:claimrail:permission:deliveries-read",
      "urn:claimrail:permission:deliveries-replay",
      "urn:claimrail:permission:notifications-test",
    ],
  );
}

export type DeliveryConsoleChallengeResponse = z.infer<
  typeof deliveryConsoleChallengeResponseSchema
>;
export type AccessVerificationResponse = z.infer<typeof accessVerificationResponseSchema>;
