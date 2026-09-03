import { decodeEventLog } from "viem";
import { describe, expect, it } from "vitest";
import finalizedJson from "../../../../fixtures/dreamdex/live/shannon-50312/finalized-market.json" with { type: "json" };
import {
  DEPLOYED_MARKET_FINALIZED_TOPIC,
  EXPECTED_SHANNON_MARKET_FINALIZED_TOPIC,
  deployedBinarySettlementEventsAbi,
} from "./abi.js";

interface CapturedLog {
  readonly topics: readonly [`0x${string}`, ...`0x${string}`[]];
  readonly data: `0x${string}`;
}

describe("deployed BinarySettlement ABI", () => {
  it("pins the Shannon payout-vector topic instead of the stale SDK event", () => {
    expect(DEPLOYED_MARKET_FINALIZED_TOPIC).toBe(EXPECTED_SHANNON_MARKET_FINALIZED_TOPIC);
  });

  it("decodes the captured finalization payout vector", () => {
    const market = Object.values(finalizedJson).find(
      (value) => value.events.settlement.MarketFinalized.value.length > 0,
    );
    if (market === undefined) throw new Error("captured finalized market missing");
    const log = market.events.settlement.MarketFinalized.value[0] as unknown as CapturedLog;
    const decoded = decodeEventLog({
      abi: deployedBinarySettlementEventsAbi,
      topics: [...log.topics],
      data: log.data,
    });
    expect(decoded.eventName).toBe("MarketFinalized");
    expect(decoded.args.payoutNumerators).toEqual([10_000_000n, 0n]);
    expect(decoded.args.nonce).toBe(490n);
  });
});
