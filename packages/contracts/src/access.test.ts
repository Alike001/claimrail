import { describe, expect, it } from "vitest";
import {
  accessVerificationResponseSchema,
  buildDeliveryConsoleChallengeMessage,
} from "./access.js";

describe("developer console access contracts", () => {
  it("makes the limited, non-financial purpose explicit", () => {
    const message = buildDeliveryConsoleChallengeMessage({
      challengeId: "0d904bb5-4a5f-442d-a3fe-734646d50d58",
      owner: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
      chainId: 50_312,
      nonce: "nonce_abc",
      expiresAt: new Date("2026-09-03T18:00:00.000Z"),
    });
    expect(message).toContain("inspect, test, and replay its notification deliveries");
    expect(message).toContain(
      "does not authorize trades, claims, token approvals, or gas spending",
    );
  });

  it("accepts only the three narrow delivery scopes", () => {
    expect(
      accessVerificationResponseSchema.parse({
        schemaVersion: "1",
        owner: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
        accessToken: "a".repeat(43),
        scopes: ["deliveries:read", "deliveries:replay", "notifications:test"],
        expiresAt: "2026-09-03T18:00:00.000Z",
      }).scopes,
    ).toHaveLength(3);
  });
});
