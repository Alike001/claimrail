import { integrityHash } from "../claims/canonical.js";
import type { CanonicalEventEnvelope, CanonicalEventInput } from "./types.js";

export async function createCanonicalEvent<Payload>(
  input: CanonicalEventInput<Payload>,
): Promise<CanonicalEventEnvelope<Payload>> {
  const identity = {
    schemaVersion: input.schemaVersion,
    type: input.type,
    chainId: input.chainId,
    stateVersion: input.stateVersion,
    wallet: input.wallet ?? null,
    marketId: input.marketId ?? null,
    outcomeIndex: input.outcomeIndex ?? null,
    transactionHash: input.transactionHash ?? null,
  };
  return { id: await integrityHash(identity), ...input };
}
