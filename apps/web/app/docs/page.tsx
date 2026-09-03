import Link from "next/link";
import { Header } from "@/src/components/header";

const endpoints = [
  ["GET", "/api/v1/wallets/:address/positions", "Complete normalized position scan"],
  ["GET", "/api/v1/wallets/:address/claimables", "Verified funds that can return now"],
  ["GET", "/api/v1/markets/:marketId/settlement", "Rule, oracle result, and chain proof"],
  ["POST", "/api/v1/claims/prepare", "Fresh approval gate or simulated claim plan"],
  ["POST", "/api/v1/claims/submissions", "Durably record a broadcast hash as pending"],
  ["GET", "/api/v1/claims/:claimId", "Receipt, payout, gas, and verification evidence"],
  ["GET", "/api/v1/wallets/:address/history", "Outcomes, claim receipts, and honest PnL coverage"],
] as const;

export default function DocumentationPage() {
  return (
    <div className="docs-shell">
      <Header active="docs" />
      <main className="docs-main">
        <header className="docs-intro">
          <p className="eyebrow">claimrail / documentation / v0.2</p>
          <h1>the missing settlement delivery layer.</h1>
          <p>
            DreamDEX creates and settles Event Contracts. ClaimRail watches what each wallet owns,
            reconciles indexer answers with Somnia contract state, explains the result, and prepares
            safe delivery of funds to the owner.
          </p>
          <div className="docs-actions">
            <Link className="primary-action" href="/">
              inspect a wallet <span>→</span>
            </Link>
            <a href="/api/v1/openapi.json">openapi 3.1 ↗</a>
          </div>
        </header>

        <section className="docs-rail" aria-label="ClaimRail architecture">
          {[
            ["01", "DreamDEX", "markets + settlement"],
            ["02", "ClaimRail core", "reconcile + plan"],
            ["03", "delivery", "UI + API + agents"],
            ["04", "owner wallet", "review + sign"],
          ].map(([number, title, detail]) => (
            <div key={number}>
              <i>{number}</i>
              <strong>{title}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </section>

        <section className="docs-section two-column">
          <div>
            <p className="eyebrow">in everyday language</p>
            <h2>Think of it as parcel tracking for finished trades.</h2>
          </div>
          <div className="prose">
            <p>
              DreamDEX is the market where you buy an “Up” or “Down” ticket. Somnia is the public
              ledger that records the market and its result. ClaimRail is the inbox that notices
              when the ticket becomes payable, shows the evidence, and prepares the collection
              instruction.
            </p>
            <p>
              Watching any public address is read-only. ClaimRail asks for a wallet signature only
              when the owner approves DreamDEX or redeems a specific fresh plan. It never receives
              the private key.
            </p>
          </div>
        </section>

        <section className="docs-section" id="api">
          <p className="eyebrow">developer API</p>
          <h2>One settlement truth for people, bots, games, and agents.</h2>
          <div className="endpoint-list">
            {endpoints.map(([method, path, detail]) => (
              <div key={path}>
                <b>{method}</b>
                <code>{path}</code>
                <span>{detail}</span>
              </div>
            ))}
          </div>
          <p className="docs-footnote">
            Financial values are lossless base-unit strings. Wallet scans disclose completeness,
            observation time, and verified block. Writes are never reported as confirmed until
            receipt and post-state reconciliation agree.
          </p>
        </section>

        <section className="docs-section permission-section" id="manual-claim">
          <div>
            <p className="eyebrow">manual claim / two signatures when new</p>
            <h2>Approval is broad. Redemption is exact.</h2>
          </div>
          <ol>
            <li>
              <b>Approve the DreamDEX binary module.</b>
              <span>
                <code>setOperator(module, true)</code> covers every token ID the owner holds inside
                the shared ERC-6909 outcome-token contract. It stays active until revoked.
              </span>
            </li>
            <li>
              <b>Rebuild and simulate.</b>
              <span>
                ClaimRail re-reads balances and settlement, removes losers and unsafe entries,
                simulates every final batch, then hashes and stores a 90-second plan.
              </span>
            </li>
            <li>
              <b>Redeem from the owner wallet.</b>
              <span>
                The browser sends only the plan’s exact <code>redeemMany</code> arrays. The protocol
                returns proceeds directly to the owner; ClaimRail records the hash as pending.
              </span>
            </li>
          </ol>
        </section>

        <section className="docs-section boundary-table" id="trust">
          <p className="eyebrow">trust boundary</p>
          <h2>What exists now, and what remains opt-in.</h2>
          <div>
            <span>universal monitoring</span>
            <strong>any public address · no signature</strong>
          </div>
          <div>
            <span>manual claim</span>
            <strong>owner connects and signs exact transactions</strong>
          </div>
          <div>
            <span>automatic claim</span>
            <strong>future · explicit narrow authorization only</strong>
          </div>
          <div>
            <span>custody</span>
            <strong>ClaimRail stores no wallet private key</strong>
          </div>
        </section>
      </main>
      <footer className="status-footer docs-footer">
        <span>Somnia Shannon · chain 50312 · DreamDEX SDK 0.29.0</span>
        <span>independent ClaimRail interface</span>
      </footer>
    </div>
  );
}
