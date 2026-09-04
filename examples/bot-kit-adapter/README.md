# DreamDEX Bot Kit × ClaimRail adapter

This example replaces the Bot Kit's private-key `maybeClaim()` sweep with an external settlement
gate. The current Bot Kit deliberately runs claims inside its trading loop because claims and trades
use the same key and can race nonces. ClaimRail removes that coupling:

1. Set `AUTO_CLAIM=false` in the DreamDEX Bot Kit process.
2. Subscribe the bot's wallet to `market.locked`, `wallet.claimable`, `claim.confirmed`,
   `claim.failed`, and `claim.superseded`.
3. Pass each verified webhook event to `DreamDexClaimRailAdapter.accept(event)`.
4. Make the strategy loop check `adapter.canTrade(marketId)` before placing another order.
5. In `requestOwnerApprovedClaim`, notify the operator or open ClaimRail's owner-signed claim flow.
   Return the resulting ClaimRail `claimId`; never return or store a private key.
6. Resume only after ClaimRail emits `claim.confirmed`. Failed or superseded claims remain paused for
   operator attention.

```ts
import { verifyClaimRailWebhook } from "@claimrail/client";
import { DreamDexClaimRailAdapter } from "@claimrail/example-bot-kit-adapter";

const adapter = new DreamDexClaimRailAdapter({
  pauseMarket: ({ marketId }) => strategy.pause(marketId),
  requestOwnerApprovedClaim: ({ marketId }) => operatorQueue.requestClaim(marketId),
  resumeMarket: ({ marketId }) => strategy.resume(marketId),
  needsAttention: ({ claimId }) => operatorQueue.alert(claimId),
});

const envelope = await verifyClaimRailWebhook({ secret, headers, rawBody });
await adapter.accept(envelope.event);
```

The adapter imports only ClaimRail's public schemas. It does not reach into Bot Kit internals or call
DreamDEX redemption itself, so the owner-signing and receipt-verification boundaries stay explicit.
