"use client";

import type {
  TelegramLinkResponse,
  TelegramSubscriptionChallengeResponse,
} from "@claimrail/contracts";
import { useState } from "react";
import { useConnect, useConnection, useConnectors, useSignMessage } from "wagmi";

const TELEGRAM_EVENTS = [
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
  return "Telegram linking could not be started.";
}

async function parseResponse<Value>(response: Response): Promise<Value> {
  const body = (await response.json()) as Value & {
    readonly error?: { readonly message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

export function TelegramSubscriptionForm() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const signMessage = useSignMessage();
  const [status, setStatus] = useState<"idle" | "connecting" | "signing">("idle");
  const [message, setMessage] = useState<string>();
  const [link, setLink] = useState<TelegramLinkResponse>();

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

  async function createLink() {
    if (connection.address === undefined) return;
    setStatus("signing");
    setMessage(undefined);
    try {
      const challenge = await parseResponse<TelegramSubscriptionChallengeResponse>(
        await fetch("/api/v1/subscriptions/telegram/challenges", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            owner: connection.address,
            kind: "telegram",
            eventTypes: TELEGRAM_EVENTS,
          }),
        }),
      );
      const signature = await signMessage.mutateAsync({ message: challenge.message });
      const result = await parseResponse<TelegramLinkResponse>(
        await fetch("/api/v1/subscriptions/telegram/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            message: challenge.message,
            signature,
          }),
        }),
      );
      setLink(result);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setStatus("idle");
    }
  }

  return (
    <article className="telegram-channel">
      <span>03</span>
      <div>
        <h2>Telegram</h2>
        <p>Link one private chat with a one-time token after proving wallet ownership.</p>
        {link ? (
          <a className="channel-link" href={link.deepLink} target="_blank" rel="noreferrer">
            Open Telegram to finish →
          </a>
        ) : null}
        {message ? (
          <p className="channel-error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
      {link ? (
        <b>link ready</b>
      ) : connection.address === undefined ? (
        <button type="button" onClick={connectWallet} disabled={status !== "idle"}>
          {status === "connecting" ? "connecting…" : "connect"}
        </button>
      ) : (
        <button type="button" onClick={createLink} disabled={status !== "idle"}>
          {status === "signing" ? "signing…" : "create link"}
        </button>
      )}
    </article>
  );
}
