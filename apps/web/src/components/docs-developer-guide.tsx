import Link from "next/link";
import { documentationEndpoints } from "@/src/content/docs";

export function DocsDeveloperGuide() {
  return (
    <>
      <section className="docs-chapter docs-developer-chapter" id="client">
        <header>
          <span>03 · Build with ClaimRail</span>
          <h2>Start with one read-only request.</h2>
          <p>
            The API, typed client, schemas, and sample events are public. Wallet proof is needed
            only for owner-controlled delivery routes or financial actions.
          </p>
        </header>
        <div className="docs-code-block">
          <div>
            <span>TypeScript quick start</span>
            <code>@claimrail/client</code>
          </div>
          <pre>
            <code>{`const rail = new ClaimRailClient({ baseUrl });

const positions = await rail.listClaimables(address);
const evidence = await rail.explainSettlement(marketId);
const plan = await rail.buildRedemptionPlan(address);`}</code>
          </pre>
        </div>
        <div className="docs-inline-links">
          <Link href="/developers">Open developer hub →</Link>
          <Link href="/developers/events">Test a signed event →</Link>
          <Link href="/developers/deliveries">Inspect deliveries →</Link>
        </div>
      </section>

      <section className="docs-chapter" id="api">
        <header>
          <span>API reference</span>
          <h2>Versioned routes with runtime-validated responses.</h2>
        </header>
        <div className="endpoint-list">
          {documentationEndpoints.map(([method, path, detail]) => (
            <div key={path}>
              <b>{method}</b>
              <code>{path}</code>
              <span>{detail}</span>
            </div>
          ))}
        </div>
        <p className="docs-footnote">
          Financial values use lossless base-unit strings. Scans disclose completeness, observation
          time, and verified block. Browse the{" "}
          <a href="/api/v1/openapi.json">OpenAPI 3.1 document</a> or{" "}
          <a href="/api/v1/schemas.json">JSON Schema bundle</a>.
        </p>
      </section>

      <section className="docs-chapter" id="webhooks">
        <header>
          <span>Events and webhooks</span>
          <h2>Signed delivery without financial authority.</h2>
          <p>
            ClaimRail signs the exact raw event body. Receivers verify the HMAC and timestamp before
            parsing JSON. Stable event IDs, bounded retries, attempt history, and dead-letter replay
            make failures inspectable.
          </p>
        </header>
      </section>

      <section className="docs-chapter" id="bot-kit">
        <header>
          <span>DreamDEX Bot Kit</span>
          <h2>Let the strategy trade. Let ClaimRail watch settlement.</h2>
          <p>
            The example adapter starts with <code>AUTO_CLAIM=false</code>, pauses activity when a
            market locks, requests owner approval when funds are ready, and resumes only after an
            independently verified <code>claim.confirmed</code> event.
          </p>
        </header>
      </section>
    </>
  );
}
