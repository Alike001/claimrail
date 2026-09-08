import { describe, expect, it } from "vitest";
import { parseSiweMessage } from "viem/siwe";
import { buildTelegramChallengeMessage, telegramSubscriptionRequestSchema } from "./telegram.js";

describe("Telegram notification contracts", () => {
  it("accepts an owner-bound event selection", () => {
    expect(
      telegramSubscriptionRequestSchema.parse({
        owner: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
        kind: "telegram",
        eventTypes: ["wallet.claimable", "claim.confirmed"],
      }),
    ).toMatchObject({ kind: "telegram" });
  });

  it("makes the non-financial permission boundary explicit", () => {
    const message = buildTelegramChallengeMessage({
      challengeId: "0d904bb5-4a5f-442d-a3fe-734646d50d58",
      owner: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
      chainId: 50_312,
      domain: "claimrail.example",
      uri: "https://claimrail.example/notifications",
      eventTypes: ["wallet.claimable"],
      nonce: "nonceabc123",
      issuedAt: new Date("2026-09-03T21:50:00.000Z"),
      expiresAt: new Date("2026-09-03T22:00:00.000Z"),
    });
    const parsed = parseSiweMessage(message);
    expect(parsed.domain).toBe("claimrail.example");
    expect(parsed.resources).toEqual([
      "urn:claimrail:permission:telegram-notifications",
      "urn:claimrail:event:wallet.claimable",
    ]);
    expect(message).toContain(
      "does not authorize transactions, token approvals, claims, or gas spending",
    );
  });
});
