import { randomBytes, randomUUID } from "node:crypto";
import type { CanonicalDeliveryEvent } from "@claimrail/contracts";
import { encryptSecret, type LeasedWebhookDelivery } from "@claimrail/db";
import { describe, expect, it, vi } from "vitest";
import { createTelegramTransport } from "./telegram-transport.js";

function delivery(
  encryptionKey: string,
  eventType: CanonicalDeliveryEvent["type"] = "wallet.claimable",
): LeasedWebhookDelivery {
  return {
    id: randomUUID(),
    subscriptionId: randomUUID(),
    destination: "ab".repeat(32),
    kind: "telegram",
    secretCiphertext: encryptSecret("123456789", encryptionKey),
    attempt: 1,
    maxAttempts: 8,
    leaseOwner: "worker-a",
    event: {
      id: "event-wallet-claimable",
      schemaVersion: "1",
      type: eventType,
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

describe("Telegram transport", () => {
  it("decrypts the chat ID and sends safe canonical-event copy", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        chat_id: "123456789",
        text: expect.stringContaining("Funds ready to claim"),
      });
      return Response.json({ ok: true, result: { message_id: 42 } });
    });
    const dispatch = createTelegramTransport({
      encryptionKey,
      botToken: "bot-token-secret",
      fetch: request,
    });
    const result = await dispatch(delivery(encryptionKey));
    expect(result).toMatchObject({
      providerMessageId: "telegram:42",
      httpStatus: 200,
      signatureVersion: "bot-api",
    });
    expect(JSON.stringify(result)).not.toContain("123456789");
    expect(JSON.stringify(result)).not.toContain("bot-token-secret");
  });

  it("classifies a blocked bot as a revoked destination", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const dispatch = createTelegramTransport({
      encryptionKey,
      botToken: "bot-token-secret",
      fetch: vi.fn(async () => new Response("forbidden", { status: 403 })),
    });
    await expect(dispatch(delivery(encryptionKey))).rejects.toMatchObject({
      name: "TelegramDestinationRevoked",
      httpStatus: 403,
      signatureVersion: "bot-api",
    });
  });

  it("labels a route test without implying a settlement or payout", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const message = JSON.parse(String(init?.body)) as { readonly text: string };
      expect(message.text).toContain("Test notification received");
      expect(message.text).toContain("not a market settlement or claimable payout");
      return Response.json({ ok: true, result: { message_id: 43 } });
    });
    const dispatch = createTelegramTransport({
      encryptionKey,
      botToken: "bot-token-secret",
      fetch: request,
    });
    await dispatch(delivery(encryptionKey, "notification.test"));
    expect(request).toHaveBeenCalledOnce();
  });
});
