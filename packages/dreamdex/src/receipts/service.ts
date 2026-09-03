import {
  asBaseUnit,
  asBlockNumber,
  asTimestampMs,
  asTransactionHash,
  type ClaimPlan,
  type ClaimReceipt,
  type ClaimReceiptEntry,
} from "@claimrail/core";
import { marketKey } from "@somnia-chain/markets-sdk";
import { decodeEventLog, type Address, type Hex } from "viem";
import { deployedBinarySettlementReceiptEventsAbi } from "../chain/abi.js";
import type { DreamDexReceiptGateway, TransactionReceiptSnapshot } from "../chain/types.js";
import type { DreamDexDeployment } from "../config/deployments.js";

export type ClaimReceiptReconciliation =
  | { readonly status: "pending"; readonly reason: string }
  | { readonly status: "superseded"; readonly reason: string }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly blockNumber?: bigint;
      readonly gasUsed?: bigint;
    }
  | {
      readonly status: "confirmed";
      readonly receipt: ClaimReceipt;
      readonly fallbackOwed: bigint;
      readonly postBalances: readonly {
        readonly tokenId: bigint;
        readonly balance: bigint;
      }[];
      readonly postSettlementBacking: readonly {
        readonly marketKey: bigint;
        readonly backing: bigint;
      }[];
    };

export interface ReconcileClaimReceiptInput {
  readonly deployment: DreamDexDeployment;
  readonly gateway: DreamDexReceiptGateway;
  readonly plan: ClaimPlan;
  readonly batchIndex: number;
  readonly transactionHash: Hex;
  readonly transactionNonce?: bigint;
  readonly submittedAt: number;
}

type DecodedReceiptEvent =
  | {
      readonly name: "Redeemed";
      readonly marketKey: bigint;
      readonly holder: Address;
      readonly to: Address;
      readonly outcomeIndex: number;
      readonly amountBurned: bigint;
      readonly collateralOut: bigint;
      readonly logIndex: number;
    }
  | {
      readonly name: "PayoutOwed" | "OwedClaimed";
      readonly owner: Address;
      readonly token: Address;
      readonly amount: bigint;
      readonly logIndex: number;
    };

