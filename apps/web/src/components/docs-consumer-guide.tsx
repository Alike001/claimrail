import Link from "next/link";

export function DocsConsumerGuide() {
  return (
    <>
      <section className="docs-chapter" id="quick-tour">
        <header>
          <span>01 · ClaimRail in 3 minutes</span>
          <h2>The missing final step after a market closes.</h2>
          <p>
            DreamDEX runs the market. Somnia records what happened. ClaimRail turns that public
            information into a useful after-trade workflow.
          </p>
        </header>
        <dl className="docs-definition-list">
          <div>
            <dt>DreamDEX</dt>
            <dd>Where the Event Contract position is created and settled.</dd>
          </div>
          <div>
            <dt>Somnia</dt>
            <dd>The public network where ownership and settlement are verified.</dd>
          </div>
          <div>
            <dt>ClaimRail</dt>
            <dd>The interface that explains the position and prepares the next safe action.</dd>
          </div>
        </dl>
        <aside className="docs-note docs-note-positive">
          <strong>No account is required.</strong>
          <p>You can inspect any public wallet address without connecting a wallet or signing.</p>
        </aside>
      </section>

      <section className="docs-chapter" id="use-claimrail">
        <header>
          <span>02 · Use ClaimRail</span>
          <h2>From wallet address to clear next action.</h2>
        </header>
        <ol className="docs-steps">
          <li>
            <span>1</span>
            <div>
              <h3>Check a public wallet</h3>
              <p>Paste the address. ClaimRail scans its DreamDEX positions read-only.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>Understand what happened</h3>
              <p>See the position, result, evidence, amount, and current status together.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>Choose the next action</h3>
              <p>Wait, inspect proof, set an alert, or review funds ready to claim.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="docs-chapter" id="position-statuses">
        <header>
          <span>Position guide</span>
          <h2>Four statuses cover the full journey.</h2>
        </header>
        <div className="docs-status-list">
          <div>
            <i className="status-square success" />
            <strong>Ready</strong>
            <span>The result is verified and funds can be claimed.</span>
          </div>
          <div>
            <i className="status-square warning" />
            <strong>Waiting</strong>
            <span>The market ended, but its final result is still pending.</span>
          </div>
          <div>
            <i className="status-square loss" />
            <strong>Finished</strong>
            <span>The position settled but has no funds to return.</span>
          </div>
          <div>
            <i className="status-square neutral" />
            <strong>Refund ready</strong>
            <span>The market was cancelled and the position can be refunded.</span>
          </div>
        </div>
      </section>

      <section className="docs-chapter" id="manual-claim">
        <header>
          <span>Claim funds</span>
          <h2>Review first. Sign only when you are ready.</h2>
        </header>
        <div className="docs-note">
          <strong>Approval is broad. Redemption is exact.</strong>
          <p>
            A first claim may require permission for the DreamDEX module. ClaimRail explains that
            lasting permission, then rebuilds and simulates a fresh 90-second claim plan. Your
            wallet sends only the verified redemption action, and funds return directly to the
            owner.
          </p>
        </div>
      </section>

      <section className="docs-chapter" id="alerts-receipts">
        <header>
          <span>Stay informed</span>
          <h2>Alerts tell you when to return. Receipts show what happened.</h2>
          <p>
            Notification permission cannot trade or claim. After a claim, ClaimRail checks the
            transaction receipt and post-transaction balances before calling it confirmed.
          </p>
        </header>
        <div className="docs-inline-links">
          <Link href="/notifications">Set up alerts →</Link>
          <Link href="/#wallet-lookup">Open a wallet →</Link>
        </div>
      </section>

      <section className="docs-chapter" id="safety">
        <header>
          <span>Safety and control</span>
          <h2>ClaimRail explains and prepares. Your wallet decides.</h2>
        </header>
        <div className="docs-boundary-table" id="trust">
          <div>
            <span>Public lookup</span>
            <strong>No account, connection, or signature</strong>
          </div>
          <div>
            <span>Alerts</span>
            <strong>Owner proof; no authority to move money</strong>
          </div>
          <div>
            <span>Manual claim</span>
            <strong>Owner reviews and signs exact transactions</strong>
          </div>
          <div>
            <span>Custody</span>
            <strong>ClaimRail stores no wallet private key</strong>
          </div>
        </div>
      </section>
    </>
  );
}
