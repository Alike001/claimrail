import {
  apiErrorSchema,
  canonicalDeliveryEventSchema,
  claimPrepareRequestSchema,
  claimPrepareResponseSchema,
  marketIdSchema,
  marketSettlementResponseSchema,
  subscriptionChallengeResponseSchema,
  subscriptionVerificationRequestSchema,
  subscriptionVerificationResponseSchema,
  verifyWebhook,
  webhookEnvelopeSchema,
  webhookSubscriptionRequestSchema,
  walletClaimablesResponseSchema,
  evmAddressSchema,
  type CanonicalDeliveryEvent,
  type ClaimPrepareResponse,
  type MarketSettlementResponse,
  type SubscriptionChallengeResponse,
  type SubscriptionVerificationResponse,
  type WalletClaimablesResponse,
  type WebhookEnvelope,
} from "@claimrail/contracts";

export type ClaimRailFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ClaimRailClientOptions {
  readonly baseUrl: string;
  readonly fetch?: ClaimRailFetch;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface SubscribeToWalletInput {
  readonly owner: string;
  readonly destination: string;
  readonly eventTypes: readonly CanonicalDeliveryEvent["type"][];
  readonly signMessage: (message: string) => Promise<string>;
}

interface RuntimeSchema<Value> {
  parse(value: unknown): Value;
}

export class ClaimRailApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ClaimRailApiError";
  }
}

function normalizedBaseUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new TypeError("ClaimRail base URL must be an HTTP(S) URL without credentials");
  }
  return url;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ClaimRailApiError(response.status, "invalid_response", "ClaimRail returned non-JSON");
  }
}

export class ClaimRailClient {
  readonly baseUrl: URL;
  readonly #fetch: ClaimRailFetch;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: ClaimRailClientOptions) {
    this.baseUrl = normalizedBaseUrl(options.baseUrl);
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#headers = options.headers ?? {};
  }

  async #request<Value>(
    path: string,
    schema: RuntimeSchema<Value>,
    init?: RequestInit,
  ): Promise<Value> {
    const headers = new Headers(this.#headers);
    headers.set("accept", "application/json");
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const response = await this.#fetch(new URL(path.replace(/^\//, ""), this.baseUrl), {
      ...init,
      headers,
    });
    const body = await responseBody(response);
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(body);
      throw new ClaimRailApiError(
        response.status,
        error.success ? error.data.error.code : "request_failed",
        error.success ? error.data.error.message : `ClaimRail request failed (${response.status})`,
      );
    }
    try {
      return schema.parse(body);
    } catch {
      throw new ClaimRailApiError(
        response.status,
        "invalid_response",
        "ClaimRail returned a response that does not match its public schema",
      );
    }
  }

  listClaimables(address: string): Promise<WalletClaimablesResponse> {
    const owner = evmAddressSchema.parse(address);
    return this.#request(
      `/api/v1/wallets/${encodeURIComponent(owner)}/claimables`,
      walletClaimablesResponseSchema,
    );
  }

  explainSettlement(marketId: string): Promise<MarketSettlementResponse> {
    const id = marketIdSchema.parse(marketId);
    return this.#request(
      `/api/v1/markets/${encodeURIComponent(id)}/settlement`,
      marketSettlementResponseSchema,
    );
  }

  buildRedemptionPlan(owner: string): Promise<ClaimPrepareResponse> {
    const body = claimPrepareRequestSchema.parse({ owner });
    return this.#request("/api/v1/claims/prepare", claimPrepareResponseSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  createWebhookChallenge(input: {
    readonly owner: string;
    readonly destination: string;
    readonly eventTypes: readonly CanonicalDeliveryEvent["type"][];
  }): Promise<SubscriptionChallengeResponse> {
    const body = webhookSubscriptionRequestSchema.parse({ ...input, kind: "webhook" });
    return this.#request("/api/v1/subscriptions/challenges", subscriptionChallengeResponseSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  verifyWebhookSubscription(input: {
    readonly challengeId: string;
    readonly message: string;
    readonly signature: string;
  }): Promise<SubscriptionVerificationResponse> {
    const body = subscriptionVerificationRequestSchema.parse(input);
    return this.#request("/api/v1/subscriptions/verify", subscriptionVerificationResponseSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async subscribeToWallet(
    input: SubscribeToWalletInput,
  ): Promise<SubscriptionVerificationResponse> {
    const challenge = await this.createWebhookChallenge({
      owner: input.owner,
      destination: input.destination,
      eventTypes: input.eventTypes,
    });
    const signature = await input.signMessage(challenge.message);
    return this.verifyWebhookSubscription({
      challengeId: challenge.challengeId,
      message: challenge.message,
      signature,
    });
  }
}

function headerValue(
  headers: Headers | Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  if (headers instanceof Headers) return headers.get(name) ?? "";
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? "";
}

export async function verifyClaimRailWebhook(input: {
  readonly secret: string;
  readonly headers: Headers | Readonly<Record<string, string | undefined>>;
  readonly rawBody: string;
  readonly now?: number;
  readonly toleranceSeconds?: number;
}): Promise<WebhookEnvelope> {
  const timestamp = headerValue(input.headers, "claimrail-timestamp");
  const signature = headerValue(input.headers, "claimrail-signature");
  const verified = await verifyWebhook({
    secret: input.secret,
    timestamp,
    signature,
    body: input.rawBody,
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.toleranceSeconds === undefined ? {} : { toleranceSeconds: input.toleranceSeconds }),
  });
  if (!verified.valid) {
    throw new ClaimRailApiError(401, "invalid_webhook", verified.reason ?? "Webhook rejected");
  }
  try {
    const envelope = webhookEnvelopeSchema.parse(JSON.parse(input.rawBody));
    canonicalDeliveryEventSchema.parse(envelope.event);
    return envelope;
  } catch {
    throw new ClaimRailApiError(
      400,
      "invalid_webhook_payload",
      "ClaimRail webhook payload does not match its public schema",
    );
  }
}

export type {
  CanonicalDeliveryEvent,
  ClaimPrepareResponse,
  MarketSettlementResponse,
  SubscriptionChallengeResponse,
  SubscriptionVerificationResponse,
  WalletClaimablesResponse,
  WebhookEnvelope,
};
