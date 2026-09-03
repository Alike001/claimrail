import { describe, expect, it } from "vitest";
import { DREAMDEX_SDK_VERSION, SHANNON_DREAMDEX, getDreamDexDeployment } from "./deployments.js";

describe("DreamDEX deployments", () => {
  it("keys Shannon configuration by chain and pinned adapter version", () => {
    expect(getDreamDexDeployment(50312)).toBe(SHANNON_DREAMDEX);
    expect(SHANNON_DREAMDEX.key).toBe(`somnia-shannon:${DREAMDEX_SDK_VERSION}`);
    expect(SHANNON_DREAMDEX.addresses.binaryModule).toBe(
      "0x3ecC694Cef705358864a646142ac17A90E29e388",
    );
  });

  it("refuses an unverified deployment", () => {
    expect(() => getDreamDexDeployment(1)).toThrow("unsupported DreamDEX chain");
  });
});
