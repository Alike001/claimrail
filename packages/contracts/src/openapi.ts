import { z, type ZodType } from "zod";
import {
  accessVerificationRequestSchema,
  accessVerificationResponseSchema,
  deliveryConsoleChallengeRequestSchema,
  deliveryConsoleChallengeResponseSchema,
} from "./access.js";
import {
  deliveryDetailResponseSchema,
  deliveryListResponseSchema,
  deliveryReplayResponseSchema,
  notificationTestResponseSchema,
} from "./deliveries.js";
import { canonicalDeliveryEventSchema, webhookEnvelopeSchema } from "./events/webhook.js";
import {
  apiErrorSchema,
  claimPrepareRequestSchema,
  claimPrepareResponseSchema,
  claimReceiptResponseSchema,
  claimSubmissionRequestSchema,
  claimSubmissionResponseSchema,
  marketSettlementResponseSchema,
  walletClaimablesResponseSchema,
  walletHistoryResponseSchema,
  walletPositionsResponseSchema,
} from "./http/schemas.js";
import {
  browserConfigurationResponseSchema,
  browserSubscriptionChallengeResponseSchema,
  browserSubscriptionRequestSchema,
  browserSubscriptionVerificationRequestSchema,
  browserSubscriptionVerificationResponseSchema,
} from "./subscriptions/browser.js";
import {
  subscriptionChallengeResponseSchema,
  subscriptionVerificationRequestSchema,
  subscriptionVerificationResponseSchema,
  webhookSubscriptionRequestSchema,
} from "./subscriptions/challenge.js";
import {
  telegramLinkResponseSchema,
  telegramSubscriptionChallengeResponseSchema,
  telegramSubscriptionRequestSchema,
  telegramSubscriptionVerificationRequestSchema,
} from "./subscriptions/telegram.js";

export const claimRailPublicSchemas = {
  ApiError: apiErrorSchema,
  WalletPositionsResponse: walletPositionsResponseSchema,
  WalletClaimablesResponse: walletClaimablesResponseSchema,
  WalletHistoryResponse: walletHistoryResponseSchema,
  MarketSettlementResponse: marketSettlementResponseSchema,
  ClaimPrepareRequest: claimPrepareRequestSchema,
  ClaimPrepareResponse: claimPrepareResponseSchema,
  ClaimSubmissionRequest: claimSubmissionRequestSchema,
  ClaimSubmissionResponse: claimSubmissionResponseSchema,
  ClaimReceiptResponse: claimReceiptResponseSchema,
  WebhookSubscriptionRequest: webhookSubscriptionRequestSchema,
  SubscriptionChallengeResponse: subscriptionChallengeResponseSchema,
  SubscriptionVerificationRequest: subscriptionVerificationRequestSchema,
  SubscriptionVerificationResponse: subscriptionVerificationResponseSchema,
  BrowserConfigurationResponse: browserConfigurationResponseSchema,
  BrowserSubscriptionRequest: browserSubscriptionRequestSchema,
  BrowserSubscriptionChallengeResponse: browserSubscriptionChallengeResponseSchema,
  BrowserSubscriptionVerificationRequest: browserSubscriptionVerificationRequestSchema,
  BrowserSubscriptionVerificationResponse: browserSubscriptionVerificationResponseSchema,
  TelegramSubscriptionRequest: telegramSubscriptionRequestSchema,
  TelegramSubscriptionChallengeResponse: telegramSubscriptionChallengeResponseSchema,
  TelegramSubscriptionVerificationRequest: telegramSubscriptionVerificationRequestSchema,
  TelegramLinkResponse: telegramLinkResponseSchema,
  DeliveryConsoleChallengeRequest: deliveryConsoleChallengeRequestSchema,
  DeliveryConsoleChallengeResponse: deliveryConsoleChallengeResponseSchema,
  AccessVerificationRequest: accessVerificationRequestSchema,
  AccessVerificationResponse: accessVerificationResponseSchema,
  DeliveryListResponse: deliveryListResponseSchema,
  DeliveryDetailResponse: deliveryDetailResponseSchema,
  DeliveryReplayResponse: deliveryReplayResponseSchema,
  NotificationTestResponse: notificationTestResponseSchema,
  CanonicalDeliveryEvent: canonicalDeliveryEventSchema,
  WebhookEnvelope: webhookEnvelopeSchema,
} satisfies Record<string, ZodType>;

export type ClaimRailPublicSchemaName = keyof typeof claimRailPublicSchemas;

export function claimRailJsonSchemas(): Record<ClaimRailPublicSchemaName, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(claimRailPublicSchemas).map(([name, schema]) => {
      const generated = z.toJSONSchema(schema, {
        target: "draft-2020-12",
        reused: "ref",
      });
      const jsonSchema = Object.fromEntries(
        Object.entries(generated).filter(([key]) => key !== "$schema"),
      );
      return [name, jsonSchema];
    }),
  ) as unknown as Record<ClaimRailPublicSchemaName, Record<string, unknown>>;
}

