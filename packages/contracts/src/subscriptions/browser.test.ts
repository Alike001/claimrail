import { describe, expect, it } from "vitest";
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
      endpointFingerprint: "ab".repeat(32),
      eventTypes: ["wallet.claimable"],
      nonce: "nonce",
      expiresAt: new Date("2026-09-03T22:00:00.000Z"),
    });
    expect(message).toContain(`Endpoint fingerprint: ${"ab".repeat(32)}`);
    expect(message).toContain(
      "does not authorize trades, claims, token approvals, or gas spending",
    );
  });
});
