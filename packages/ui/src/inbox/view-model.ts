import type { MarketRecord, PositionScan, WalletPosition } from "@claimrail/core";

export type InboxFilter = "all" | "attention" | "claimable";

export interface InboxRowViewModel {
  readonly identity: string;
  readonly marketId: string;
  readonly market: string;
  readonly position: string;
  readonly window: string;
  readonly station: string;
  readonly stationTone: "signal" | "warning" | "neutral" | "loss" | "success";
  readonly reason: string;
  readonly returnValue: string;
  readonly returnTone: "success" | "loss" | "neutral";
  readonly action: "view proof" | "watch";
  readonly filter: readonly InboxFilter[];
}

export interface InboxViewModel {
  readonly address: string;
  readonly claimable: string;
  readonly claimableRaw: string;
  readonly collateralDecimals: number;
  readonly collateralSymbol: string;
  readonly verifiedBlock: string;
  readonly completeness: "complete" | "partial" | "failed";
  readonly observedAt: string;
  readonly rows: readonly InboxRowViewModel[];
  readonly counts: {
    readonly open: number;
    readonly locked: number;
    readonly resolved: number;
    readonly ready: number;
  };
  readonly failures: readonly string[];
  readonly fixture: boolean;
}

function formatAmount(raw: bigint, decimals: number, symbol: string): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0").slice(0, 2).padEnd(2, "0");
  return `${whole.toLocaleString("en-US")}.${fraction} ${symbol}`;
}

function formatOracleValue(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0");
  return `${whole.toLocaleString("en-US")}${decimals > 0 ? `.${fraction}` : ""}`;
}

function station(
  position: WalletPosition,
): Pick<InboxRowViewModel, "station" | "stationTone" | "filter"> {
  switch (position.state) {
    case "open":
      return { station: "open", stationTone: "signal", filter: ["all"] };
    case "locked":
    case "winning_unfinalized":
      return {
        station: position.state === "locked" ? "locked" : "won · waiting",
        stationTone: "warning",
        filter: ["all", "attention"],
      };
    case "claimable":
    case "void_refundable":
      return {
        station: position.state === "claimable" ? "ready" : "void · refundable",
        stationTone: "success",
        filter: ["all", "attention", "claimable"],
      };
    case "losing":
      return { station: "resolved", stationTone: "loss", filter: ["all"] };
    case "claim_submitted":
      return { station: "claim submitted", stationTone: "warning", filter: ["all", "attention"] };
    case "redeemed":
      return { station: "redeemed", stationTone: "neutral", filter: ["all"] };
    case "payout_owed":
      return {
        station: "payout owed",
        stationTone: "warning",
        filter: ["all", "attention", "claimable"],
      };
  }
}

function reason(market: MarketRecord, position: WalletPosition): string {
  if (position.state === "locked") return "awaiting oracle";
  if (position.state === "void_refundable")
    return market.settlement.oracle.status === "verified"
      ? (market.settlement.oracle.value.voidReason ?? "market voided · refund")
      : "market voided · refund";
  const oracle = market.settlement.oracle;
  if (
    oracle.status === "verified" &&
    oracle.value.openingValue !== undefined &&
    oracle.value.closingValue !== undefined
  ) {
    const operator = oracle.value.closingValue >= oracle.value.openingValue ? ">=" : "<";
    const decimals = oracle.value.valueDecimals ?? 0;
    return `${formatOracleValue(oracle.value.closingValue, decimals)} ${operator} open ${formatOracleValue(oracle.value.openingValue, decimals)}`;
  }
  return market.settlementFinalized
    ? `oracle result · ${position.side.toUpperCase()}`
    : "result not finalized";
}

export function buildInboxViewModel(input: {
  readonly address: string;
  readonly scan: PositionScan<WalletPosition>;
  readonly markets: readonly MarketRecord[];
  readonly fixture?: boolean;
}): InboxViewModel {
  const marketById = new Map(input.markets.map((market) => [market.identity.marketId, market]));
  let claimableRaw = 0n;
  const counts = { open: 0, locked: 0, resolved: 0, ready: 0 };
  const rows = input.scan.positions.flatMap((position): InboxRowViewModel[] => {
    const market = marketById.get(position.marketId);
    if (market === undefined) return [];
    const current = station(position);
    if (position.state === "open") counts.open += 1;
    else if (position.state === "locked" || position.state === "winning_unfinalized")
      counts.locked += 1;
    else if (current.filter.includes("claimable")) {
      counts.ready += 1;
      claimableRaw += position.expectedPayout;
    } else counts.resolved += 1;
    const decimals = market.display.collateralDecimals;
    return [
      {
        identity: position.identity,
        marketId: position.marketId,
        market: `${market.display.asset}/${market.display.collateralSymbol}`,
        position: `${position.side.toUpperCase()} · ${formatAmount(position.verifiedBalance, decimals, "").trim()}`,
        window: market.display.interval,
        ...current,
        reason: reason(market, position),
        returnValue:
          position.expectedPayout === 0n
            ? "—"
            : formatAmount(position.expectedPayout, decimals, market.display.collateralSymbol),
        returnTone:
          position.expectedPayout > 0n
            ? "success"
            : position.state === "losing"
              ? "loss"
              : "neutral",
        action: market.settlementFinalized ? "view proof" : "watch",
      },
    ];
  });
  const firstMarket = input.markets[0];
  return {
    address: input.address,
    claimable: formatAmount(
      claimableRaw,
      firstMarket?.display.collateralDecimals ?? 6,
      firstMarket?.display.collateralSymbol ?? "USDso",
    ),
    claimableRaw: claimableRaw.toString(),
    collateralDecimals: firstMarket?.display.collateralDecimals ?? 6,
    collateralSymbol: firstMarket?.display.collateralSymbol ?? "USDso",
    verifiedBlock: input.scan.evidence.verifiedBlock?.toString() ?? "unverified",
    completeness: input.scan.completeness,
    observedAt: new Date(input.scan.completedAt).toISOString(),
    rows,
    counts,
    failures: input.scan.failures.map(({ reason }) => reason),
    fixture: input.fixture ?? false,
  };
}
