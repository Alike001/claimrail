import type { Address } from "viem";
import { createSiweMessage } from "viem/siwe";

export interface ClaimRailSiweContext {
  readonly challengeId: string;
  readonly owner: string;
  readonly chainId: number;
  readonly domain: string;
  readonly uri: string;
  readonly nonce: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export function buildClaimRailSiweMessage(
  input: ClaimRailSiweContext,
  statement: string,
  resources: readonly string[],
): string {
  return createSiweMessage({
    address: input.owner as Address,
    chainId: input.chainId,
    domain: input.domain,
    uri: input.uri,
    version: "1",
    nonce: input.nonce,
    issuedAt: input.issuedAt,
    expirationTime: input.expiresAt,
    requestId: input.challengeId,
    statement,
    resources: [...resources],
  });
}
