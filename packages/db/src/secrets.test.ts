import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateWebhookSecret, hashSecret } from "./secrets.js";

describe("stored secrets", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips an authenticated encrypted webhook secret", () => {
    const secret = generateWebhookSecret();
    const encrypted = encryptSecret(secret, key);
    expect(secret).toHaveLength(43);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted, key)).toBe(secret);
    expect(hashSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects tampered ciphertext and incorrectly sized keys", () => {
    const encrypted = encryptSecret("a".repeat(32), key);
    const [version, iv, tag, ciphertext] = encrypted.split(".") as [string, string, string, string];
    const tamperedCiphertext = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;
    expect(() => decryptSecret([version, iv, tag, tamperedCiphertext].join("."), key)).toThrow();
    expect(() => encryptSecret("a".repeat(32), "dG9vLXNob3J0")).toThrow("exactly 32 bytes");
  });
});
