import { describe, expect, it } from "vitest";
import {
  claimRailPublicSchemas,
  createClaimRailJsonSchemaBundle,
  createClaimRailOpenApiDocument,
} from "./openapi.js";

describe("generated public API contracts", () => {
  it("publishes every registered runtime schema in both artifacts", () => {
    const openapi = createClaimRailOpenApiDocument();
    const bundle = createClaimRailJsonSchemaBundle();
    expect(Object.keys(openapi.components.schemas).sort()).toEqual(
      Object.keys(claimRailPublicSchemas).sort(),
    );
    expect(Object.keys(bundle.schemas).sort()).toEqual(Object.keys(claimRailPublicSchemas).sort());
    expect(bundle.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("keeps the settlement, history, claim, and delivery operations discoverable", () => {
    const paths = createClaimRailOpenApiDocument().paths;
    expect(paths).toHaveProperty("/api/v1/wallets/{address}/claimables.get");
    expect(paths).toHaveProperty("/api/v1/wallets/{address}/history.get");
    expect(paths).toHaveProperty("/api/v1/claims/prepare.post");
    expect(paths).toHaveProperty("/api/v1/subscriptions/challenges.post");
    expect(paths).toHaveProperty("/api/v1/deliveries/{deliveryId}/replay.post");
  });
});
