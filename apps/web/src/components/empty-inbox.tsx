import Link from "next/link";
import { Header } from "./header";
import { WalletSearch } from "./wallet-search";

const exampleWallet = "0x71f4a8b62d77c91402ce1a10bc65c9dff17892ac";

export function EmptyInbox() {
  return (
    <div className="landing-page">
      <Header variant="marketing" />
      <main id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="hero-copy">
            <p className="hero-kicker">
              <span aria-hidden="true" /> The settlement home for DreamDEX positions
            </p>
            <h1 id="landing-title">
              Know what settled. <em>Claim what’s yours.</em>
            </h1>
            <p className="hero-lead">
              Enter a wallet to see every finished position, understand the result, and collect
              available funds—without handing control to ClaimRail.
            </p>
            <div className="hero-lookup" id="wallet-lookup">
              <WalletSearch variant="landing" />
              <p className="lookup-note">
                No sign-up. Looking up a wallet is public and read-only.
              </p>
            </div>
            <ul className="hero-assurances" aria-label="ClaimRail safety summary">
              <li>
                <span>01</span> We never ask for your private key
              </li>
              <li>
                <span>02</span> You approve every transaction
              </li>
              <li>
                <span>03</span> Funds go straight to your wallet
              </li>
            </ul>
          </div>

          <aside className="position-preview" aria-label="Example ClaimRail position">
            <div className="preview-topline">
              <span>Example position</span>
              <span className="sample-label">sample data</span>
            </div>
            <div className="preview-market">
              <span className="market-icon" aria-hidden="true">
                Ξ
              </span>
              <div>
                <small>ETH price · 15 minute market</small>
                <strong>You chose “Down”</strong>
              </div>
            </div>
            <div className="preview-result">
              <p>Result confirmed</p>
              <h2>Funds are ready</h2>
              <span>ETH finished below its opening price, so this position can be claimed.</span>
            </div>
            <div className="preview-payout">
              <span>Expected back</span>
              <strong>
                2,970.00 <small>USDso</small>
              </strong>
            </div>
            <ol className="preview-progress" aria-label="Position progress">
              <li className="complete">
                <i /> Trade ended
              </li>
              <li className="complete">
                <i /> Result checked
              </li>
              <li className="ready">
                <i /> Ready to claim
              </li>
            </ol>
            <Link href={`/wallet/${exampleWallet}?fixture=1`}>
              See a complete example <span>→</span>
            </Link>
          </aside>
        </section>

        <div className="ecosystem-note">
          <p>Independent settlement companion for</p>
          <strong>DreamDEX</strong>
          <span>on</span>
          <strong>Somnia</strong>
          <p>Built from public on-chain information</p>
        </div>

        <section className="product-story" id="why-claimrail" aria-labelledby="story-title">
          <div className="story-heading">
            <p className="section-label">After the trade</p>
            <h2 id="story-title">A market can finish before your journey does.</h2>
            <p>
              DreamDEX records the result on Somnia, but you still need to find the position, check
              whether it pays, and collect the funds. ClaimRail turns that loose end into one clear
              workflow.
            </p>
          </div>
          <div className="story-flow" aria-label="What happens after a market closes">
            <article>
              <span>01</span>
              <div>
                <small>DreamDEX</small>
                <strong>The market closes</strong>
              </div>
              <i aria-hidden="true">→</i>
            </article>
            <article>
              <span>02</span>
              <div>
                <small>Somnia</small>
                <strong>The result is recorded</strong>
              </div>
              <i aria-hidden="true">→</i>
            </article>
            <article className="story-flow-ready">
              <span>03</span>
              <div>
                <small>Your wallet</small>
                <strong>The funds wait for you</strong>
              </div>
              <b>ClaimRail picks up here</b>
            </article>
          </div>
        </section>

        <section className="how-it-works" id="how-it-works" aria-labelledby="how-title">
          <div className="section-heading">
            <div>
              <p className="section-label">How ClaimRail works</p>
              <h2 id="how-title">One place to check, understand, and claim.</h2>
            </div>
            <p>
              Start with a public address. Connect the owner wallet only when there is an action to
              approve.
            </p>
          </div>
          <ol className="steps-list">
            <li>
              <span>1</span>
              <div>
                <small>Find</small>
                <h3>See every position together</h3>
                <p>Paste a public wallet address. ClaimRail checks old and current markets.</p>
              </div>
              <b>Read-only</b>
            </li>
            <li>
              <span>2</span>
              <div>
                <small>Understand</small>
                <h3>Know what happened</h3>
                <p>See what won, what lost, what is waiting, and the evidence behind it.</p>
              </div>
              <b>Checked on Somnia</b>
            </li>
            <li>
              <span>3</span>
              <div>
                <small>Collect</small>
                <h3>Claim only what is ready</h3>
                <p>Review the amount and exact action before approving it in your wallet.</p>
              </div>
              <b>You stay in control</b>
            </li>
          </ol>
        </section>

        <section className="product-showcase" aria-labelledby="showcase-title">
          <div className="section-heading">
            <div>
              <p className="section-label">The product</p>
              <h2 id="showcase-title">Your complete after-trade view.</h2>
            </div>
            <p>Every screen answers one question and leads to one useful next step.</p>
          </div>
          <div className="showcase-layout">
            <div className="showcase-window" aria-label="ClaimRail product preview">
              <div className="showcase-bar">
                <span>claimrail / positions</span>
                <span>sample wallet</span>
              </div>
              <div className="showcase-total">
                <small>Ready to claim</small>
                <strong>3,670.00 USDso</strong>
                <span>2 positions checked on Somnia</span>
              </div>
              <div className="showcase-position">
                <div>
                  <b>ETH / USDso</b>
                  <small>Down · result confirmed</small>
                </div>
                <strong>2,970.00</strong>
                <span>Ready</span>
              </div>
              <div className="showcase-position">
                <div>
                  <b>BTC / USDso</b>
                  <small>Up · result confirmed</small>
                </div>
                <strong>700.00</strong>
                <span>Ready</span>
              </div>
              <Link href={`/wallet/${exampleWallet}?fixture=1`}>
                Open the sample workspace <span>→</span>
              </Link>
            </div>
            <div className="capability-list">
              <article>
                <span>01</span>
                <div>
                  <h3>Positions</h3>
                  <p>Separate funds that are ready from trades that still need time.</p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <h3>Evidence</h3>
                  <p>Read the opening price, closing price, result, and on-chain proof together.</p>
                </div>
              </article>
              <article>
                <span>03</span>
                <div>
                  <h3>Alerts</h3>
                  <p>Know when a result or payout changes without repeatedly checking.</p>
                </div>
              </article>
              <article>
                <span>04</span>
                <div>
                  <h3>Receipts</h3>
                  <p>Keep a clear record of what your wallet approved and received.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="safety-section" id="safety" aria-labelledby="safety-title">
          <div className="safety-card">
            <div className="safety-copy">
              <p className="section-label">Built around your control</p>
              <h2 id="safety-title">ClaimRail guides the action. Your wallet controls it.</h2>
              <p>
                Looking is always read-only. When funds are ready, you see the amount and action
                before your wallet asks for approval.
              </p>
              <Link href="/docs">
                Read how claims stay safe <span>→</span>
              </Link>
            </div>
            <div className="funds-path" aria-label="How funds move">
              <div>
                <small>Funds start here</small>
                <strong>DreamDEX contract</strong>
              </div>
              <span className="path-arrow" aria-hidden="true">
                →
              </span>
              <div className="wallet-destination">
                <small>Funds arrive here</small>
                <strong>Your wallet</strong>
              </div>
              <p>
                <i aria-hidden="true" /> ClaimRail never holds the money or your private key.
              </p>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <p className="section-label">Start with a public address</p>
          <h2>Finish the trade you already started.</h2>
          <p>No account, no private key, and no wallet connection needed to look.</p>
          <a href="#wallet-lookup">
            Check a wallet <span>↑</span>
          </a>
        </section>
      </main>
      <footer className="landing-footer">
        <div>
          <span className="footer-brand">claimrail</span>
          <p>A clearer way to finish DreamDEX prediction-market positions.</p>
        </div>
        <nav aria-label="Footer">
          <Link href="/docs">How it works</Link>
          <Link href="/notifications">Alerts</Link>
          <Link href="/developers">For developers</Link>
          <Link href="/api/v1/openapi.json">Open API</Link>
        </nav>
        <p>Independent ClaimRail interface · Somnia testnet</p>
      </footer>
    </div>
  );
}
