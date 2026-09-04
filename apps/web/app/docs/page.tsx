import Link from "next/link";
import { Header } from "@/src/components/header";

const endpoints = [
  ["GET", "/api/v1/openapi.json", "OpenAPI 3.1 discovery generated from runtime schemas"],
  ["GET", "/api/v1/schemas.json", "Draft 2020-12 public JSON Schema bundle"],
  ["GET", "/api/v1/wallets/:address/positions", "Complete normalized position scan"],
  ["GET", "/api/v1/wallets/:address/claimables", "Verified funds that can return now"],
  ["GET", "/api/v1/markets/:marketId/settlement", "Rule, oracle result, and chain proof"],
  ["POST", "/api/v1/claims/prepare", "Fresh approval gate or simulated claim plan"],
  ["POST", "/api/v1/claims/submissions", "Durably record a broadcast hash as pending"],
  ["GET", "/api/v1/claims/:claimId", "Receipt, payout, gas, and verification evidence"],
  ["GET", "/api/v1/wallets/:address/history", "Outcomes, claim receipts, and honest PnL coverage"],
  ["POST", "/api/v1/subscriptions/challenges", "Create an owner-bound webhook challenge"],
  ["POST", "/api/v1/subscriptions/verify", "Verify the signature and activate delivery"],
  ["GET", "/api/v1/subscriptions/browser/config", "Discover browser-push availability"],
  ["POST", "/api/v1/subscriptions/browser/challenges", "Bind this browser to an owner proof"],
  ["POST", "/api/v1/subscriptions/browser/verify", "Activate encrypted browser delivery"],
  ["POST", "/api/v1/subscriptions/telegram/challenges", "Prove the Telegram route owner"],
  ["POST", "/api/v1/subscriptions/telegram/verify", "Create a one-time private-chat link"],
  ["POST", "/api/v1/subscriptions/telegram/webhook", "Consume authenticated bot updates"],
  ["POST", "/api/v1/access/challenges", "Request owner proof for delivery operations"],
  ["POST", "/api/v1/access/verify", "Receive 15-minute owner-scoped access"],
  ["GET", "/api/v1/deliveries", "List the owner's delivery ledger"],
  ["GET", "/api/v1/deliveries/:deliveryId", "Inspect attempts and canonical payload"],
  ["POST", "/api/v1/deliveries/:deliveryId/replay", "Requeue an owned dead letter"],
] as const;

export default function DocumentationPage() {
  return (
    <div className="docs-shell">
      <Header active="docs" />
      <main className="docs-main">
        <header className="docs-intro">
          <p className="eyebrow">claimrail / documentation / v0.5</p>
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

        <section className="docs-section" id="client">
          <p className="eyebrow">typed client / validated at runtime</p>
          <h2>Four useful operations, without handing over a key.</h2>
          <div className="docs-code-grid">
            <div className="docs-code-card">
              <span>human, dashboard, or agent</span>
              <pre>
                <code>{`const rail = new ClaimRailClient({ baseUrl });

await rail.listClaimables(address);
await rail.explainSettlement(marketId);
await rail.buildRedemptionPlan(address);
await rail.subscribeToWallet({
  owner: address,
  destination,
  eventTypes,
  signMessage,
});`}</code>
              </pre>
            </div>
            <div className="docs-code-card">
              <span>receiver boundary</span>
              <pre>
                <code>{`const envelope = await verifyClaimRailWebhook({
  secret,
  headers,
  rawBody,
});

// Signature verified before JSON is trusted.
await consume(envelope.event);`}</code>
              </pre>
            </div>
          </div>
          <p className="docs-footnote">
            The workspace package is <code>@claimrail/client</code>. The generated OpenAPI and JSON
            Schema files are checked in CI against the same Zod contracts used by the live routes.
            Start with the framework-neutral webhook consumer in{" "}
            <code>examples/webhook-consumer</code>.
          </p>
        </section>

        <section className="docs-section two-column" id="bot-kit">
          <div>
            <p className="eyebrow">DreamDEX Bot Kit handoff</p>
            <h2>Let the strategy trade. Let ClaimRail watch settlement.</h2>
          </div>
          <div className="prose">
            <p>
              The Bot Kit can already find finalized markets and claim with its trading key.
              ClaimRail adds a neutral pause-and-resume rail: pause a market when it locks, request
              an owner-approved claim when funds become claimable, and resume only after an
              independently reconciled <code>claim.confirmed</code> event.
            </p>
            <p>
              The example adapter starts with <code>AUTO_CLAIM=false</code>. It never imports a Bot
              Kit private module or receives the trading key, and failed or superseded claims stay
              paused for operator attention.
            </p>
            <p>
              See <code>examples/bot-kit-adapter</code> for the complete event state machine and its
              duplicate-delivery tests.
            </p>
          </div>
        </section>

        <section className="docs-section two-column" id="webhooks">
          <div>
            <p className="eyebrow">signed delivery</p>
            <h2>Permission to notify is separate from permission to move money.</h2>
          </div>
          <div className="prose">
            <p>
              A webhook owner signs a readable, ten-minute challenge containing the wallet,
              destination, selected event types, chain, expiry, and nonce. The signature proves who
              configured the route; it cannot approve DreamDEX, trade, or redeem.
            </p>
            <p>
              Deliveries use a separate 32-byte HMAC secret over <code>timestamp.body</code>. The
              endpoint receives a versioned signature, rejects stale timestamps, and compares the
              signature before trusting the payload. ClaimRail encrypts the delivery secret at rest
              and shows it only when the route is activated.
            </p>
            <p>
              The <Link href="/developers/deliveries">delivery console</Link> requires a separate
              non-financial wallet proof. It exchanges that proof for a 15-minute in-memory token,
              reveals only the owner&apos;s routes, and permits replay only after a delivery reaches
              the dead-letter state.
            </p>
            <p>
              Browser alerts use the standards-based Push API and a service worker. Permission is
              requested only after a button click. The endpoint and browser encryption keys are
              encrypted at rest, while the signed challenge pins their SHA-256 fingerprint to the
              wallet and chosen canonical event types.
            </p>
            <p>
              Telegram linking is also owner-signed. After verification, ClaimRail issues a
              ten-minute bot link and stores only its hash. Telegram returns the private chat ID to
              an authenticated webhook; ClaimRail encrypts it before delivery and never exposes it
              in the console.
            </p>
          </div>
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
