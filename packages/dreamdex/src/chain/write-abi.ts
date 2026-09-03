import { parseAbi } from "viem";

/** Exact write fragments used by the user-signed ClaimRail manual flow. */
export const claimRailErc6909WriteAbi = parseAbi([
  "function setOperator(address spender, bool approved) returns (bool)",
]);

export const claimRailBinaryModuleWriteAbi = parseAbi([
  "function redeemMany(uint32 operatorId, bytes32 venueId, bytes32[] marketIds, uint8[] outcomeIdxs, uint256[] amounts)",
]);
