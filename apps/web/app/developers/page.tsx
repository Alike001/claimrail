import Link from "next/link";
import { Header } from "@/src/components/header";

export default function DeveloperHomePage() {
  return (
    <div className="developer-shell">
      <Header active="developer-home" variant="developer" />
      <main className="developer-main" id="main-content">
        <section className="developer-hero">
          <div className="developer-hero-copy">
            <p className="eyebrow">ClaimRail for developers</p>
            <h1>One reliable settlement feed, ready for your product.</h1>
            <p>
              Add clear DreamDEX position updates to an app, bot, dashboard, game, or agent—without
              rebuilding the settlement logic yourself.
            </p>
            <div className="developer-actions">
              <Link className="primary-action" href="/docs#client">
                View quick start <span>→</span>
              </Link>
              <a href="/api/v1/openapi.json">OpenAPI 3.1 ↗</a>
            </div>
          </div>

          <aside className="developer-event-preview" aria-label="Example ClaimRail event">
            <div className="event-preview-topline">
              <span>Settlement event</span>
              <b>
                <i aria-hidden="true" /> signature verified
              </b>
            </div>
            <code>wallet.position.ready</code>
            <h2>A position can now be claimed.</h2>
            <p>Your product receives one stable event with the result, amount, and evidence.</p>
            <dl>
              <div>
                <dt>market</dt>
                <dd>ETH / USDso</dd>
              </div>
              <div>
                <dt>result</dt>
                <dd>Down · confirmed</dd>
              </div>
              <div>
                <dt>claimable</dt>
                <dd>2,970.00 USDso</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="developer-trust-strip" aria-label="Developer integration principles">
          <p>
            <span>Consistent</span> One versioned record across the web app and integrations.
          </p>
          <p>
            <span>Safe</span> Notifications can report an action, never move funds.
          </p>
          <p>
            <span>Recoverable</span> Every delivery has an ID, attempt history, and replay path.
          </p>
        </section>

        <section className="developer-tools" aria-labelledby="developer-tools-title">
          <div className="developer-section-heading">
            <div>
              <p className="eyebrow">Build with ClaimRail</p>
              <h2 id="developer-tools-title">Start with the data. Test the handoff.</h2>
            </div>
            <p>
              Read the shape of a settlement once, then use the testing and delivery tools when your
              integration is ready.
            </p>
          </div>

          <div className="developer-tool-layout">
            <article className="developer-api-card">
              <div>
                <span>01 · Start here</span>
                <h3>One API for the full position journey.</h3>
                <p>
                  Query wallet positions, settlement evidence, claim plans, receipts, and delivery
                  status through the same documented interface.
                </p>
                <Link href="/docs#api">Browse the API →</Link>
              </div>
              <pre aria-label="Example ClaimRail API response">
                <code>{`{
  "event": "wallet.position.ready",
  "status": "verified",
  "claimable": "2970.00",
  "currency": "USDso"
}`}</code>
              </pre>
            </article>

            <div className="developer-tool-stack">
              <article>
                <span>02 · Try it safely</span>
                <h3>Event tester</h3>
                <p>Change a signed sample payload and see verification pass or fail locally.</p>
                <Link href="/developers/events">Test an event →</Link>
              </article>
              <article>
                <span>03 · Operate routes</span>
                <h3>Delivery console</h3>
                <p>Inspect attempts, send route tests, and replay failed deliveries.</p>
                <Link href="/developers/deliveries">Open deliveries →</Link>
              </article>
            </div>
          </div>
        </section>

        <section className="developer-flow" aria-labelledby="developer-flow-title">
          <div>
            <p className="eyebrow">The handoff</p>
            <h2 id="developer-flow-title">From market result to useful action.</h2>
          </div>
          <ol>
            <li>
              <span>DreamDEX + Somnia</span>
              <strong>A market changes on-chain</strong>
            </li>
            <li>
              <span>ClaimRail</span>
              <strong>The change is checked and normalized</strong>
            </li>
            <li>
              <span>Your product</span>
              <strong>A person or agent receives one clear event</strong>
            </li>
          </ol>
        </section>
      </main>
      <footer className="status-footer docs-footer">
        <span>ClaimRail / developer home</span>
        <span>versioned schemas · signed delivery · no financial authority</span>
      </footer>
    </div>
  );
}
