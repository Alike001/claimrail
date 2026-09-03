import { Header } from "@/src/components/header";
import { WebhookSubscriptionForm } from "@/src/components/webhook-subscription-form";

export default function NotificationsPage() {
  return (
    <div className="notifications-shell">
      <Header active="notifications" />
      <main className="notifications-main">
        <section className="notifications-intro">
          <p className="eyebrow">settlement delivery control</p>
          <h1>
            Don’t watch the market.
            <br />
            <span>Let the rail find you.</span>
          </h1>
          <p>
            Route verified DreamDEX lifecycle events to the places where humans and software already
            work. Public wallets can be observed by anyone; private delivery routes require a wallet
            signature.
          </p>
          <div className="delivery-rail" aria-label="ClaimRail delivery path">
            <b>on-chain state</b>
            <i />
            <b>canonical event</b>
            <i />
            <strong>your endpoint</strong>
          </div>
        </section>
        <div className="notifications-grid">
          <WebhookSubscriptionForm />
          <aside className="channel-stack" aria-label="Notification channel roadmap">
            <article>
              <span>02</span>
              <div>
                <h2>Browser</h2>
                <p>Claimable alerts on this device with per-wallet preferences.</p>
              </div>
              <b>next adapter</b>
            </article>
            <article>
              <span>03</span>
              <div>
                <h2>Telegram</h2>
                <p>One-time private chat linking, protected by the same ownership proof.</p>
              </div>
              <b>next adapter</b>
            </article>
            <section className="signature-note">
              <p className="eyebrow">what you sign</p>
              <h3>Permission to notify. Nothing financial.</h3>
              <p>
                The message pins your wallet, destination, selected events, expiry, and one-time
                nonce. It cannot move funds, approve tokens, or redeem a position.
              </p>
            </section>
          </aside>
        </div>
      </main>
      <footer className="status-footer docs-footer">
        <span>claimrail / notification routes</span>
        <span>Somnia Shannon · chain 50312</span>
      </footer>
    </div>
  );
}
