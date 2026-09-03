import type { ClaimReceiptResponse } from "@claimrail/contracts";
import { Header } from "@/src/components/header";
import { fixtureInbox } from "@/src/fixtures/inbox";
import { receiptFixture } from "@/src/fixtures/receipt";
import { readWalletClaimReceipts, readWalletInbox } from "@/src/server/claimrail";

export const dynamic = "force-dynamic";

function short(value: string, start = 9, end = 7) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function amount(raw: string | null) {
  if (raw === null) return "pending";
  const value = BigInt(raw);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${fraction} USDso`;
}

export default async function WalletHistoryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly address: string }>;
  readonly searchParams: Promise<{ readonly fixture?: string }>;
}) {
  const [{ address }, query] = await Promise.all([params, searchParams]);
  const fixture = query.fixture === "1" && process.env.NODE_ENV !== "production";
  let view = fixtureInbox;
  let receipts: readonly ClaimReceiptResponse[] = fixture ? [receiptFixture] : [];
  let persistedHistoryAvailable = fixture;
  if (!fixture) {
    const [inbox, persisted] = await Promise.all([
      readWalletInbox(address).catch(() => null),
      readWalletClaimReceipts(address).catch(() => ({ available: false, receipts: [] })),
    ]);
    if (inbox === null) {
      return (
        <div className="error-page">
          <h1>History inspection failed.</h1>
          <p>ClaimRail could not verify this wallet without touching its funds.</p>
          <a href="/">return to lookup</a>
        </div>
      );
    }
    view = inbox.view;
    receipts = persisted.receipts;
    persistedHistoryAvailable = persisted.available;
  }

  const terminalRows = view.rows.filter(
    ({ station }) => station !== "open" && station !== "locked" && station !== "won · waiting",
  );
  const delivered = receipts.reduce(
    (sum, receipt) => sum + BigInt(receipt.actualCollateral ?? "0"),
    0n,
  );

  return (
    <div className="history-shell">
      <Header address={view.address} active="history" />
      <main className="history-main">
        {fixture ? (
          <p className="receipt-fixture">development history fixture · demonstration only</p>
        ) : null}
        <header className="history-hero">
          <p className="eyebrow">claimrail / realized history</p>
          <h1>performance, without pretend math.</h1>
          <p>
            Outcomes and returned funds are verified. Profit and loss stays “incomplete” until the
            indexer supplies the wallet’s full cost basis—we do not turn missing trades into a fake
            number.
          </p>
        </header>

        <section className="history-metrics">
          <div>
            <span>terminal positions</span>
            <strong>{terminalRows.length}</strong>
          </div>
          <div>
            <span>durable claims</span>
            <strong>{receipts.length}</strong>
          </div>
          <div>
            <span>funds delivered</span>
            <strong>{amount(delivered.toString())}</strong>
          </div>
          <div>
            <span>PnL coverage</span>
            <strong className="warning-text">incomplete</strong>
          </div>
        </section>

        <section className="history-section">
          <div className="history-heading">
            <div>
              <p className="eyebrow">claim receipts</p>
              <h2>what actually returned.</h2>
            </div>
            <p>
              {persistedHistoryAvailable
                ? "database-backed · receipt reconciled"
                : "durable claim database unavailable"}
            </p>
          </div>
          <div className="history-table claims-history">
            <div className="history-table-head">
              <span>claim</span>
              <span>status</span>
              <span>delivered</span>
              <span>evidence</span>
            </div>
            {receipts.length === 0 ? (
              <p className="history-empty">No ClaimRail claim receipts for this wallet yet.</p>
            ) : (
              receipts.map((receipt) => (
                <a
                  className="history-row"
                  href={`/claims/${receipt.claimId}${fixture ? "?fixture=1" : ""}`}
                  key={receipt.claimId}
                >
                  <span>{short(receipt.planHash)}</span>
                  <b className={receipt.status}>{receipt.status}</b>
                  <strong>{amount(receipt.actualCollateral)}</strong>
                  <em>
                    {receipt.blockNumber ? `block ${receipt.blockNumber}` : "pending chain proof"} →
                  </em>
                </a>
              ))
            )}
          </div>
        </section>

        <section className="history-section">
          <div className="history-heading">
            <div>
              <p className="eyebrow">position outcomes</p>
              <h2>settled tickets.</h2>
            </div>
            <p>verified block {view.verifiedBlock}</p>
          </div>
          <div className="history-table position-history">
            <div className="history-table-head">
              <span>market</span>
              <span>position</span>
              <span>outcome</span>
              <span>returned</span>
              <span>PnL</span>
            </div>
            {terminalRows.map((row) => (
              <a
                className="history-row"
                href={`/markets/${row.marketId}${fixture ? "?fixture=1" : ""}`}
                key={row.identity}
              >
                <span>
                  {row.market}
                  <small>{row.window}</small>
                </span>
                <span>{row.position}</span>
                <b className={row.stationTone}>{row.station}</b>
                <strong>{row.returnValue}</strong>
                <em>incomplete</em>
              </a>
            ))}
          </div>
          <p className="history-note">
            Cost-basis completeness: unavailable for these indexed histories. Outcome, claim amount,
            transaction, and settlement evidence remain independently inspectable.
          </p>
        </section>
      </main>
      <footer className="status-footer history-footer">
        <span>
          {view.completeness} wallet scan · {new Date(view.observedAt).toLocaleString()}
        </span>
        <span>realized PnL is never estimated</span>
      </footer>
    </div>
  );
}
