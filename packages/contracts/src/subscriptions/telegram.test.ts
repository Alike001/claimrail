import { describe, expect, it } from "vitest";
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
      eventTypes: ["wallet.claimable"],
      nonce: "nonce",
      expiresAt: new Date("2026-09-03T22:00:00.000Z"),
    });
    expect(message).toContain("ClaimRail Telegram notifications");
    expect(message).toContain(
      "does not authorize trades, claims, token approvals, or gas spending",
    );
  });
});
