import type { EvidenceValue, MarketRecord, SettlementExplanationInput } from "@claimrail/core";
import Link from "next/link";
import { CopyButton } from "./copy-button";
import { Header } from "./header";

function evidenceValue<Value>(
  value: EvidenceValue<Value>,
  format: (value: Value) => string = String,
): string {
  if (value.status === "verified") return format(value.value);
  if (value.status === "conflicting") return "conflicting evidence";
  return value.reason;
}

function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function proofDisplay(label: string, value: string): string {
  return label === "observed time (UTC)" ? value : short(value);
}

function formatDecimal(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0");
  return `${whole.toLocaleString("en-US")}${decimals > 0 ? `.${fraction}` : ""}`;
}

export function EvidenceScreen({
  market,
  explanation,
  fixture = false,
}: {
  readonly market: MarketRecord;
  readonly explanation: SettlementExplanationInput;
  readonly fixture?: boolean;
}) {
  const wiring = market.wiring.status === "verified" ? market.wiring.value : undefined;
  const oracle =
    market.settlement.oracle.status === "verified" ? market.settlement.oracle.value : undefined;
  const winner =
    explanation.winningOutcome.status === "verified"
      ? explanation.winningOutcome.value === null
        ? "VOID"
        : explanation.winningOutcome.value === 0
          ? "UP"
          : "DOWN"
      : "pending";
  const vector =
    explanation.payoutVector.status === "verified"
      ? `[${explanation.payoutVector.value.numerators.join(", ")}] / ${explanation.payoutVector.value.denominator}`
      : evidenceValue(explanation.payoutVector);
  const verifiedBlock = market.evidence.verifiedBlock?.toLocaleString("en-US") ?? "unverified";
  const steps = [
    ["market rule", explanation.rule, "DreamDEX indexer"],
    [
      "opening value",
      evidenceValue(explanation.openingValue, (value) =>
        formatDecimal(value, explanation.valueDecimals),
      ),
      "oracle",
    ],
    [
      "closing value",
      evidenceValue(explanation.closingValue, (value) =>
        formatDecimal(value, explanation.valueDecimals),
      ),
      "oracle",
    ],
    ["result", `${winner} won`, "resolver module"],
    ["payout vector", vector, "payout module"],
    [
      "finalization",
      market.settlementFinalized ? "recorded on BinarySettlement" : "not finalized",
      "Somnia chain",
    ],
  ] as const;
  const proof = [
    ["market ID", market.identity.marketId],
    ["market module", market.identity.binaryModule],
    ["pool + nonce", wiring ? `${wiring.pool} · ${wiring.marketNonce}` : "not verified"],
    ["outcome token", wiring?.outcomeToken ?? "not verified"],
    ["oracle question ID", oracle?.questionId ?? "not indexed"],
    ["resolution tx", evidenceValue(explanation.resolutionTransaction)],
    ["finalization tx", evidenceValue(explanation.finalizationTransaction)],
    ["observed time (UTC)", new Date(market.evidence.observedAt).toISOString()],
    ["adapter version", "0.29.0"],
  ] as const;
  return (
    <div className="evidence-shell">
      <Header />
      <div className="evidence-context">
        <span>
          settlement inbox /{" "}
          <b>
            {market.display.asset}/{market.display.collateralSymbol}
          </b>{" "}
          / {market.display.interval}
        </span>
        <strong>
          {market.lifecycle} · {market.settlementFinalized ? "claimable" : "waiting"}
        </strong>
        <span>
          verified block <b>{verifiedBlock}</b>
        </span>
        <span className="protocol-text">
          DreamDEX · built on Somnia
          {fixture ? <em>fixture · no live funds</em> : null}
        </span>
      </div>
      <main className="evidence-main">
        <section className="evidence-ladder">
          <h1>verifiable evidence ladder</h1>
          {steps.map(([label, value, source], index) => (
            <div className="evidence-step" key={label}>
              <span className="step-number">{index + 1}</span>
              <div>
                <strong>{label}</strong>
                <p>{value}</p>
              </div>
              <div className="verified-label">
                <i className="status-square success" />
                <strong>verified</strong>
                <small>at block {verifiedBlock}</small>
              </div>
              <div className="step-source">
                <span>{source}</span>
                <small>
                  {label === "finalization" ? "BinarySettlement" : "canonical evidence"}
                </small>
              </div>
            </div>
          ))}
        </section>
        <aside className="proof-list">
          <h2>evidence proof</h2>
          {proof.map(([label, value]) => (
            <div className="proof-row" key={label}>
              <span>{label}</span>
              <code title={String(value)}>{proofDisplay(label, String(value))}</code>
              <CopyButton value={String(value)} />
            </div>
          ))}
        </aside>
        <section className="conclusion">
          <span>✓</span>
          <p>
            {winner === "DOWN"
              ? "The closing price was lower than the opening price."
              : winner === "UP"
                ? "The closing price met or exceeded the opening price."
                : "The market settlement is recorded."}{" "}
            The finalized payout vector is the on-chain source of truth.
          </p>
        </section>
      </main>
      <footer className="status-footer">
        <Link href={fixture ? `/wallet/${fixtureAddress}?fixture=1` : "/"}>back to inbox</Link>
        <span>independent ClaimRail interface · on-chain state verified</span>
      </footer>
    </div>
  );
}

const fixtureAddress = "0x71f4a8b62d77c91402ce1a10bc65c9dff17892ac";
