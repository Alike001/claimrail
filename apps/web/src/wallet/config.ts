import { createStorage, cookieStorage, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { defineChain } from "viem";

export const SOMNIA_SHANNON_CHAIN_ID = 50_312;

export const somniaShannon = defineChain({
  id: SOMNIA_SHANNON_CHAIN_ID,
  name: "Somnia Shannon Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.infra.testnet.somnia.network"] },
  },
  blockExplorers: {
    default: {
      name: "Somnia Shannon Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
});

export function getWagmiConfig() {
  return createConfig({
    chains: [somniaShannon],
    connectors: [injected()],
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: { [somniaShannon.id]: http(somniaShannon.rpcUrls.default.http[0]) },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getWagmiConfig>;
  }
}
