import { browserPushSubscriptionSchema, type CanonicalDeliveryEvent } from "@claimrail/contracts";
import { decryptSecret, type LeasedWebhookDelivery } from "@claimrail/db";
import webPush from "web-push";
import type { WebhookDispatchResult } from "./webhook-transport.js";

export interface VapidConfiguration {
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
}

export class BrowserPushDispatchError extends Error {
  readonly signatureVersion = "vapid";
  readonly requestTimestamp = Math.floor(Date.now() / 1_000);

  constructor(readonly httpStatus: number) {
    super("BrowserPushError");
    this.name =
      httpStatus === 404 || httpStatus === 410 ? "BrowserPushExpired" : `BrowserPush${httpStatus}`;
  }
}

function notificationCopy(event: CanonicalDeliveryEvent) {
  const copy: Record<
    CanonicalDeliveryEvent["type"],
    { readonly title: string; readonly body: string }
  > = {
    "market.locked": {
      title: "DreamDEX market locked",
      body: "Trading has ended. Settlement is next.",
    },
    "market.resolved": {
      title: "DreamDEX result observed",
      body: "ClaimRail is verifying the settlement state.",
    },
    "market.finalized": {
      title: "DreamDEX market finalized",
      body: "The final result is now recorded on Somnia.",
    },
    "market.voided": {
      title: "DreamDEX market voided",
      body: "Eligible positions may now return collateral.",
    },
    "wallet.claimable": {
      title: "Funds ready to claim",
      body: "A verified DreamDEX position is claimable.",
    },
    "wallet.payout_owed": {
      title: "Payout still owed",
      body: "ClaimRail found collateral owed after redemption.",
    },
    "claim.plan_created": {
      title: "Claim plan ready",
      body: "Review the fresh redemption plan in ClaimRail.",
    },
    "claim.submitted": {
      title: "Claim submitted",
      body: "Your transaction is waiting for verified confirmation.",
    },
    "claim.confirmed": {
      title: "Claim confirmed",
      body: "Receipt and post-state evidence now agree.",
    },
    "claim.failed": {
      title: "Claim needs attention",
      body: "The claim did not reach a verified confirmation.",
    },
    "claim.superseded": {
      title: "Claim transaction replaced",
      body: "The original claim transaction was superseded.",
    },
    "notification.test": {
      title: "ClaimRail test notification",
      body: "Route check only — this is not a market settlement or claimable payout.",
    },
  };
  return copy[event.type];
}

function statusCode(error: unknown): number {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = Number(error.statusCode);
    if (Number.isInteger(value) && value >= 100 && value <= 599) return value;
  }
  return 503;
}

export function createBrowserPushTransport(input: {
  readonly encryptionKey: string;
  readonly vapid: VapidConfiguration;
  readonly sendNotification?: typeof webPush.sendNotification;
}) {
  const sendNotification = input.sendNotification ?? webPush.sendNotification;
  return async (delivery: LeasedWebhookDelivery): Promise<WebhookDispatchResult> => {
    if (delivery.kind !== "browser") throw new Error("BrowserPushKindMismatch");
    const subscription = browserPushSubscriptionSchema.parse(
      JSON.parse(decryptSecret(delivery.secretCiphertext, input.encryptionKey)),
    );
    const pushSubscription = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: subscription.keys,
    };
    const copy = notificationCopy(delivery.event);
    const requestTimestamp = Math.floor(Date.now() / 1_000);
    try {
      const result = await sendNotification(
        pushSubscription,
        JSON.stringify({
          schemaVersion: "1",
          title: copy.title,
          body: copy.body,
          tag: delivery.event.id.slice(0, 32),
          url: delivery.event.type === "notification.test" ? "/developers/deliveries" : "/",
          eventType: delivery.event.type,
        }),
        {
          vapidDetails: input.vapid,
          TTL: 86_400,
          urgency: delivery.event.type === "wallet.claimable" ? "high" : "normal",
          topic: delivery.event.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32),
        },
      );
      return {
        providerMessageId: `push:${result.statusCode}`,
        httpStatus: result.statusCode,
        signatureVersion: "vapid",
        requestTimestamp,
      };
    } catch (error) {
      throw new BrowserPushDispatchError(statusCode(error));
    }
  };
}
