import { claimIdSchema } from "@claimrail/contracts";
import { notFound } from "next/navigation";
import { Header } from "@/src/components/header";
import { receiptFixture } from "@/src/fixtures/receipt";
import { readClaimReceipt } from "@/src/server/claimrail";

export const dynamic = "force-dynamic";

function short(value: string, start = 10, end = 8) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function amount(value: string | null) {
  if (value === null) return "pending";
  const raw = BigInt(value);
  const whole = raw / 1_000_000n;
  const fraction = (raw % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${fraction} USDso`;
}

function proofCount(receipt: Record<string, unknown> | null) {
  if (receipt === null) return 0;
  const entries = receipt.entries;
  return Array.isArray(entries) ? entries.length : 0;
}

export default async function ClaimReceiptPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly claimId: string }>;
  readonly searchParams: Promise<{ readonly fixture?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  let claimId: string;
  try {
    claimId = decodeURIComponent(resolvedParams.claimId);
  } catch {
    notFound();
  }
  const parsed = claimIdSchema.safeParse(claimId);
  if (!parsed.success) notFound();
  const fixture = resolvedSearchParams.fixture === "1" && process.env.NODE_ENV !== "production";
  const claim = fixture ? receiptFixture : await readClaimReceipt(parsed.data);
  if (claim === null) notFound();
  const confirmed = claim.status === "confirmed";
  const failed = claim.status === "failed";

  return (
    <div className="receipt-shell">
      <Header address={claim.owner} active="history" />
      <main className="receipt-main">
        {fixture ? (
          <p className="receipt-fixture">captured DreamDEX protocol fixture · demonstration only</p>
        ) : null}
        <header className="receipt-hero">
          <div>
            <p className="eyebrow">claimrail / settlement receipt</p>
            <h1>
              {confirmed
                ? "funds delivered."
                : failed
                  ? "claim needs attention."
                  : "claim in transit."}
            </h1>
          </div>
          <div className={`receipt-stamp ${claim.status}`}>
            <span>{confirmed ? "✓" : failed ? "!" : "…"}</span>
            <b>{claim.status}</b>
            <small>{confirmed ? "independently verified" : "canonical check in progress"}</small>
          </div>
        </header>

        <section className="receipt-summary">
          <div>
            <span>expected</span>
            <strong>{amount(claim.expectedPayout)}</strong>
          </div>
          <div>
            <span>delivered</span>
            <strong>{amount(claim.actualCollateral)}</strong>
          </div>
          <div>
            <span>gas used</span>
            <strong>{claim.gasUsed ?? "pending"}</strong>
          </div>
          <div>
            <span>verified block</span>
            <strong>{claim.blockNumber ?? "pending"}</strong>
          </div>
        </section>

        <section className="receipt-grid">
          <div className="receipt-rail">
            <p className="eyebrow">delivery checkpoints</p>
            {[
              ["01", "owner broadcast", claim.submittedAt ? "recorded" : "waiting"],
              [
                "02",
                "Somnia receipt",
                claim.transactions.some((item) => item.blockNumber) ? "found" : "waiting",
              ],
              [
                "03",
                "DreamDEX Redeemed logs",
                claim.transactions.reduce((sum, item) => sum + proofCount(item.receipt), 0)
                  ? "matched"
                  : "waiting",
              ],
              [
                "04",
                "post-state reconciliation",
                confirmed ? "verified" : failed ? "conflict" : "waiting",
              ],
            ].map(([number, label, status]) => (
              <div
                className={
                  status === "verified" ||
                  status === "matched" ||
                  status === "found" ||
                  status === "recorded"
                    ? "complete"
                    : status === "conflict"
                      ? "conflict"
                      : ""
                }
                key={number}
              >
                <i>{number}</i>
                <strong>{label}</strong>
                <span>{status}</span>
              </div>
            ))}
          </div>

          <div className="receipt-proof">
            <p className="eyebrow">canonical record</p>
            <dl>
              <dt>claim ID</dt>
              <dd>{short(claim.claimId, 18, 10)}</dd>
              <dt>plan hash</dt>
              <dd>{short(claim.planHash)}</dd>
              <dt>owner / recipient</dt>
              <dd>{short(claim.owner)}</dd>
              <dt>network</dt>
              <dd>Somnia Shannon · {claim.chainId}</dd>
              <dt>submitted</dt>
              <dd>
                {claim.submittedAt ? new Date(claim.submittedAt).toLocaleString() : "not submitted"}
              </dd>
              <dt>confirmed</dt>
              <dd>
                {claim.confirmedAt ? new Date(claim.confirmedAt).toLocaleString() : "pending"}
              </dd>
            </dl>
            <a
              className="primary-action receipt-download"
              href={
                fixture
                  ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(claim, null, 2))}`
                  : `/api/v1/claims/${claim.claimId}?download=1`
              }
              download={`claimrail-${claim.planHash}.json`}
            >
              download receipt JSON <span>↓</span>
            </a>
          </div>
        </section>

        <section className="receipt-transactions">
          <p className="eyebrow">transaction batches</p>
          {claim.transactions.length === 0 ? (
            <p>No transaction has been submitted for this plan.</p>
          ) : (
            claim.transactions.map((transaction) => (
              <article key={transaction.transactionHash}>
                <div>
                  <span>batch {transaction.batchIndex + 1}</span>
                  <b className={transaction.status}>{transaction.status}</b>
                </div>
                <code>{transaction.transactionHash}</code>
                <div>
                  <span>nonce {transaction.nonce}</span>
                  <span>
                    {proofCount(transaction.receipt)} Redeemed proof
                    {proofCount(transaction.receipt) === 1 ? "" : "s"}
                  </span>
                  <span>
                    {transaction.actualCollateral === null
                      ? "payout pending"
                      : `${amount(transaction.actualCollateral)} delivered`}
                  </span>
                </div>
                <a
                  href={`https://shannon-explorer.somnia.network/tx/${transaction.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  inspect on Somnia ↗
                </a>
              </article>
            ))
          )}
        </section>
      </main>
      <footer className="status-footer receipt-footer">
        <span>receipt truth: Somnia receipt + DreamDEX events + post-state</span>
        <span>no ClaimRail custody</span>
      </footer>
    </div>
  );
}
