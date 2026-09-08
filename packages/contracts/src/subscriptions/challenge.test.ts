import { describe, expect, it } from "vitest";
import { parseSiweMessage } from "viem/siwe";
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
      domain: "claimrail.example",
      uri: "https://claimrail.example/notifications",
      destination: "https://agent.example.test/claimrail",
      eventTypes: ["wallet.claimable", "market.finalized"],
      nonce: "nonceabc123",
      issuedAt: new Date("2026-09-03T17:50:00.000Z"),
      expiresAt: new Date("2026-09-03T18:00:00.000Z"),
    });
    const parsed = parseSiweMessage(message);
    expect(message).toContain(
      "does not authorize transactions, token approvals, claims, or gas spending",
    );
    expect(parsed).toMatchObject({
      domain: "claimrail.example",
      uri: "https://claimrail.example/notifications",
      chainId: 50_312,
      nonce: "nonceabc123",
      requestId: "0d904bb5-4a5f-442d-a3fe-734646d50d58",
    });
    expect(parsed.resources).toEqual([
      "urn:claimrail:permission:webhook-notifications",
      "https://agent.example.test/claimrail",
      "urn:claimrail:event:market.finalized",
      "urn:claimrail:event:wallet.claimable",
    ]);
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
