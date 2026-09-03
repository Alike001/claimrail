import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SOMNIA_TESTNET_ADDRESSES,
  binaryModuleWriteAbi,
  contractErrorsAbi,
} from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

const RPC_URL = process.env.RPC_URL?.trim() || "https://api.infra.testnet.somnia.network";
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;

// Public testnet state observed on 2026-09-03. Simulations use eth_call only:
// they impersonate the `from` address for validation but never possess a key,
// create a signature, broadcast a transaction, or mutate state.
const APPROVED_OWNER = "0x4356f421bfaf8bfeef5188c3a511ad79a5947c67" as Address;
const UNAPPROVED_OWNER = "0xe1DA3bdD4189FDEfB2eF8A73bd37A4083F284477" as Address;
const WINNING_MARKET = "0x0000000000000000000000000000000000000000000000000000000000011e56" as Hex;
const LOSING_MARKET = "0x0000000000000000000000000000000000000000000000000000000000011da1" as Hex;
const UNAPPROVED_WINNING_MARKET = "0x0000000000000000000000000000000000000000000000000000000000010269" as Hex;
const UNKNOWN_MARKET = `0x${"f".repeat(64)}` as Hex;
const INVALID_SIGNATURE = `0x${"0".repeat(130)}` as Hex;

const WINNING_BALANCE = 303_030_000n;
const LOSING_BALANCE = 18_975_000n;
const UNAPPROVED_WINNING_BALANCE = 2_970_000_000n;

const outcomeTokenAbi = parseAbi([
  "function isOperator(address owner, address spender) view returns (bool)",
]);

const redemptionAbi = [...binaryModuleWriteAbi, ...contractErrorsAbi] as const;

type SimulationCase = {
  name: string;
  account: Address;
  marketIds: Hex[];
  outcomeIdxs: number[];
  amounts: bigint[];
  expectation: string;
};

function splitBalance(total: bigint, count: number): bigint[] {
  const quotient = total / BigInt(count);
  const remainder = total % BigInt(count);
  return Array.from({ length: count }, (_value, index) => quotient + (BigInt(index) < remainder ? 1n : 0n));
}

function duplicateBatch(count: number): SimulationCase {
  return {
    name: `duplicate_batch_${count}`,
    account: APPROVED_OWNER,
    marketIds: Array.from({ length: count }, () => WINNING_MARKET),
    outcomeIdxs: Array.from({ length: count }, () => 0),
    amounts: splitBalance(WINNING_BALANCE, count),
    expectation: `${count} cumulative entries exactly consume one live balance and provide a gas-growth sample`,
  };
}

const cases: SimulationCase[] = [
  {
    name: "valid_winner",
    account: APPROVED_OWNER,
    marketIds: [WINNING_MARKET],
    outcomeIdxs: [0],
    amounts: [WINNING_BALANCE],
    expectation: "A fresh, approved, paying entry simulates successfully",
  },
  {
    name: "losing_zero_payout",
    account: APPROVED_OWNER,
    marketIds: [LOSING_MARKET],
    outcomeIdxs: [0],
    amounts: [LOSING_BALANCE],
    expectation: "The protocol accepts a losing burn even though its payout is zero",
  },
  {
    name: "zero_amount",
    account: APPROVED_OWNER,
    marketIds: [WINNING_MARKET],
    outcomeIdxs: [0],
    amounts: [0n],
    expectation: "Zero amount reverts",
  },
  {
    name: "over_balance",
    account: APPROVED_OWNER,
    marketIds: [WINNING_MARKET],
    outcomeIdxs: [0],
    amounts: [WINNING_BALANCE + 1n],
    expectation: "An amount above the live balance reverts",
  },
  {
    name: "duplicate_split_exact",
    account: APPROVED_OWNER,
    marketIds: [WINNING_MARKET, WINNING_MARKET],
    outcomeIdxs: [0, 0],
    amounts: [WINNING_BALANCE / 2n, WINNING_BALANCE - WINNING_BALANCE / 2n],
    expectation: "Duplicate entries are accepted when their total stays within balance",
  },
  {
    name: "duplicate_full_over_total",
    account: APPROVED_OWNER,
    marketIds: [WINNING_MARKET, WINNING_MARKET],
    outcomeIdxs: [0, 0],
    amounts: [WINNING_BALANCE, WINNING_BALANCE],
    expectation: "A later invalid entry reverts the entire batch simulation",
  },
  {
    name: "mixed_winner_and_loser",
    account: APPROVED_OWNER,
    marketIds: [WINNING_MARKET, LOSING_MARKET],
    outcomeIdxs: [0, 0],
    amounts: [WINNING_BALANCE, LOSING_BALANCE],
    expectation: "A mixed batch succeeds and would waste the losing position",
  },
  {
    name: "length_mismatch",
    account: APPROVED_OWNER,
    marketIds: [WINNING_MARKET, LOSING_MARKET],
    outcomeIdxs: [0],
    amounts: [WINNING_BALANCE, LOSING_BALANCE],
    expectation: "Parallel arrays of different lengths revert",
  },
  {
    name: "unknown_market",
    account: APPROVED_OWNER,
    marketIds: [UNKNOWN_MARKET],
    outcomeIdxs: [0],
    amounts: [1n],
    expectation: "An unknown market id reverts",
  },
  {
    name: "missing_operator_approval",
    account: UNAPPROVED_OWNER,
    marketIds: [UNAPPROVED_WINNING_MARKET],
    outcomeIdxs: [1],
    amounts: [UNAPPROVED_WINNING_BALANCE],
    expectation: "A valid claim without the module's ERC-6909 operator grant reverts",
  },
  duplicateBatch(10),
  duplicateBatch(50),
  duplicateBatch(100),
];

