"use client";

import { verifyClaimRailWebhook } from "@claimrail/client";
import { useMemo, useState } from "react";
import {
  createEventPlaygroundSample,
  eventPlaygroundFixtures,
  type EventPlaygroundSample,
} from "@/src/fixtures/events";
import { Header } from "./header";

type Verification =
  | { readonly state: "idle"; readonly message: string }
  | { readonly state: "valid"; readonly message: string }
  | { readonly state: "invalid"; readonly message: string };

function short(value: string, head = 10, tail = 8) {
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function EventPlayground({
  initialSample,
}: {
  readonly initialSample: EventPlaygroundSample;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [secret, setSecret] = useState(initialSample.secret);
  const [timestamp, setTimestamp] = useState(initialSample.timestamp);
  const [signature, setSignature] = useState(initialSample.signature);
  const [rawBody, setRawBody] = useState(initialSample.rawBody);
  const [verification, setVerification] = useState<Verification>({
    state: "idle",
    message: "Signed sample ready. Verification has not run yet.",
  });
  const selected = eventPlaygroundFixtures[selectedIndex]!;

  async function loadSample(index: number) {
    const sample = await createEventPlaygroundSample(index);
    setSelectedIndex(index);
    setSecret(sample.secret);
    setTimestamp(sample.timestamp);
    setSignature(sample.signature);
    setRawBody(sample.rawBody);
    setVerification({
      state: "idle",
      message: "Signed sample ready. Verification has not run yet.",
    });
  }

  const envelopeFacts = useMemo<readonly (readonly [string, string])[]>(
    () => [
      ["schema", selected.event.schemaVersion],
      ["aggregate", selected.event.aggregateType],
      ["block", selected.event.blockNumber ?? "observation only"],
      ["transaction", selected.event.sourceTransactionHash ?? "no source transaction"],
    ],
    [selected],
  );

  async function verify() {
    try {
      const envelope = await verifyClaimRailWebhook({
        secret,
        rawBody,
        headers: {
          "claimrail-timestamp": timestamp,
          "claimrail-signature": signature,
        },
      });
      setVerification({
        state: "valid",
        message: `Signature valid · ${envelope.event.type} · event schema ${envelope.event.schemaVersion}`,
      });
    } catch (error) {
      setVerification({
        state: "invalid",
        message: error instanceof Error ? error.message : "Webhook verification failed.",
      });
    }
  }

  function tamper() {
    setRawBody((body) => `${body} `);
    setVerification({
      state: "invalid",
      message: "One byte changed. Run verification to see the signature fail.",
    });
  }

  return (
    <div className="event-playground-shell">
      <Header active="developers" />
      <main className="event-playground-main">
        <section className="event-head">
          <div>
            <p className="eyebrow">developer tools / canonical events</p>
            <h1>Canonical Event Playground</h1>
            <p>Inspect one event truth, then verify the exact signed delivery bytes.</p>
            <a href="/developers/deliveries">← delivery operations</a>
          </div>
          <dl>
            <div>
              <dt>samples</dt>
              <dd>{eventPlaygroundFixtures.length}</dd>
            </div>
            <div>
              <dt>event schema</dt>
              <dd>v1</dd>
            </div>
            <div>
              <dt>signature</dt>
              <dd>HMAC-SHA256</dd>
            </div>
          </dl>
        </section>

        <p className="event-fixture-banner">
          replaying normalized events derived from verified Shannon testnet evidence · not a live
          ClaimRail delivery
        </p>

        <section className="event-workbench">
          <aside className="event-list" aria-label="Canonical event samples">
            <div className="event-list-head">
              <span>event stream</span>
              <b>{eventPlaygroundFixtures.length} samples</b>
            </div>
            {eventPlaygroundFixtures.map((fixture, index) => (
              <button
                className={selectedIndex === index ? "active" : undefined}
                key={fixture.event.id}
                type="button"
                onClick={() => void loadSample(index)}
              >
                <i aria-hidden="true" />
                <span>
                  <strong>{fixture.event.type}</strong>
                  <small>{fixture.label}</small>
                </span>
                <em>{fixture.event.blockNumber}</em>
              </button>
            ))}
          </aside>

          <div className="event-inspector">
            <section className="event-explanation">
              <p className="panel-kicker">plain-language handoff</p>
              <h2>{selected.event.type}</h2>
              <p>{selected.happened}</p>
              <div>
                <span>consumer action</span>
                <strong>{selected.consumerAction}</strong>
              </div>
              <dl>
                {envelopeFacts.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd title={value}>{value.length > 38 ? short(value) : value}</dd>
                  </div>
                ))}
              </dl>
              <small>source · {selected.evidence}</small>
            </section>

            <section className="event-body-panel">
              <p className="panel-kicker">exact raw request body</p>
              <textarea
                aria-label="Raw webhook body"
                spellCheck={false}
                value={rawBody}
                onChange={(event) => {
                  setRawBody(event.target.value);
                  setVerification({ state: "idle", message: "Body changed. Verify it again." });
                }}
              />
              <div className="event-body-actions">
                <button type="button" onClick={tamper}>
                  alter one byte
                </button>
                <button type="button" onClick={() => void loadSample(selectedIndex)}>
                  restore signed sample
                </button>
              </div>
            </section>

            <section className="signature-lab">
              <p className="panel-kicker">receiver verification lab</p>
              <label>
                timestamp
                <input
                  value={timestamp}
                  onChange={(event) => {
                    setTimestamp(event.target.value);
                    setVerification({ state: "idle", message: "Timestamp changed. Verify again." });
                  }}
                />
              </label>
              <label>
                signature
                <textarea
                  value={signature}
                  onChange={(event) => {
                    setSignature(event.target.value);
                    setVerification({ state: "idle", message: "Signature changed. Verify again." });
                  }}
                />
              </label>
              <label>
                demo secret
                <input
                  value={secret}
                  onChange={(event) => {
                    setSecret(event.target.value);
                    setVerification({ state: "idle", message: "Secret changed. Verify again." });
                  }}
                />
              </label>
              <button className="verify-event-button" type="button" onClick={() => void verify()}>
                verify exact body →
              </button>
              <p className={`verification-result ${verification.state}`} role="status">
                <i aria-hidden="true" /> {verification.message}
              </p>
              <small>
                The demo secret is intentionally public. Production secrets are returned once and
                must stay in a secret manager.
              </small>
            </section>
          </div>
        </section>
      </main>
      <footer className="status-footer docs-footer">
        <span>ClaimRail / event playground</span>
        <span>exact bytes · versioned schema · no financial authority</span>
      </footer>
    </div>
  );
}
