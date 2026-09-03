"use client";

import type {
  BrowserConfigurationResponse,
  BrowserSubscriptionChallengeResponse,
  BrowserSubscriptionVerificationResponse,
} from "@claimrail/contracts";
import { useState, useSyncExternalStore } from "react";
import { useConnect, useConnection, useConnectors, useSignMessage } from "wagmi";

const BROWSER_EVENTS = [
  "wallet.claimable",
  "market.finalized",
  "market.voided",
  "claim.confirmed",
] as const;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const walletError = error as Error & { shortMessage?: string };
    return walletError.shortMessage ?? error.message;
  }
  return "Browser notifications could not be enabled.";
}

async function parseResponse<Value>(response: Response): Promise<Value> {
  const body = (await response.json()) as Value & {
    readonly error?: { readonly message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function subscribeCapabilities() {
  return () => undefined;
}

function browserPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function BrowserSubscriptionForm() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const signMessage = useSignMessage();
  const [status, setStatus] = useState<"idle" | "connecting" | "permission" | "signing" | "done">(
    "idle",
  );
  const [message, setMessage] = useState<string>();
  const [result, setResult] = useState<BrowserSubscriptionVerificationResponse>();

  const supported = useSyncExternalStore(subscribeCapabilities, browserPushSupported, () => false);

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
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setStatus("idle");
    }
  }

  async function enableBrowser() {
    if (connection.address === undefined || !supported) return;
    setStatus("permission");
    setMessage(undefined);
    try {
      const config = await parseResponse<BrowserConfigurationResponse>(
        await fetch("/api/v1/subscriptions/browser/config", { cache: "no-store" }),
      );
      if (!config.available || config.publicKey === null) {
        throw new Error("Browser delivery is not configured on this ClaimRail deployment.");
      }
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.register("/claimrail-sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey),
        }));
      const challenge = await parseResponse<BrowserSubscriptionChallengeResponse>(
        await fetch("/api/v1/subscriptions/browser/challenges", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            owner: connection.address,
            kind: "browser",
            subscription: subscription.toJSON(),
            eventTypes: BROWSER_EVENTS,
          }),
        }),
      );
      setStatus("signing");
      const signature = await signMessage.mutateAsync({ message: challenge.message });
      const activated = await parseResponse<BrowserSubscriptionVerificationResponse>(
        await fetch("/api/v1/subscriptions/browser/verify", {
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

  return (
    <article className="browser-channel">
      <span>02</span>
      <div>
        <h2>Browser</h2>
        <p>Claimable, finalized, voided, and confirmed alerts on this device.</p>
        {result ? (
          <p className="channel-success" role="status">
            ● active for {result.subscription.owner.slice(0, 8)}…
          </p>
        ) : null}
        {message ? (
          <p className="channel-error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
      {result ? (
        <b>active</b>
      ) : connection.address === undefined ? (
        <button type="button" onClick={connectWallet} disabled={status !== "idle"}>
          {status === "connecting" ? "connecting…" : "connect"}
        </button>
      ) : (
        <button type="button" onClick={enableBrowser} disabled={!supported || status !== "idle"}>
          {!supported
            ? "unsupported"
            : status === "permission"
              ? "permission…"
              : status === "signing"
                ? "signing…"
                : "enable"}
        </button>
      )}
    </article>
  );
}
