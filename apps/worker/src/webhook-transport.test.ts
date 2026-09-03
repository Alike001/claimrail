import { randomBytes, randomUUID } from "node:crypto";
import { verifyWebhook } from "@claimrail/contracts";
import { encryptSecret, type LeasedWebhookDelivery } from "@claimrail/db";
import { describe, expect, it, vi } from "vitest";
import { createWebhookTransport, guardPublicHttpsDestination } from "./webhook-transport.js";

function delivery(secret: string, encryptionKey: string): LeasedWebhookDelivery {
  return {
    id: randomUUID(),
    subscriptionId: randomUUID(),
    destination: "https://agent.example.test/claimrail",
    secretCiphertext: encryptSecret(secret, encryptionKey),
    attempt: 2,
    maxAttempts: 8,
    leaseOwner: "worker-a",
    event: {
      id: "event-1",
      schemaVersion: "1",
      type: "wallet.claimable",
      aggregateType: "wallet",
      aggregateId: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
      occurredAt: "2026-09-03T12:00:00.000Z",
      payload: { expectedPayout: "1000000" },
      sourceTransactionHash: null,
      sourceLogIndex: null,
      blockNumber: "478725909",
    },
  };
}

describe("webhook transport", () => {
  it("rejects insecure and local destinations before any request", async () => {
    await expect(guardPublicHttpsDestination("http://example.com/webhook")).rejects.toThrow(
      "WebhookDestinationRejected",
    );
    await expect(guardPublicHttpsDestination("https://localhost/webhook")).rejects.toThrow(
      "WebhookDestinationRejected",
    );
    await expect(guardPublicHttpsDestination("https://127.0.0.1/webhook")).rejects.toThrow(
      "WebhookDestinationRejected",
    );
  });

  it("sends one signed canonical envelope using the exact body", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const secret = randomBytes(32).toString("base64url");
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      const body = String(init?.body);
      expect(JSON.parse(body)).toMatchObject({ attempt: 2, event: { type: "wallet.claimable" } });
      await expect(
        verifyWebhook({
          secret,
          timestamp: headers.get("claimrail-timestamp") ?? "",
          signature: headers.get("claimrail-signature") ?? "",
          body,
        }),
      ).resolves.toEqual({ valid: true });
      return new Response(null, { status: 204, headers: { "x-request-id": "receiver-42" } });
    });
    const dispatch = createWebhookTransport({
      encryptionKey,
      fetcher,
      guardDestination: async () => undefined,
    });
    await expect(dispatch(delivery(secret, encryptionKey))).resolves.toEqual({
      providerMessageId: "receiver-42",
      httpStatus: 204,
      signatureVersion: "v1",
      requestTimestamp: expect.any(Number),
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("turns non-successful responses into retryable error classes", async () => {
    const encryptionKey = randomBytes(32).toString("base64");
    const dispatch = createWebhookTransport({
      encryptionKey,
      fetcher: vi.fn(async () => new Response(null, { status: 503 })),
      guardDestination: async () => undefined,
    });
    await expect(
      dispatch(delivery(randomBytes(32).toString("base64url"), encryptionKey)),
    ).rejects.toMatchObject({ name: "WebhookHttp503" });
  });
});
