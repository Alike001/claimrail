"use client";

import type {
  SubscriptionChallengeResponse,
  SubscriptionVerificationResponse,
} from "@claimrail/contracts";
import { useState } from "react";
import { useConnect, useConnection, useConnectors, useSignMessage } from "wagmi";

const EVENT_OPTIONS = [
  { value: "wallet.claimable", label: "Funds become claimable" },
  { value: "market.finalized", label: "Market is finalized" },
  { value: "market.voided", label: "Market is voided" },
  { value: "claim.confirmed", label: "Claim is confirmed" },
] as const;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const possible = error as Error & { shortMessage?: string };
    return possible.shortMessage ?? error.message;
  }
  return "The subscription could not be created.";
}

async function parseResponse<Value>(response: Response): Promise<Value> {
  const body = (await response.json()) as Value & {
    readonly error?: { readonly message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

export function WebhookSubscriptionForm() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const signMessage = useSignMessage();
  const [destination, setDestination] = useState("");
  const [events, setEvents] = useState<readonly string[]>(["wallet.claimable", "claim.confirmed"]);
  const [status, setStatus] = useState<"idle" | "connecting" | "challenging" | "signing" | "done">(
    "idle",
  );
  const [result, setResult] = useState<SubscriptionVerificationResponse>();
  const [message, setMessage] = useState<string>();

  async function connectWallet() {
    const connector = connectors[0];
    if (connector === undefined) {
      setMessage("No injected browser wallet was found.");
      return;
    }
    setStatus("connecting");
    setMessage(undefined);
    try {
      await connect.mutateAsync({ connector });
      setStatus("idle");
    } catch (error) {
      setMessage(errorMessage(error));
      setStatus("idle");
    }
  }

  function toggleEvent(value: string) {
    setEvents((current) =>
      current.includes(value) ? current.filter((event) => event !== value) : [...current, value],
    );
  }

  async function createSubscription() {
    if (connection.address === undefined) return;
    setMessage(undefined);
    setResult(undefined);
    setStatus("challenging");
    try {
      const challenge = await parseResponse<SubscriptionChallengeResponse>(
        await fetch("/api/v1/subscriptions/challenges", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            owner: connection.address,
            kind: "webhook",
            destination,
            eventTypes: events,
          }),
        }),
      );
      setStatus("signing");
      const signature = await signMessage.mutateAsync({ message: challenge.message });
      const activated = await parseResponse<SubscriptionVerificationResponse>(
        await fetch("/api/v1/subscriptions/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            message: challenge.message,
            signature,
          }),
        }),
      );
      setResult(activated);
      setStatus("done");
    } catch (error) {
      setMessage(errorMessage(error));
      setStatus("idle");
    }
  }

  if (result !== undefined) {
    return (
      <section className="webhook-complete" aria-live="polite">
        <p className="eyebrow">route active</p>
        <h2>Webhook verified.</h2>
        <p>
          ClaimRail will sign matching deliveries. Copy the secret now; only its encrypted form is
          retained by the service.
        </p>
        <label>
          signing secret
          <output>{result.webhookSecret}</output>
        </label>
        <dl>
          <dt>subscription</dt>
          <dd>{result.subscription.id}</dd>
          <dt>destination</dt>
          <dd>{result.subscription.destination}</dd>
          <dt>events</dt>
          <dd>{result.subscription.eventTypes.join(", ")}</dd>
        </dl>
        <button className="text-link" type="button" onClick={() => setResult(undefined)}>
          configure another route →
        </button>
      </section>
    );
  }

  return (
    <section className="webhook-form" aria-label="Create a signed webhook subscription">
      <div className="form-heading">
        <span>01</span>
        <div>
          <p className="eyebrow">machine delivery</p>
          <h2>Signed webhook</h2>
        </div>
        <b>available</b>
      </div>
      <p className="form-copy">
        Send the same canonical settlement event to your bot, game, backend, or AI agent. Wallet
        proof controls the route; it never authorizes a trade or claim.
      </p>
      <label className="field-label" htmlFor="webhook-url">
        HTTPS endpoint
      </label>
      <input
        id="webhook-url"
        className="rail-input"
        type="url"
        inputMode="url"
        placeholder="https://your-app.example/webhooks/claimrail"
        value={destination}
        onChange={(event) => setDestination(event.target.value)}
      />
      <fieldset>
        <legend>events on this route</legend>
        {EVENT_OPTIONS.map((option) => (
          <label key={option.value} className="event-choice">
            <input
              type="checkbox"
              checked={events.includes(option.value)}
              onChange={() => toggleEvent(option.value)}
            />
            <i aria-hidden="true" />
            <span>
              <code>{option.value}</code>
              <small>{option.label}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="ownership-strip">
        <span>owner proof</span>
        <strong>
          {connection.address
            ? `${connection.address.slice(0, 8)}…${connection.address.slice(-6)}`
            : "wallet not connected"}
        </strong>
        <em>message signature only · no gas</em>
      </div>
      {message ? <p className="form-error">{message}</p> : null}
      {connection.address === undefined ? (
        <button className="primary-action" type="button" onClick={connectWallet}>
          {status === "connecting" ? "connecting…" : "connect owner wallet"} <span>→</span>
        </button>
      ) : (
        <button
          className="primary-action"
          type="button"
          disabled={destination === "" || events.length === 0 || status !== "idle"}
          onClick={createSubscription}
        >
          {status === "challenging"
            ? "creating challenge…"
            : status === "signing"
              ? "check your wallet…"
              : "verify & activate"}{" "}
          <span>→</span>
        </button>
      )}
    </section>
  );
}
