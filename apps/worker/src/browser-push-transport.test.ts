import { randomBytes, randomUUID } from "node:crypto";
import type { BrowserPushSubscription } from "@claimrail/contracts";
import { encryptSecret, type LeasedWebhookDelivery } from "@claimrail/db";
import { describe, expect, it, vi } from "vitest";
import { createBrowserPushTransport } from "./browser-push-transport.js";

const subscription: BrowserPushSubscription = {
  endpoint: "https://push.example.test/subscriptions/abc",
  expirationTime: null,
  keys: { p256dh: "a".repeat(65), auth: "b".repeat(22) },
};

function delivery(encryptionKey: string): LeasedWebhookDelivery {
  return {
    id: randomUUID(),
    subscriptionId: randomUUID(),
    destination: "ab".repeat(32),
    kind: "browser",
    secretCiphertext: encryptSecret(JSON.stringify(subscription), encryptionKey),
    attempt: 1,
    maxAttempts: 8,
    leaseOwner: "worker-a",
    event: {
      id: "event-wallet-claimable",
      schemaVersion: "1",
      type: "wallet.claimable",
      aggregateType: "wallet",
      aggregateId: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
      occurredAt: "2026-09-03T12:00:00.000Z",
      payload: {},
      sourceTransactionHash: null,
      sourceLogIndex: null,
      blockNumber: "478725909",
    },
  };
}

describe("browser push transport", () => {
  it("decrypts the subscription and sends a user-visible canonical event", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const sendNotification = vi.fn(async (_subscription, payload, options) => {
      expect(JSON.parse(String(payload))).toMatchObject({
        title: "Funds ready to claim",
        eventType: "wallet.claimable",
      });
      expect(options).toMatchObject({ urgency: "high", TTL: 86_400 });
      return { statusCode: 201, body: "", headers: {} };
    });
    const dispatch = createBrowserPushTransport({
      encryptionKey,
      vapid: {
        subject: "mailto:ops@example.test",
        publicKey: "public-key",
        privateKey: "private-key",
      },
      sendNotification,
    });
    await expect(dispatch(delivery(encryptionKey))).resolves.toMatchObject({
      providerMessageId: "push:201",
      httpStatus: 201,
      signatureVersion: "vapid",
    });
    expect(sendNotification).toHaveBeenCalledOnce();
  });

  it("classifies an expired push endpoint without exposing its response", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const dispatch = createBrowserPushTransport({
      encryptionKey,
      vapid: {
        subject: "mailto:ops@example.test",
        publicKey: "public-key",
        privateKey: "private-key",
      },
      sendNotification: vi.fn(async () => {
        throw Object.assign(new Error("endpoint details"), { statusCode: 410 });
      }),
    });
    await expect(dispatch(delivery(encryptionKey))).rejects.toMatchObject({
      name: "BrowserPushExpired",
      httpStatus: 410,
      signatureVersion: "vapid",
    });
  });
});
