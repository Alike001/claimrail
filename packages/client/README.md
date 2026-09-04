# `@claimrail/client`

Small, runtime-validated TypeScript client for ClaimRail. It works in modern browsers and Node.js,
uses the platform `fetch`/Web Crypto APIs, and never accepts a wallet private key.

```ts
import { ClaimRailClient } from "@claimrail/client";

const claimrail = new ClaimRailClient({ baseUrl: "https://claimrail.example" });
const claimables = await claimrail.listClaimables("0x...");
const settlement = await claimrail.explainSettlement("0x...");
const plan = await claimrail.buildRedemptionPlan("0x...");
```

`subscribeToWallet` creates the readable ownership challenge, passes the exact message to an
application-supplied wallet signer, and consumes the signature. The callback boundary works with
Wagmi, viem, an embedded wallet, or a bot operator without giving ClaimRail custody.

```ts
const route = await claimrail.subscribeToWallet({
  owner: "0x...",
  destination: "https://bot.example/webhooks/claimrail",
  eventTypes: ["wallet.claimable", "claim.confirmed"],
  signMessage: (message) => walletClient.signMessage({ account, message }),
});

// Save once. ClaimRail will not show this secret again.
await secrets.put("claimrail-webhook", route.webhookSecret);
```

Webhook receivers must verify the signature over the exact raw request body before parsing JSON.
`verifyClaimRailWebhook` implements that framework-neutral boundary and returns a validated envelope.
