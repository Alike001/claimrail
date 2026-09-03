import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { signWebhook, webhookEnvelopeSchema } from "@claimrail/contracts";
import { decryptSecret, type LeasedWebhookDelivery } from "@claimrail/db";

export interface WebhookDispatchResult {
  readonly providerMessageId: string;
  readonly httpStatus: number;
  readonly signatureVersion: string;
  readonly requestTimestamp: number;
}

export class WebhookDispatchError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly signatureVersion: "v1",
    readonly requestTimestamp: number,
  ) {
    super("WebhookHttpError");
    this.name = `WebhookHttp${httpStatus}`;
  }
}

export type DestinationGuard = (destination: string) => Promise<void>;

function isNonPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isNonPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isNonPublicIpv4(address);
  if (family !== 6) return true;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isNonPublicIpv4(normalized.slice(7));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

export async function guardPublicHttpsDestination(destination: string): Promise<void> {
  const url = new URL(destination);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("WebhookDestinationRejected");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("WebhookDestinationRejected");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isNonPublicIp(address))) {
    throw new Error("WebhookDestinationRejected");
  }
}

export function createWebhookTransport(input: {
  readonly encryptionKey: string;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
  readonly guardDestination?: DestinationGuard;
}) {
  const timeoutMs = input.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("webhook timeout must be a positive integer");
  }
  const fetcher = input.fetcher ?? fetch;
  const guardDestination = input.guardDestination ?? guardPublicHttpsDestination;
  return async (delivery: LeasedWebhookDelivery): Promise<WebhookDispatchResult> => {
    if (delivery.kind !== "webhook") throw new Error("WebhookKindMismatch");
    await guardDestination(delivery.destination);
    const secret = decryptSecret(delivery.secretCiphertext, input.encryptionKey);
    const sentAt = new Date();
    const envelope = webhookEnvelopeSchema.parse({
      schemaVersion: "1",
      deliveryId: delivery.id,
      attempt: delivery.attempt,
      sentAt: sentAt.toISOString(),
      event: delivery.event,
    });
    const body = JSON.stringify(envelope);
    const timestamp = Math.floor(sentAt.getTime() / 1_000);
    const signature = await signWebhook({ secret, timestamp, body });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(delivery.destination, {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          "user-agent": "ClaimRail-Webhook/1.0",
          "claimrail-delivery-id": delivery.id,
          "claimrail-timestamp": String(timestamp),
          "claimrail-signature": signature,
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new WebhookDispatchError(response.status, "v1", timestamp);
    }
    return {
      providerMessageId: response.headers.get("x-request-id") ?? `http:${response.status}`,
      httpStatus: response.status,
      signatureVersion: "v1",
      requestTimestamp: timestamp,
    };
  };
}
