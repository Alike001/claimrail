import { describe, expect, it } from "vitest";
import { parseSiweMessage } from "viem/siwe";
import {
  browserPushSubscriptionSchema,
  buildBrowserSubscriptionChallengeMessage,
} from "./browser.js";

describe("browser notification contracts", () => {
  it("accepts a standards-shaped HTTPS push subscription", () => {
    expect(
      browserPushSubscriptionSchema.parse({
        endpoint: "https://push.example.test/subscriptions/abc",
        expirationTime: null,
        keys: { p256dh: "a".repeat(65), auth: "b".repeat(22) },
      }),
    ).toMatchObject({ expirationTime: null });
  });

  it("rejects insecure endpoints and makes the permission boundary explicit", () => {
    expect(() =>
      browserPushSubscriptionSchema.parse({
        endpoint: "http://push.example.test/abc",
        keys: { p256dh: "a".repeat(65), auth: "b".repeat(22) },
      }),
    ).toThrow();
    const message = buildBrowserSubscriptionChallengeMessage({
      challengeId: "0d904bb5-4a5f-442d-a3fe-734646d50d58",
      owner: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
      chainId: 50_312,
      domain: "claimrail.example",
      uri: "https://claimrail.example/notifications",
      endpointFingerprint: "ab".repeat(32),
      eventTypes: ["wallet.claimable"],
      nonce: "nonceabc123",
      issuedAt: new Date("2026-09-03T21:50:00.000Z"),
      expiresAt: new Date("2026-09-03T22:00:00.000Z"),
    });
    const parsed = parseSiweMessage(message);
    expect(parsed.domain).toBe("claimrail.example");
    expect(parsed.uri).toBe("https://claimrail.example/notifications");
    expect(parsed.resources).toContain(`urn:claimrail:browser-endpoint:${"ab".repeat(32)}`);
    expect(message).toContain(
      "does not authorize transactions, token approvals, claims, or gas spending",
    );
  });
});
