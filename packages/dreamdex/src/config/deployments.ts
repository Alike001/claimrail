import { SOMNIA_TESTNET_ADDRESSES, type SomniaMarketsAddresses } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import type { Address, Chain } from "viem";

export const DREAMDEX_SDK_VERSION = "0.29.0" as const;
export const PAYOUT_VECTOR_DENOMINATOR = 10_000_000n;

export interface DreamDexDeployment {
  readonly key: string;
  readonly adapterVersion: typeof DREAMDEX_SDK_VERSION;
  readonly chain: Chain;
  readonly indexerUrl: string;
  readonly rpcHttpUrl: string;
  readonly rpcWebSocketUrl: string;
  readonly explorerUrl: string;
  readonly addresses: SomniaMarketsAddresses & {
    readonly binaryModule: Address;
    readonly binarySettlement: Address;
  };
  readonly payoutVectorDenominator: bigint;
}

const requireAddress = (
  addresses: SomniaMarketsAddresses,
  name: "binaryModule" | "binarySettlement",
): Address => {
  const address = addresses[name];
  if (address === undefined) throw new Error(`DreamDEX deployment is missing ${name}`);
  return address;
};

const shannonAddresses = {
  ...SOMNIA_TESTNET_ADDRESSES,
  binaryModule: requireAddress(SOMNIA_TESTNET_ADDRESSES, "binaryModule"),
  binarySettlement: requireAddress(SOMNIA_TESTNET_ADDRESSES, "binarySettlement"),
};

export const SHANNON_DREAMDEX: DreamDexDeployment = {
  key: `somnia-shannon:${DREAMDEX_SDK_VERSION}`,
  adapterVersion: DREAMDEX_SDK_VERSION,
  chain: somniaShannon,
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  rpcHttpUrl: "https://api.infra.testnet.somnia.network",
  rpcWebSocketUrl: "wss://api.infra.testnet.somnia.network/ws",
  explorerUrl: "https://shannon-explorer.somnia.network",
  addresses: shannonAddresses,
  payoutVectorDenominator: PAYOUT_VECTOR_DENOMINATOR,
};

const deployments = new Map<number, DreamDexDeployment>([
  [SHANNON_DREAMDEX.chain.id, SHANNON_DREAMDEX],
]);

export function getDreamDexDeployment(chainId: number): DreamDexDeployment {
  const deployment = deployments.get(chainId);
  if (deployment === undefined) {
    throw new RangeError(`unsupported DreamDEX chain: ${chainId}`);
  }
  return deployment;
}
