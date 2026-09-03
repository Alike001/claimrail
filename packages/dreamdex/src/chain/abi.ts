import { parseAbi, toEventSelector } from "viem";

/**
 * Shannon's deployed BinarySettlement emits a payout vector. SDK 0.29.0's
 * events ABI still ends this event with `uint8 winningOutcome`, so ClaimRail
 * deliberately owns this one read-side event fragment.
 */
export const deployedBinarySettlementEventsAbi = parseAbi([
  "event MarketFinalized(uint256 indexed marketKey, address indexed pool, uint64 nonce, address collateralToken, uint256 netBacking, bool voided, uint256[] payoutNumerators)",
]);

export const DEPLOYED_MARKET_FINALIZED_SIGNATURE =
  "MarketFinalized(uint256,address,uint64,address,uint256,bool,uint256[])" as const;

export const DEPLOYED_MARKET_FINALIZED_TOPIC = toEventSelector(DEPLOYED_MARKET_FINALIZED_SIGNATURE);

export const EXPECTED_SHANNON_MARKET_FINALIZED_TOPIC =
  "0xb1884334e955f8d8727678d4fa52dd9fc7140ff5e4ad38d358453bd400ada178" as const;

export const binaryMarketPayoutAbi = parseAbi([
  "function payoutNumerators() view returns (uint256[])",
]);

export const deployedBinarySettlementReceiptEventsAbi = parseAbi([
  "event Redeemed(uint256 indexed marketKey, address indexed holder, address indexed to, uint8 outcomeIdx, uint256 amountBurned, uint256 collateralOut)",
  "event PayoutOwed(address indexed owner, address indexed token, uint256 amount)",
  "event OwedClaimed(address indexed owner, address indexed token, uint256 amount)",
]);
