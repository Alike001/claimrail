import { z } from "zod";
import { evmAddressSchema } from "./http/schemas.js";

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
  scopes: z.array(z.literal("deliveries:read").or(z.literal("deliveries:replay"))).min(1),
  expiresAt: z.iso.datetime(),
});

export function buildDeliveryConsoleChallengeMessage(input: {
  readonly challengeId: string;
  readonly owner: string;
  readonly chainId: number;
  readonly nonce: string;
  readonly expiresAt: Date;
}): string {
  return [
    "ClaimRail developer console",
    "",
    "Prove that you control this wallet to inspect and replay its webhook deliveries.",
    "This signature does not authorize trades, claims, token approvals, or gas spending.",
    "",
    `Wallet: ${input.owner}`,
    `Chain ID: ${input.chainId}`,
    `Challenge ID: ${input.challengeId}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

export type DeliveryConsoleChallengeResponse = z.infer<
  typeof deliveryConsoleChallengeResponseSchema
>;
export type AccessVerificationResponse = z.infer<typeof accessVerificationResponseSchema>;
