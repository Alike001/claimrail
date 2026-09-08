import { describe, expect, it } from "vitest";
import { parseSiweMessage } from "viem/siwe";
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
      domain: "claimrail.example",
      uri: "https://claimrail.example/developers/deliveries",
      nonce: "nonceabc123",
      issuedAt: new Date("2026-09-03T17:50:00.000Z"),
      expiresAt: new Date("2026-09-03T18:00:00.000Z"),
    });
    const parsed = parseSiweMessage(message);
    expect(message).toContain("Inspect, test, and replay this wallet's ClaimRail deliveries");
    expect(message).toContain(
      "does not authorize transactions, token approvals, claims, or gas spending",
    );
    expect(parsed).toMatchObject({
      domain: "claimrail.example",
      uri: "https://claimrail.example/developers/deliveries",
      chainId: 50_312,
      nonce: "nonceabc123",
    });
    expect(parsed.resources).toEqual([
      "urn:claimrail:permission:deliveries-read",
      "urn:claimrail:permission:deliveries-replay",
      "urn:claimrail:permission:notifications-test",
    ]);
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
