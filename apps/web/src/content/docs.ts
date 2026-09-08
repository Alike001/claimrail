export const documentationNavigation = [
  {
    title: "Start here",
    items: [
      ["Overview", "#overview"],
      ["ClaimRail in 3 minutes", "#quick-tour"],
      ["Safety and control", "#safety"],
    ],
  },
  {
    title: "Use ClaimRail",
    items: [
      ["Check a wallet", "#use-claimrail"],
      ["Understand statuses", "#position-statuses"],
      ["Claim funds", "#manual-claim"],
      ["Alerts and receipts", "#alerts-receipts"],
    ],
  },
  {
    title: "Build with ClaimRail",
    items: [
      ["Developer quick start", "#client"],
      ["API reference", "#api"],
      ["Events and webhooks", "#webhooks"],
      ["DreamDEX Bot Kit", "#bot-kit"],
    ],
  },
  {
    title: "Reference",
    items: [
      ["Permission boundaries", "#trust"],
      ["OpenAPI 3.1", "/api/v1/openapi.json"],
      ["JSON Schemas", "/api/v1/schemas.json"],
    ],
  },
] as const;

export const documentationEndpoints = [
  ["GET", "/api/v1/wallets/:address/positions", "Normalized position scan"],
  ["GET", "/api/v1/wallets/:address/claimables", "Funds verified as claimable"],
  ["GET", "/api/v1/markets/:marketId/settlement", "Result and chain evidence"],
  ["POST", "/api/v1/claims/prepare", "Simulated claim plan"],
  ["POST", "/api/v1/claims/submissions", "Record a broadcast claim"],
  ["GET", "/api/v1/claims/:claimId", "Reconciled receipt"],
  ["GET", "/api/v1/wallets/:address/history", "Position and claim history"],
  ["POST", "/api/v1/subscriptions/challenges", "Create an ownership challenge"],
  ["POST", "/api/v1/subscriptions/verify", "Activate signed webhook delivery"],
  ["GET", "/api/v1/deliveries", "Owner-scoped delivery ledger"],
  ["POST", "/api/v1/notifications/test", "Send a non-financial route test"],
  ["POST", "/api/v1/deliveries/:deliveryId/replay", "Replay an owned dead letter"],
] as const;