function decodeReceiptEvents(
  deployment: DreamDexDeployment,
  receipt: TransactionReceiptSnapshot,
): readonly DecodedReceiptEvent[] {
  return receipt.logs.flatMap((log): DecodedReceiptEvent[] => {
    if (log.address.toLowerCase() !== deployment.addresses.binarySettlement.toLowerCase())
      return [];
    try {
      const decoded = decodeEventLog({
        abi: deployedBinarySettlementReceiptEventsAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      if (decoded.eventName === "Redeemed") {
        return [
          {
            name: "Redeemed",
            marketKey: decoded.args.marketKey,
            holder: decoded.args.holder,
            to: decoded.args.to,
            outcomeIndex: decoded.args.outcomeIdx,
            amountBurned: decoded.args.amountBurned,
            collateralOut: decoded.args.collateralOut,
            logIndex: log.logIndex,
          },
        ];
      }
      return [
        {
          name: decoded.eventName,
          owner: decoded.args.owner,
          token: decoded.args.token,
          amount: decoded.args.amount,
          logIndex: log.logIndex,
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function reconcileClaimReceipt(
  input: ReconcileClaimReceiptInput,
): Promise<ClaimReceiptReconciliation> {
  const batch = input.plan.batches.find(({ index }) => index === input.batchIndex);
  if (batch === undefined) return { status: "failed", reason: "claim plan batch was not found" };
  const chainReceipt = await input.gateway.getTransactionReceiptSnapshot(input.transactionHash);
  if (chainReceipt === null) {
    if (input.transactionNonce === undefined) {
      return {
        status: "pending",
        reason: "transaction receipt is unavailable and this legacy submission has no nonce",
      };
    }
    const missingStatus = await input.gateway.getMissingTransactionStatus(
      input.transactionHash,
      input.plan.owner as Address,
      input.transactionNonce,
    );
    if (missingStatus === "superseded") {
      return {
        status: "superseded",
        reason: "the owner mined a different transaction with this nonce",
      };
    }
    return { status: "pending", reason: "transaction receipt is not available yet" };
  }
  if (chainReceipt.status === "reverted") {
    return {
      status: "failed",
      reason: "redeemMany transaction reverted",
      blockNumber: chainReceipt.blockNumber,
      gasUsed: chainReceipt.gasUsed,
    };
  }

  const decoded = decodeReceiptEvents(input.deployment, chainReceipt);
  const redemptions = decoded.filter((event) => event.name === "Redeemed");
  const usedLogs = new Set<number>();
  const receiptEntries: ClaimReceiptEntry[] = [];
  for (const entry of batch.entries) {
    const key = marketKey(BigInt(entry.tokenId));
    const redemption = redemptions.find(
      (event) =>
        !usedLogs.has(event.logIndex) &&
        event.marketKey === key &&
        event.outcomeIndex === entry.outcomeIndex &&
        event.holder.toLowerCase() === input.plan.owner.toLowerCase() &&
        event.to.toLowerCase() === input.plan.recipient.toLowerCase(),
    );
    if (redemption === undefined) {
      return {
        status: "failed",
        reason: `successful receipt is missing Redeemed evidence for ${entry.positionIdentity}`,
        blockNumber: chainReceipt.blockNumber,
        gasUsed: chainReceipt.gasUsed,
      };
    }
    usedLogs.add(redemption.logIndex);
    if (redemption.amountBurned !== entry.amount) {
      return {
        status: "failed",
        reason: `Redeemed amount differs from plan for ${entry.positionIdentity}`,
        blockNumber: chainReceipt.blockNumber,
        gasUsed: chainReceipt.gasUsed,
      };
    }
    if (redemption.collateralOut !== entry.expectedPayout) {
      return {
        status: "failed",
        reason: `Redeemed collateral differs from expected payout for ${entry.positionIdentity}`,
        blockNumber: chainReceipt.blockNumber,
        gasUsed: chainReceipt.gasUsed,
      };
    }
    receiptEntries.push({
      marketId: entry.marketId,
      outcomeIndex: entry.outcomeIndex,
      tokenId: entry.tokenId,
      amountBurned: asBaseUnit(redemption.amountBurned),
      expectedPayout: entry.expectedPayout,
      actualCollateral: asBaseUnit(redemption.collateralOut),
    });
  }

  const postBalances = await Promise.all(
    batch.entries.map(async (entry) => ({
      tokenId: BigInt(entry.tokenId),
      balance: await input.gateway.getOutcomeBalanceAtBlock(
        input.plan.outcomeToken as Address,
        input.plan.owner as Address,
        BigInt(entry.tokenId),
        chainReceipt.blockNumber,
      ),
    })),
  );
  for (const [index, entry] of batch.entries.entries()) {
    const expectedBalance = entry.verifiedBalance - entry.amount;
    if (postBalances[index]?.balance !== expectedBalance) {
      return {
        status: "failed",
        reason: `post-claim balance differs from the plan for ${entry.positionIdentity}`,
        blockNumber: chainReceipt.blockNumber,
        gasUsed: chainReceipt.gasUsed,
      };
    }
  }

  const uniqueMarkets = new Map(
    batch.entries.map((entry) => [marketKey(BigInt(entry.tokenId)), entry] as const),
  );
  const postSettlementBacking = await Promise.all(
    [...uniqueMarkets.entries()].map(async ([key]) => ({
      marketKey: key,
      backing: (await input.gateway.getSettlementAtBlock(key, chainReceipt.blockNumber)).backing,
    })),
  );
  for (const [key, entry] of uniqueMarkets) {
    const paid = receiptEntries
      .filter((item) => marketKey(BigInt(item.tokenId)) === key)
      .reduce((sum, item) => sum + item.actualCollateral, 0n);
    const maximumPostBacking = entry.settlementBacking - paid;
    const observed = postSettlementBacking.find((item) => item.marketKey === key)?.backing;
    if (observed === undefined || observed > maximumPostBacking) {
      return {
        status: "failed",
        reason: `post-claim settlement backing does not reflect redemption for ${entry.marketId}`,
        blockNumber: chainReceipt.blockNumber,
        gasUsed: chainReceipt.gasUsed,
      };
    }
  }

  const collateralTokens = [...new Set(batch.entries.map(({ collateral }) => collateral))];
  const fallbackBalances = await Promise.all(
    collateralTokens.map((token) =>
      input.gateway.getOwed(input.plan.owner as Address, token as Address),
    ),
  );
  const fallbackOwed = fallbackBalances.reduce((sum, amount) => sum + amount, 0n);
  const confirmedAt = await input.gateway.getBlockTimestamp(chainReceipt.blockNumber);
  const actualCollateral = receiptEntries.reduce((sum, entry) => sum + entry.actualCollateral, 0n);
  const receipt: ClaimReceipt = {
    schemaVersion: "1",
    planHash: input.plan.integrityHash,
    chainId: input.plan.chainId,
    binaryModule: input.plan.binaryModule,
    owner: input.plan.owner,
    recipient: input.plan.recipient,
    transactionHash: asTransactionHash(input.transactionHash),
    status: "confirmed",
    submittedAt: asTimestampMs(input.submittedAt),
    confirmedAt: asTimestampMs(Number(confirmedAt * 1_000n)),
    blockNumber: asBlockNumber(chainReceipt.blockNumber),
    gasUsed: chainReceipt.gasUsed,
    expectedPayout: batch.expectedPayout,
    actualCollateral: asBaseUnit(actualCollateral),
    entries: receiptEntries,
    evidenceLinks: [
      `${input.deployment.explorerUrl}/tx/${input.transactionHash}`,
      `${input.deployment.explorerUrl}/block/${chainReceipt.blockNumber}`,
    ],
  };
  return { status: "confirmed", receipt, fallbackOwed, postBalances, postSettlementBacking };
}
