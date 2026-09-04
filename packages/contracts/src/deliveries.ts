import { z } from "zod";
import { canonicalDeliveryEventSchema, canonicalEventTypeSchema } from "./events/webhook.js";
import { evmAddressSchema } from "./http/schemas.js";

export const deliveryStatusSchema = z.enum([
  "pending",
  "delivering",
  "delivered",
  "failed",
  "dead",
]);
export const deliveryIdSchema = z.uuid();

export const deliverySummarySchema = z.object({
  total: z.number().int().nonnegative(),
  activeRoutes: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  retrying: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  dead: z.number().int().nonnegative(),
});

export const deliveryListItemSchema = z.object({
  id: z.uuid(),
  eventId: z.string().min(1),
  eventType: canonicalEventTypeSchema,
  owner: evmAddressSchema,
  kind: z.enum(["webhook", "browser", "telegram"]),
  destination: z.string().min(1).max(4_096),
  status: deliveryStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  lastAttemptAt: z.iso.datetime().nullable(),
  nextAttemptAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const deliveryListResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  owner: evmAddressSchema,
  summary: deliverySummarySchema,
  deliveries: z.array(deliveryListItemSchema),
});

export const deliveryAttemptSchema = z.object({
  attempt: z.number().int().positive(),
  status: z.enum(["delivering", "delivered", "failed"]),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  providerMessageId: z.string().nullable(),
  error: z.string().nullable(),
  signatureVersion: z.string().nullable(),
  requestTimestamp: z.number().int().nonnegative().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});

export const deliveryDetailResponseSchema = deliveryListItemSchema.extend({
  schemaVersion: z.literal("1"),
  event: canonicalDeliveryEventSchema,
  attempts: z.array(deliveryAttemptSchema),
});

export const deliveryReplayResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  deliveryId: z.uuid(),
  status: z.literal("failed"),
  nextAttemptAt: z.iso.datetime(),
  attemptsRemaining: z.number().int().positive(),
});

export const notificationTestResponseSchema = z.object({
  schemaVersion: z.literal("1"),
  eventId: z.string().min(1),
  type: z.literal("notification.test"),
  owner: evmAddressSchema,
  status: z.enum(["queued", "cooldown"]),
  routeCount: z.number().int().positive(),
  deliveryCount: z.number().int().nonnegative(),
  nextAllowedAt: z.iso.datetime(),
  testOnly: z.literal(true),
  notice: z.literal(
    "This is a ClaimRail test notification. It is not a market settlement or claimable payout.",
  ),
});

export type DeliveryListItem = z.infer<typeof deliveryListItemSchema>;
export type DeliveryListResponse = z.infer<typeof deliveryListResponseSchema>;
export type DeliveryDetailResponse = z.infer<typeof deliveryDetailResponseSchema>;
export type DeliveryReplayResponse = z.infer<typeof deliveryReplayResponseSchema>;
export type NotificationTestResponse = z.infer<typeof notificationTestResponseSchema>;
