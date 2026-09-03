import { describe, expect, it } from "vitest";
import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asChainId,
  asIntegrityHash,
  asMarketId,
  asTimestampMs,
  asTokenId,
  asTransactionHash,
  asVenueId,
} from "./types.js";

const BYTES_32 = `0x${"a".repeat(64)}`;

describe("canonical identifiers", () => {
  it("normalizes valid EVM and bytes32 identifiers", () => {
    expect(asAddress("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(asMarketId(BYTES_32.toUpperCase().replace("0X", "0x"))).toBe(BYTES_32);
    expect(asVenueId(BYTES_32)).toBe(BYTES_32);
    expect(asTransactionHash(BYTES_32)).toBe(BYTES_32);
    expect(asIntegrityHash(BYTES_32)).toBe(BYTES_32);
  });

  it.each([
    ["address", () => asAddress("0x1234")],
    ["market", () => asMarketId("0x1234")],
    ["venue", () => asVenueId("not-hex")],
    ["transaction", () => asTransactionHash("0x1234")],
    ["integrity", () => asIntegrityHash("0x1234")],
  ])("rejects an invalid %s identifier", (_label, run) => {
    expect(run).toThrow(TypeError);
  });

  it("brands unsigned integer values without losing precision", () => {
    expect(asTokenId("900719925474099312345")).toBe("900719925474099312345");
    expect(asBlockNumber("478582638")).toBe(478_582_638n);
    expect(asBaseUnit(2_970_000_000n)).toBe(2_970_000_000n);
  });

  it.each(["-1", "01", "1.2", "abc"])("rejects invalid unsigned integer %s", (value) => {
    expect(() => asTokenId(value)).toThrow();
  });

  it("rejects negative bigint values", () => {
    expect(() => asBaseUnit(-1n)).toThrow(RangeError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid chain id %s", (value) => {
    expect(() => asChainId(value)).toThrow(RangeError);
  });

  it("accepts valid chain and timestamp values", () => {
    expect(asChainId(50_312)).toBe(50_312);
    expect(asTimestampMs(0)).toBe(0);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid timestamp %s", (value) => {
    expect(() => asTimestampMs(value)).toThrow(RangeError);
  });
});
