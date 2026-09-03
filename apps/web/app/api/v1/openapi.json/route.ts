const document = {
  openapi: "3.1.0",
  info: {
    title: "ClaimRail API",
    version: "0.4.0",
    description:
      "Evidence-aware wallet, settlement, owner-signed claim planning, and signed delivery operations.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/v1/wallets/{address}/positions": {
      get: {
        summary: "List normalized DreamDEX positions for a public wallet",
        parameters: [{ $ref: "#/components/parameters/Address" }],
        responses: { "200": { description: "Position scan with completeness metadata" } },
      },
    },
    "/api/v1/wallets/{address}/claimables": {
      get: {
        summary: "List positions that currently return funds",
        parameters: [{ $ref: "#/components/parameters/Address" }],
        responses: { "200": { description: "Claimable and void-refundable positions" } },
      },
    },
    "/api/v1/wallets/{address}/history": {
      get: {
        summary: "List settled and post-settlement wallet positions",
        description:
          "Returns position outcomes plus durable claim receipts. Realized delta is null when complete cost-basis history is unavailable; ClaimRail never invents PnL.",
        parameters: [{ $ref: "#/components/parameters/Address" }],
        responses: { "200": { description: "Evidence-aware position history" } },
      },
    },
    "/api/v1/markets/{marketId}/settlement": {
      get: {
        summary: "Explain a market settlement using reconciled on-chain evidence",
        parameters: [{ $ref: "#/components/parameters/MarketId" }],
        responses: { "200": { description: "Normalized market and settlement explanation" } },
      },
    },
    "/api/v1/claims/prepare": {
      post: {
        summary: "Build and simulate a short-lived owner-only redemption plan",
        description:
          "Returns approval_required before ERC-6909 module approval, or a hashed ready plan after every exact redeemMany batch simulates.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["owner"],
                properties: { owner: { $ref: "#/components/schemas/Address" } },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": { description: "Approval requirement or persisted, simulated claim plan" },
          "409": { description: "Wallet state cannot safely produce a claim plan" },
        },
      },
    },
    "/api/v1/claims/submissions": {
      post: {
        summary: "Persist a wallet-broadcast claim transaction as pending",
        description:
          "The hash is recorded immediately. Confirmation is a separate receipt and post-state reconciliation step.",
        responses: {
          "202": { description: "Durably recorded pending claim transaction" },
          "409": { description: "Plan, owner, chain, batch, expiry, or idempotency conflict" },
        },
      },
    },
    "/api/v1/claims/{claimId}": {
      get: {
        summary: "Read a durable claim receipt and its independently reconciled batches",
        description:
          "Returns pending until the worker verifies the canonical receipt, Redeemed logs, outcome-token balances, and settlement backing.",
        parameters: [{ $ref: "#/components/parameters/ClaimId" }],
        responses: {
          "200": { description: "Lossless settlement receipt" },
          "404": { description: "Claim receipt not found" },
        },
      },
    },
    "/api/v1/subscriptions/challenges": {
      post: {
        summary: "Create a short-lived wallet ownership challenge for an HTTPS webhook",
        description:
          "The human-readable message pins the owner, chain, destination, event filters, expiry, and nonce. It grants no trading or claim authority.",
        responses: {
          "201": { description: "Challenge to sign with the owner wallet" },
          "409": { description: "The wallet already has a verified webhook binding" },
        },
      },
    },
    "/api/v1/subscriptions/verify": {
      post: {
        summary: "Verify wallet ownership and activate the webhook route",
        description:
          "Supports EIP-191 EOA and smart-account signatures. The HMAC secret is returned once and retained only as an authenticated encrypted value plus hash.",
        responses: {
          "201": { description: "Verified webhook subscription and return-once signing secret" },
          "409": { description: "Challenge mismatch, expiry, reuse, or invalid wallet proof" },
        },
      },
    },
    "/api/v1/access/challenges": {
      post: {
        summary: "Create a delivery-console ownership challenge",
        description:
          "Issues a ten-minute readable message that grants no trading, claim, approval, or gas authority.",
        responses: {
          "201": { description: "Challenge to sign with the owner wallet" },
          "400": { description: "Invalid wallet address" },
        },
      },
    },
    "/api/v1/access/verify": {
      post: {
        summary: "Exchange a valid wallet proof for short-lived console access",
        description:
          "Consumes the challenge once and returns a 15-minute token scoped to delivery reads and dead-letter replay.",
        responses: {
          "201": { description: "Owner-scoped bearer access" },
          "409": { description: "Challenge mismatch, expiry, reuse, or invalid wallet proof" },
        },
      },
    },
    "/api/v1/deliveries": {
      get: {
        summary: "List webhook deliveries belonging to the authenticated owner",
        security: [{ DeliveryConsoleBearer: [] }],
        responses: {
          "200": { description: "Delivery summary and owner-scoped ledger" },
          "401": { description: "Missing, expired, or invalid access token" },
        },
      },
    },
    "/api/v1/deliveries/{deliveryId}": {
      get: {
        summary: "Inspect one owner-scoped delivery and its attempt history",
        security: [{ DeliveryConsoleBearer: [] }],
        parameters: [{ $ref: "#/components/parameters/DeliveryId" }],
        responses: {
          "200": { description: "Canonical event and delivery attempts" },
          "404": { description: "Delivery is absent or belongs to another owner" },
        },
      },
    },
    "/api/v1/deliveries/{deliveryId}/replay": {
      post: {
        summary: "Requeue an authenticated owner's dead-letter delivery",
        description:
          "Adds a bounded retry allowance to the existing delivery. It does not create a financial transaction or duplicate the canonical event.",
        security: [{ DeliveryConsoleBearer: [] }],
        parameters: [{ $ref: "#/components/parameters/DeliveryId" }],
        responses: {
          "202": { description: "Dead letter accepted for another delivery attempt" },
          "404": { description: "Delivery is absent, not dead, or belongs to another owner" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      DeliveryConsoleBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque owner-scoped token",
      },
    },
    schemas: {
      Address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
    },
    parameters: {
      Address: {
        name: "address",
        in: "path",
        required: true,
        schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
      },
      MarketId: {
        name: "marketId",
        in: "path",
        required: true,
        schema: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
      },
      ClaimId: {
        name: "claimId",
        in: "path",
        required: true,
        schema: { type: "string", pattern: "^claim:0x[0-9a-fA-F]{64}$" },
      },
      DeliveryId: {
        name: "deliveryId",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    },
  },
} as const;

export function GET() {
  return Response.json(document, { headers: { "cache-control": "public, max-age=3600" } });
}
