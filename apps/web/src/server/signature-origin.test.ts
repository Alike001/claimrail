import { describe, expect, it } from "vitest";
import { signatureOrigin } from "./signature-origin";

describe("signature origin", () => {
  it("binds wallet authorization to the exact HTTPS host and product page", () => {
    expect(
      signatureOrigin(
        new Request("https://claimrail.example/api/v1/access/challenges"),
        "/developers/deliveries",
      ),
    ).toEqual({
      domain: "claimrail.example",
      uri: "https://claimrail.example/developers/deliveries",
    });
  });

  it("allows local development but rejects an insecure remote origin", () => {
    expect(
      signatureOrigin(
        new Request("http://localhost:3000/api/v1/subscriptions/browser/challenges"),
        "/notifications",
      ),
    ).toEqual({
      domain: "localhost:3000",
      uri: "http://localhost:3000/notifications",
    });
    expect(() =>
      signatureOrigin(
        new Request("http://claimrail.example/api/v1/subscriptions/browser/challenges"),
        "/notifications",
      ),
    ).toThrow("wallet authorization requires HTTPS");
  });
});
