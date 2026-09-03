const document = {
  openapi: "3.1.0",
  info: {
    title: "ClaimRail API",
    version: "0.2.0",
    description:
      "Evidence-aware wallet, settlement, and owner-signed DreamDEX claim-planning endpoints.",
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
  },
  components: {
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
    },
  },
} as const;

export function GET() {
  return Response.json(document, { headers: { "cache-control": "public, max-age=3600" } });
}
