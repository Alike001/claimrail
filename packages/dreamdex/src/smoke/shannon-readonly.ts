import { marketKey } from "@somnia-chain/markets-sdk";
import {
  EXPECTED_SHANNON_MARKET_FINALIZED_TOPIC,
  DEPLOYED_MARKET_FINALIZED_TOPIC,
} from "../chain/abi.js";
import { DreamDexSdkGateway, readMarketBundle } from "../chain/gateway.js";
import { SHANNON_DREAMDEX } from "../config/deployments.js";
import {
  createOutcomeBalancePageFetcher,
  discoverOutcomeBalances,
} from "../indexer/outcome-balances.js";
import { ClaimRailReadService } from "../services/claimrail.js";

const KNOWN_MARKET = "0x0000000000000000000000000000000000000000000000000000000000012222" as const;
const LARGE_PUBLIC_WALLET = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
const CLAIMABLE_PUBLIC_WALLET = "0xe1DA3bdD4189FDEfB2eF8A73bd37A4083F284477";

async function main() {
  if (SHANNON_DREAMDEX.chain.id !== 50312) throw new Error("unexpected Shannon chain id");
  if (DEPLOYED_MARKET_FINALIZED_TOPIC !== EXPECTED_SHANNON_MARKET_FINALIZED_TOPIC) {
    throw new Error("deployed MarketFinalized topic drifted");
  }
  const gateway = new DreamDexSdkGateway(SHANNON_DREAMDEX);
  try {
    const service = new ClaimRailReadService({ deployment: SHANNON_DREAMDEX, gateway });
    const [bundle, discovery, walletRead] = await Promise.all([
      readMarketBundle(gateway, KNOWN_MARKET),
      discoverOutcomeBalances({
        account: LARGE_PUBLIC_WALLET,
        fetchPage: createOutcomeBalancePageFetcher(SHANNON_DREAMDEX.indexerUrl),
        pageSize: 100,
        maxPages: 100,
        timeoutMs: 15_000,
      }),
      service.readWallet(CLAIMABLE_PUBLIC_WALLET, {
        pageSize: 100,
        maxPages: 5,
        pageTimeoutMs: 15_000,
      }),
    ]);
    if (bundle.indexed.marketId !== KNOWN_MARKET) throw new Error("known market id mismatch");
    if (bundle.onchain.nonce !== 490n) throw new Error("known recycled-pool nonce mismatch");
    if (marketKey(bundle.onchain.yesId) !== bundle.finalizationEvent?.marketKey) {
      throw new Error("settlement market key mismatch");
    }
    if (discovery.completeness !== "complete") {
      throw new Error(`wallet discovery was ${discovery.completeness}`);
    }
    if (walletRead.positions.completeness === "failed") {
      throw new Error("ClaimRail service could not normalize the public wallet");
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: "read-only; no signer or wallet connection",
          chainId: SHANNON_DREAMDEX.chain.id,
          headBlock: bundle.head.blockNumber.toString(),
          marketId: bundle.indexed.marketId,
          marketNonce: bundle.onchain.nonce.toString(),
          finalized: bundle.settlement.finalized,
          finalizationTopic: DEPLOYED_MARKET_FINALIZED_TOPIC,
          walletRows: discovery.uniquePositionCount,
          walletPages: discovery.pageCount,
          completeness: discovery.completeness,
          normalizedWallet: walletRead.address,
          normalizedPositions: walletRead.positions.uniquePositionCount,
          verifiedClaimCandidates: walletRead.claimCandidates.length,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await gateway.close();
  }
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  },
);
