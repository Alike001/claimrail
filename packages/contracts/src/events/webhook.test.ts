import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook, webhookEnvelopeSchema } from "./webhook.js";

const secret = "claimrail_test_secret_32_bytes_minimum";
const body = JSON.stringify({ schemaVersion: "1", event: { id: "event-1" } });

describe("ClaimRail webhook contract", () => {
  it("accepts an intact timely body and rejects tampering", async () => {
    const timestamp = 1_788_430_400;
    const signature = await signWebhook({ secret, timestamp, body });
    await expect(
      verifyWebhook({ secret, timestamp: String(timestamp), signature, body, now: timestamp + 30 }),
    ).resolves.toEqual({ valid: true });
    await expect(
      verifyWebhook({
        secret,
        timestamp: String(timestamp),
        signature,
        body: `${body} `,
        now: timestamp + 30,
      }),
    ).resolves.toMatchObject({ valid: false, reason: "signature mismatch" });
  });

  it("rejects stale timestamps before signature acceptance", async () => {
    const timestamp = 1_788_430_400;
    const signature = await signWebhook({ secret, timestamp, body });
    await expect(
      verifyWebhook({
        secret,
        timestamp: String(timestamp),
        signature,
        body,
        now: timestamp + 301,
      }),
    ).resolves.toEqual({ valid: false, reason: "stale timestamp" });
  });

  it("validates the versioned delivery envelope", () => {
    expect(
      webhookEnvelopeSchema.parse({
        schemaVersion: "1",
        deliveryId: "7c475c21-7f85-4c4c-9867-2f094884095d",
        attempt: 1,
        sentAt: "2026-09-03T12:00:00.000Z",
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
      }),
    ).toMatchObject({ event: { type: "wallet.claimable" } });
  });
});