function json(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item, 2)}\n`;
}

function errorRecord(error: unknown): Record<string, unknown> {
  let cursor: unknown = error;
  for (let depth = 0; depth < 8 && cursor && typeof cursor === "object"; depth += 1) {
    const record = cursor as Record<string, unknown>;
    const data = record.data;
    if (data && typeof data === "object" && "errorName" in data) {
      const decoded = data as Record<string, unknown>;
      return {
        name: record.name,
        shortMessage: record.shortMessage,
        errorName: decoded.errorName,
        args: decoded.args ?? [],
      };
    }
    cursor = record.cause;
  }
  if (error instanceof Error) return { name: error.name, message: error.message.split("\n")[0] };
  return { name: "UnknownError", message: String(error) };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const runId = startedAt.toISOString().replaceAll(":", "-").replace(".", "-");
  const outputDirectory = resolve("evidence", "simulations", runId);
  await mkdir(outputDirectory, { recursive: true });

  const publicClient = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL) });
  const module = SOMNIA_TESTNET_ADDRESSES.binaryModule!;
  const settlement = SOMNIA_TESTNET_ADDRESSES.binarySettlement!;
  const outcomeToken = await publicClient.readContract({
    address: settlement,
    abi: parseAbi(["function outcomeToken() view returns (address)"]),
    functionName: "outcomeToken",
  });
  const [block, approved, unapproved] = await Promise.all([
    publicClient.getBlock(),
    publicClient.readContract({
      address: outcomeToken,
      abi: outcomeTokenAbi,
      functionName: "isOperator",
      args: [APPROVED_OWNER, module],
    }),
    publicClient.readContract({
      address: outcomeToken,
      abi: outcomeTokenAbi,
      functionName: "isOperator",
      args: [UNAPPROVED_OWNER, module],
    }),
  ]);

  const results: Record<string, unknown>[] = [];
  for (const item of cases) {
    const request = {
      address: module,
      abi: redemptionAbi,
      functionName: "redeemMany" as const,
      args: [0, ZERO_BYTES32, item.marketIds, item.outcomeIdxs, item.amounts] as const,
      account: item.account,
    };
    try {
      await publicClient.simulateContract(request);
      const gas = await publicClient.estimateContractGas(request);
      results.push({ ...item, simulated: true, gas });
    } catch (error) {
      results.push({ ...item, simulated: false, error: errorRecord(error) });
    }
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const redeemForCases = [
    {
      name: "redeem_for_expired_deadline",
      nonce: 9_876_543_210n,
      deadline: 1n,
      expectation: "An expired authorization is rejected before execution",
    },
    {
      name: "redeem_for_invalid_signature",
      nonce: 9_876_543_211n,
      deadline: now + 3_600n,
      expectation: "A future-dated authorization with an invalid signature is rejected",
    },
  ];
  const redeemForNegativeResults: Record<string, unknown>[] = [];
  for (const item of redeemForCases) {
    const request = {
      address: module,
      abi: redemptionAbi,
      functionName: "redeemFor" as const,
      args: [
        APPROVED_OWNER,
        item.nonce,
        item.deadline,
        INVALID_SIGNATURE,
        0,
        ZERO_BYTES32,
        WINNING_MARKET,
        0,
        WINNING_BALANCE,
      ] as const,
      account: UNAPPROVED_OWNER,
    };
    try {
      await publicClient.simulateContract(request);
      redeemForNegativeResults.push({ ...item, simulated: true });
    } catch (error) {
      redeemForNegativeResults.push({ ...item, simulated: false, error: errorRecord(error) });
    }
  }

  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    chainId: somniaShannon.id,
    head: block.number,
    blockGasLimit: block.gasLimit,
    rpcUrl: RPC_URL,
    module,
    settlement,
    outcomeToken,
    approvals: {
      [APPROVED_OWNER]: approved,
      [UNAPPROVED_OWNER]: unapproved,
    },
    method: "eth_call/simulateContract and eth_estimateGas only; no transaction was signed or broadcast",
    results,
    redeemForNegativeResults,
  };
  await writeFile(resolve(outputDirectory, "redemption-simulations.json"), json(report), "utf8");
  process.stdout.write(`${json(report)}Evidence written to ${outputDirectory}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${json(errorRecord(error))}`);
  process.exitCode = 1;
});
