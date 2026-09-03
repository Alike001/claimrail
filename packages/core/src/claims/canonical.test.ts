import { describe, expect, it } from "vitest";
import { canonicalJson, integrityHash } from "./canonical.js";

describe("canonical hashing", () => {
  it("sorts object keys, preserves array order and serializes bigint as decimal", async () => {
    const left = { z: 2n, a: [3n, { y: true, x: "value" }], ignored: undefined };
    const right = { a: [3n, { x: "value", y: true }], z: 2n };
    expect(canonicalJson(left)).toBe('{"a":["3",{"x":"value","y":true}],"z":"2"}');
    expect(await integrityHash(left)).toBe(await integrityHash(right));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Symbol("no"), () => undefined])(
    "rejects unsupported value %s",
    (value) => {
      expect(() => canonicalJson(value)).toThrow(TypeError);
    },
  );
});
