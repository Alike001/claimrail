import { signWebhook } from "@claimrail/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  ClaimRailApiError,
  ClaimRailClient,
  verifyClaimRailWebhook,
  type ClaimRailFetch,
} from "./index.js";

const owner = "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477";
const marketId = `0x${"12".repeat(32)}`;

describe("ClaimRail client", () => {
  it("validates a lossless claimables response", async () => {
    const request = vi.fn<ClaimRailFetch>(async () =>
      Response.json({
        schemaVersion: "1",
        address: owner,
        completeness: "complete",
        observedAt: "2026-09-04T08:00:00.000Z",
        verifiedBlock: "478725909",
        total: { raw: "1494000000", decimals: 6, symbol: "USDso", display: "1,494.00 USDso" },
        positions: [{ marketId, expectedPayout: "1494000000" }],
      }),
    );
    const client = new ClaimRailClient({
      baseUrl: "https://claimrail.example/claimrail/",
      fetch: request,
    });
    await expect(client.listClaimables(owner)).resolves.toMatchObject({
      total: { raw: "1494000000" },
    });
    expect(String(request.mock.calls[0]?.[0])).toBe(
      `https://claimrail.example/claimrail/api/v1/wallets/${owner}/claimables`,
    );
  });

  it("owns the two-step subscription flow but delegates signing", async () => {
    const challengeId = "0d904bb5-4a5f-442d-a3fe-734646d50d58";
    const request = vi
      .fn<ClaimRailFetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            schemaVersion: "1",
            challengeId,
            owner,
            message: "ClaimRail notification subscription\n\npermission only",
            expiresAt: "2026-09-04T08:10:00.000Z",
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            schemaVersion: "1",
            subscription: {
              id: "c742d9c7-b1af-4e14-b90f-bf58355318ad",
              owner,
              kind: "webhook",
              destination: "https://bot.example/webhooks/claimrail",
              eventTypes: ["wallet.claimable", "claim.confirmed"],
              active: true,
              verifiedAt: "2026-09-04T08:01:00.000Z",
            },
            webhookSecret: "a".repeat(43),
            secretNotice: "Store this secret now. ClaimRail will not display it again.",
          },
          { status: 201 },
        ),
      );
    const signMessage = vi.fn(async () => `0x${"ab".repeat(65)}`);
    const client = new ClaimRailClient({ baseUrl: "https://claimrail.example", fetch: request });
    const subscription = await client.subscribeToWallet({
      owner,
      destination: "https://bot.example/webhooks/claimrail",
      eventTypes: ["wallet.claimable", "claim.confirmed"],
      signMessage,
    });
    expect(subscription.subscription.kind).toBe("webhook");
    expect(signMessage).toHaveBeenCalledWith(
      "ClaimRail notification subscription\n\npermission only",
    );
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({ challengeId });
  });

  it("surfaces versioned API errors without trusting arbitrary bodies", async () => {
    const client = new ClaimRailClient({
      baseUrl: "https://claimrail.example",
      fetch: vi.fn(async () =>
        Response.json(
          { schemaVersion: "1", error: { code: "upstream_unavailable", message: "try later" } },
          { status: 503 },
        ),
      ),
    });
    await expect(client.explainSettlement(marketId)).rejects.toEqual(
      expect.objectContaining<Partial<ClaimRailApiError>>({
        name: "ClaimRailApiError",
        status: 503,
        code: "upstream_unavailable",
      }),
    );
  });
});

describe("framework-neutral webhook verification", () => {
  it("verifies exact raw bytes before parsing the envelope", async () => {
    const secret = "s".repeat(32);
    const timestamp = 1_788_523_200;
    const rawBody = JSON.stringify({
      schemaVersion: "1",
      deliveryId: "0d904bb5-4a5f-442d-a3fe-734646d50d58",
      attempt: 1,
      sentAt: "2026-09-04T08:00:00.000Z",
      event: {
        id: "event-1",
        schemaVersion: "1",
        type: "wallet.claimable",
        aggregateType: "position",
        aggregateId: "position-1",
        occurredAt: "2026-09-04T08:00:00.000Z",
        payload: { wallet: owner },
        sourceTransactionHash: null,
        sourceLogIndex: null,
        blockNumber: "478725909",
      },
    });
    const signature = await signWebhook({ secret, timestamp, body: rawBody });
    await expect(
      verifyClaimRailWebhook({
        secret,
        rawBody,
        headers: { "ClaimRail-Timestamp": String(timestamp), "ClaimRail-Signature": signature },
        now: timestamp,
      }),
    ).resolves.toMatchObject({ event: { type: "wallet.claimable" } });
  });

  it("rejects a correctly signed body that is not a valid envelope", async () => {
    const secret = "s".repeat(32);
    const timestamp = 1_788_523_200;
    const rawBody = "not-json";
    const signature = await signWebhook({ secret, timestamp, body: rawBody });
    await expect(
      verifyClaimRailWebhook({
        secret,
        rawBody,
        headers: { "ClaimRail-Timestamp": String(timestamp), "ClaimRail-Signature": signature },
        now: timestamp,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ClaimRailApiError>>({
        status: 400,
        code: "invalid_webhook_payload",
      }),
    );
  });
});
