declare const claimRailBrand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [claimRailBrand]: Name;
};

export type ChainId = Brand<number, "ChainId">;
export type Address = Brand<`0x${string}`, "Address">;
export type MarketId = Brand<`0x${string}`, "MarketId">;
export type VenueId = Brand<`0x${string}`, "VenueId">;
export type TransactionHash = Brand<`0x${string}`, "TransactionHash">;
export type IntegrityHash = Brand<`0x${string}`, "IntegrityHash">;
export type TokenId = Brand<string, "TokenId">;
export type BlockNumber = Brand<bigint, "BlockNumber">;
export type BaseUnit = Brand<bigint, "BaseUnit">;
export type TimestampMs = Brand<number, "TimestampMs">;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BYTES_32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const TRANSACTION_HASH_PATTERN = BYTES_32_PATTERN;
const UNSIGNED_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;

function assertUnsignedBigInt(value: string | bigint, label: string): bigint {
  if (typeof value === "string" && !UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new TypeError(`${label} must be an unsigned base-10 integer`);
  }

  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed < 0n) {
    throw new RangeError(`${label} must not be negative`);
  }
  return parsed;
}

function asBytes32<Value extends MarketId | VenueId>(value: string, label: string): Value {
  if (!BYTES_32_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a 32-byte hex value`);
  }
  return value.toLowerCase() as Value;
}

export function asChainId(value: number): ChainId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("chainId must be a positive safe integer");
  }
  return value as ChainId;
}

export function asAddress(value: string): Address {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new TypeError("address must be a 20-byte hex value");
  }
  return value.toLowerCase() as Address;
}

export function asMarketId(value: string): MarketId {
  return asBytes32<MarketId>(value, "marketId");
}

export function asVenueId(value: string): VenueId {
  return asBytes32<VenueId>(value, "venueId");
}

export function asTransactionHash(value: string): TransactionHash {
  if (!TRANSACTION_HASH_PATTERN.test(value)) {
    throw new TypeError("transactionHash must be a 32-byte hex value");
  }
  return value.toLowerCase() as TransactionHash;
}

export function asIntegrityHash(value: string): IntegrityHash {
  if (!BYTES_32_PATTERN.test(value)) {
    throw new TypeError("integrityHash must be a 32-byte hex value");
  }
  return value.toLowerCase() as IntegrityHash;
}

export function asTokenId(value: string | bigint): TokenId {
  return assertUnsignedBigInt(value, "tokenId").toString() as TokenId;
}

export function asBlockNumber(value: string | bigint): BlockNumber {
  return assertUnsignedBigInt(value, "blockNumber") as BlockNumber;
}

export function asBaseUnit(value: string | bigint): BaseUnit {
  return assertUnsignedBigInt(value, "baseUnit") as BaseUnit;
}

export function asTimestampMs(value: number): TimestampMs {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("timestamp must be a non-negative safe integer in milliseconds");
  }
  return value as TimestampMs;
}