export function createClaimRailJsonSchemaBundle() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "ClaimRail public schema bundle",
    schemas: claimRailJsonSchemas(),
  } as const;
}

const schemaRef = (name: ClaimRailPublicSchemaName) => ({
  "application/json": { schema: { $ref: `#/components/schemas/${name}` } },
});

const requestBody = (name: ClaimRailPublicSchemaName) => ({
  required: true,
  content: schemaRef(name),
});

const response = (description: string, name: ClaimRailPublicSchemaName) => ({
  description,
  content: schemaRef(name),
});

export function createClaimRailOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "ClaimRail API",
      version: "0.6.0",
      description:
        "Evidence-aware DreamDEX wallet, settlement, owner-signed claim planning, and canonical event delivery.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/api/v1/wallets/{address}/positions": {
        get: {
          operationId: "listPositions",
          summary: "List normalized DreamDEX positions for a public wallet",
          parameters: [{ $ref: "#/components/parameters/Address" }],
          responses: {
            "200": response("Complete normalized position scan", "WalletPositionsResponse"),
            "400": response("Invalid wallet address", "ApiError"),
            "503": response("DreamDEX or Somnia unavailable", "ApiError"),
          },
        },
      },
      "/api/v1/wallets/{address}/claimables": {
        get: {
          operationId: "listClaimables",
          summary: "List verified positions that can return funds now",
          parameters: [{ $ref: "#/components/parameters/Address" }],
          responses: {
            "200": response("Claimable and void-refundable positions", "WalletClaimablesResponse"),
            "400": response("Invalid wallet address", "ApiError"),
            "503": response("DreamDEX or Somnia unavailable", "ApiError"),
          },
        },
      },
      "/api/v1/wallets/{address}/history": {
        get: {
          operationId: "listWalletHistory",
          summary: "List terminal positions and independently reconciled claim receipts",
          parameters: [{ $ref: "#/components/parameters/Address" }],
          responses: {
            "200": response("Lossless wallet settlement history", "WalletHistoryResponse"),
            "400": response("Invalid wallet address", "ApiError"),
            "503": response("DreamDEX or Somnia unavailable", "ApiError"),
          },
        },
      },
      "/api/v1/markets/{marketId}/settlement": {
        get: {
          operationId: "explainSettlement",
          summary: "Explain a market using reconciled on-chain evidence",
          parameters: [{ $ref: "#/components/parameters/MarketId" }],
          responses: {
            "200": response("Verified settlement explanation", "MarketSettlementResponse"),
            "400": response("Invalid market ID", "ApiError"),
            "503": response("Settlement evidence unavailable", "ApiError"),
          },
        },
      },
      "/api/v1/claims/prepare": {
        post: {
          operationId: "buildRedemptionPlan",
          summary: "Build and simulate a short-lived owner-only redemption plan",
          requestBody: requestBody("ClaimPrepareRequest"),
          responses: {
            "200": response("Approval gate or simulated claim plan", "ClaimPrepareResponse"),
            "400": response("Invalid request", "ApiError"),
            "409": response("Safe claim plan cannot be produced", "ApiError"),
          },
        },
      },
      "/api/v1/claims/submissions": {
        post: {
          operationId: "recordClaimSubmission",
          summary: "Record a wallet-broadcast claim hash as pending",
          requestBody: requestBody("ClaimSubmissionRequest"),
          responses: {
            "202": response("Durably recorded pending transaction", "ClaimSubmissionResponse"),
            "400": response("Invalid request", "ApiError"),
            "409": response("Plan or transaction conflict", "ApiError"),
          },
        },
      },
      "/api/v1/claims/{claimId}": {
        get: {
          operationId: "getClaimReceipt",
          summary: "Read an independently reconciled claim receipt",
          parameters: [{ $ref: "#/components/parameters/ClaimId" }],
          responses: {
            "200": response("Lossless settlement receipt", "ClaimReceiptResponse"),
            "400": response("Invalid claim ID", "ApiError"),
            "404": response("Receipt not found", "ApiError"),
          },
        },
      },
      "/api/v1/subscriptions/challenges": {
        post: {
          operationId: "createWebhookChallenge",
          summary: "Create an owner-bound HTTPS webhook challenge",
          requestBody: requestBody("WebhookSubscriptionRequest"),
          responses: {
            "201": response("Readable challenge to sign", "SubscriptionChallengeResponse"),
            "400": response("Invalid request", "ApiError"),
            "409": response("A verified route already exists", "ApiError"),
          },
        },
      },
      "/api/v1/subscriptions/verify": {
        post: {
          operationId: "verifyWebhookSubscription",
          summary: "Verify ownership and activate a signed webhook",
          requestBody: requestBody("SubscriptionVerificationRequest"),
          responses: {
            "201": response(
              "Verified route and return-once HMAC secret",
              "SubscriptionVerificationResponse",
            ),
            "400": response("Invalid request", "ApiError"),
            "409": response("Challenge or signature rejected", "ApiError"),
          },
        },
      },
      "/api/v1/subscriptions/browser/config": {
        get: {
          operationId: "getBrowserConfiguration",
          summary: "Discover browser-push availability and public VAPID key",
          responses: {
            "200": response("Public browser configuration", "BrowserConfigurationResponse"),
          },
        },
      },
      "/api/v1/subscriptions/browser/challenges": {
        post: {
          operationId: "createBrowserChallenge",
          summary: "Create an owner-bound browser notification challenge",
          requestBody: requestBody("BrowserSubscriptionRequest"),
          responses: {
            "201": response("Readable browser challenge", "BrowserSubscriptionChallengeResponse"),
            "400": response("Invalid request", "ApiError"),
            "503": response("Browser delivery unavailable", "ApiError"),
          },
        },
      },
      "/api/v1/subscriptions/browser/verify": {
        post: {
          operationId: "verifyBrowserSubscription",
          summary: "Verify ownership and activate this browser",
          requestBody: requestBody("BrowserSubscriptionVerificationRequest"),
          responses: {
            "201": response(
              "Encrypted browser route activated",
              "BrowserSubscriptionVerificationResponse",
            ),
            "409": response("Challenge or signature rejected", "ApiError"),
          },
        },
      },
      "/api/v1/subscriptions/telegram/challenges": {
        post: {
          operationId: "createTelegramChallenge",
          summary: "Create an owner-bound Telegram challenge",
          requestBody: requestBody("TelegramSubscriptionRequest"),
          responses: {
            "201": response("Readable Telegram challenge", "TelegramSubscriptionChallengeResponse"),
            "503": response("Telegram unavailable", "ApiError"),
          },
        },
      },
      "/api/v1/subscriptions/telegram/verify": {
        post: {
          operationId: "verifyTelegramSubscription",
          summary: "Verify ownership and issue a one-time Telegram link",
          requestBody: requestBody("TelegramSubscriptionVerificationRequest"),
          responses: {
            "201": response("Ten-minute Telegram deep link", "TelegramLinkResponse"),
            "409": response("Challenge or signature rejected", "ApiError"),
          },
        },
      },
      "/api/v1/access/challenges": {
        post: {
          operationId: "createDeliveryAccessChallenge",
          summary: "Create a delivery-console ownership challenge",
          requestBody: requestBody("DeliveryConsoleChallengeRequest"),
          responses: {
            "201": response("Readable access challenge", "DeliveryConsoleChallengeResponse"),
          },
        },
      },
      "/api/v1/access/verify": {
        post: {
          operationId: "verifyDeliveryAccess",
          summary: "Exchange ownership proof for short-lived delivery access",
          requestBody: requestBody("AccessVerificationRequest"),
          responses: {
            "201": response("Owner-scoped bearer access", "AccessVerificationResponse"),
            "409": response("Challenge or signature rejected", "ApiError"),
          },
        },
      },
      "/api/v1/deliveries": {
        get: {
          operationId: "listDeliveries",
          summary: "List the authenticated owner's delivery ledger",
          security: [{ DeliveryConsoleBearer: [] }],
          responses: {
            "200": response("Owner-scoped deliveries", "DeliveryListResponse"),
            "401": response("Access rejected", "ApiError"),
          },
        },
      },
      "/api/v1/deliveries/{deliveryId}": {
        get: {
          operationId: "getDelivery",
          summary: "Inspect one delivery and its attempt history",
          security: [{ DeliveryConsoleBearer: [] }],
          parameters: [{ $ref: "#/components/parameters/DeliveryId" }],
          responses: {
            "200": response("Canonical event and attempts", "DeliveryDetailResponse"),
            "404": response("Delivery absent or not owned", "ApiError"),
          },
        },
      },
      "/api/v1/deliveries/{deliveryId}/replay": {
        post: {
          operationId: "replayDelivery",
          summary: "Requeue an owned dead-letter delivery",
          security: [{ DeliveryConsoleBearer: [] }],
          parameters: [{ $ref: "#/components/parameters/DeliveryId" }],
          responses: {
            "202": response("Delivery requeued", "DeliveryReplayResponse"),
            "404": response("Delivery absent, active, or not owned", "ApiError"),
          },
        },
      },
      "/api/v1/notifications/test": {
        post: {
          operationId: "sendTestNotification",
          summary: "Queue one clearly labelled non-financial test event for every active route",
          security: [{ DeliveryConsoleBearer: [] }],
          responses: {
            "202": response("Test event queued or within its cooldown", "NotificationTestResponse"),
            "401": response("Access rejected", "ApiError"),
            "409": response("No verified notification route exists", "ApiError"),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        DeliveryConsoleBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "opaque owner-scoped token",
        },
      },
      schemas: claimRailJsonSchemas(),
      parameters: {
        Address: {
          name: "address",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
        },
        MarketId: {
          name: "marketId",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
        },
        ClaimId: {
          name: "claimId",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^claim:0x[0-9a-fA-F]{64}$" },
        },
        DeliveryId: {
          name: "deliveryId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      },
    },
  } as const;
}
