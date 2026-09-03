import type { CanonicalDeliveryEvent } from "@claimrail/contracts";
import { decryptSecret, type LeasedWebhookDelivery } from "@claimrail/db";
import type { WebhookDispatchResult } from "./webhook-transport.js";

export class TelegramDispatchError extends Error {
  readonly signatureVersion = "bot-api";
  readonly requestTimestamp = Math.floor(Date.now() / 1_000);

  constructor(readonly httpStatus: number) {
    super("TelegramDispatchError");
    this.name = httpStatus === 403 ? "TelegramDestinationRevoked" : `TelegramHttp${httpStatus}`;
  }
}

function eventCopy(event: CanonicalDeliveryEvent): string {
  const copy: Record<CanonicalDeliveryEvent["type"], string> = {
    "market.locked": "DreamDEX market locked. Trading has ended; settlement is next.",
    "market.resolved": "DreamDEX result observed. ClaimRail is verifying on-chain settlement.",
    "market.finalized": "DreamDEX market finalized. The result is recorded on Somnia.",
    "market.voided": "DreamDEX market voided. Eligible collateral may now be returned.",
    "wallet.claimable": "Funds ready to claim. ClaimRail found a verified claimable position.",
    "wallet.payout_owed": "Payout still owed. Collateral remains due after redemption.",
    "claim.plan_created": "Claim plan ready. Review the fresh redemption plan in ClaimRail.",
    "claim.submitted": "Claim submitted. Waiting for verified on-chain confirmation.",
    "claim.confirmed": "Claim confirmed. Receipt and post-state evidence agree.",
    "claim.failed": "Claim needs attention. It did not reach verified confirmation.",
    "claim.superseded": "Claim transaction replaced. Open ClaimRail for the current receipt.",
  };
  return copy[event.type];
}

export function createTelegramTransport(input: {
  readonly encryptionKey: string;
  readonly botToken: string;
  readonly fetch?: typeof globalThis.fetch;
}) {
  const request = input.fetch ?? globalThis.fetch;
  return async (delivery: LeasedWebhookDelivery): Promise<WebhookDispatchResult> => {
    if (delivery.kind !== "telegram") throw new Error("TelegramKindMismatch");
    const chatId = decryptSecret(delivery.secretCiphertext, input.encryptionKey);
    const requestTimestamp = Math.floor(Date.now() / 1_000);
    const response = await request(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `ClaimRail · ${eventCopy(delivery.event)}\n\nEvent: ${delivery.event.type}`,
        disable_web_page_preview: true,
      }),
    });
    if (!response.ok) throw new TelegramDispatchError(response.status);
    const body = (await response.json()) as { readonly result?: { readonly message_id?: number } };
    return {
      providerMessageId:
        typeof body.result?.message_id === "number"
          ? `telegram:${body.result.message_id}`
          : `telegram:http-${response.status}`,
      httpStatus: response.status,
      signatureVersion: "bot-api",
      requestTimestamp,
    };
  };
}
