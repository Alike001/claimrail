import { describe, expect, it } from "vitest";
import {
  buildSubscriptionChallengeMessage,
  subscriptionVerificationRequestSchema,
  webhookSubscriptionRequestSchema,
} from "./challenge.js";

const OWNER = "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477";

describe("subscription contracts", () => {
  it("accepts an HTTPS webhook with unique canonical events", () => {
    expect(
      webhookSubscriptionRequestSchema.parse({
        owner: OWNER,
        kind: "webhook",
        destination: "https://agent.example.test/claimrail",
        eventTypes: ["wallet.claimable", "claim.confirmed"],
      }),
    ).toMatchObject({ kind: "webhook" });
  });

  it("rejects insecure destinations and duplicate events", () => {
    expect(
      webhookSubscriptionRequestSchema.safeParse({
        owner: OWNER,
        kind: "webhook",
        destination: "http://agent.example.test/claimrail",
        eventTypes: ["wallet.claimable"],
      }).success,
    ).toBe(false);
    expect(
      webhookSubscriptionRequestSchema.safeParse({
        owner: OWNER,
        kind: "webhook",
        destination: "https://agent.example.test/claimrail",
        eventTypes: ["wallet.claimable", "wallet.claimable"],
      }).success,
    ).toBe(false);
  });

  it("builds a stable, explicit and non-financial signing message", () => {
    const message = buildSubscriptionChallengeMessage({
      challengeId: "0d904bb5-4a5f-442d-a3fe-734646d50d58",
      owner: OWNER,
      chainId: 50_312,
      destination: "https://agent.example.test/claimrail",
      eventTypes: ["wallet.claimable", "market.finalized"],
      nonce: "nonce_abc",
      expiresAt: new Date("2026-09-03T18:00:00.000Z"),
    });
    expect(message).toContain(
      "does not authorize trades, claims, token approvals, or gas spending",
    );
    expect(message).toContain("Events: market.finalized, wallet.claimable");
    expect(message).toContain(`Wallet: ${OWNER}`);
  });

  it("accepts variable-length hex signatures for smart accounts", () => {
    expect(
      subscriptionVerificationRequestSchema.parse({
        challengeId: "0d904bb5-4a5f-442d-a3fe-734646d50d58",
        message: "challenge",
        signature: `0x${"ab".repeat(96)}`,
      }).signature,
    ).toHaveLength(194);
  });
});
