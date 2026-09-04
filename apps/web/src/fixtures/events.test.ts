import { verifyClaimRailWebhook } from "@claimrail/client";
import { describe, expect, it } from "vitest";
import { createEventPlaygroundSample, eventPlaygroundFixtures } from "./events.js";

describe("canonical event playground evidence", () => {
  it("creates a valid signed envelope around a normalized Shannon event", async () => {
    const now = 1_788_523_200;
    const sample = await createEventPlaygroundSample(1, now);
    await expect(
      verifyClaimRailWebhook({
        secret: sample.secret,
        rawBody: sample.rawBody,
        headers: {
          "claimrail-timestamp": sample.timestamp,
          "claimrail-signature": sample.signature,
        },
        now,
      }),
    ).resolves.toMatchObject({
      event: {
        id: eventPlaygroundFixtures[1]?.event.id,
        type: "wallet.claimable",
        blockNumber: "478582638",
      },
    });
  });

  it("refuses an unknown fixture index", async () => {
    await expect(createEventPlaygroundSample(99)).rejects.toThrow(
      "Unknown event playground sample",
    );
  });
});
