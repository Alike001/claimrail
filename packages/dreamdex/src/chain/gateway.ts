import {
  SomniaMarkets,
  binaryModuleWriteAbi,
  binarySettlementAbi,
  erc6909Abi,
  marketKey,
  type BinaryMarketFilter,
  type FillsOptions,
  type RouterActionsOptions,
} from "@somnia-chain/markets-sdk";
import {
  createPublicClient,
  decodeFunctionData,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { DreamDexDeployment } from "../config/deployments.js";
import { binaryMarketPayoutAbi, deployedBinarySettlementEventsAbi } from "./abi.js";
import type {
  DreamDexClaimGateway,
  DreamDexReadGateway,
  DreamDexReceiptGateway,
  RedeemManyCall,
  FinalizationEvent,
  FinalizationEventQuery,
  MarketReadBundle,
  SettlementRecord,
} from "./types.js";

export class DreamDexSdkGateway
  implements DreamDexReadGateway, DreamDexClaimGateway, DreamDexReceiptGateway
{
  private readonly exchange: SomniaMarkets;
  private readonly publicClient: PublicClient;

  constructor(readonly deployment: DreamDexDeployment) {
    this.exchange = new SomniaMarkets({
      indexerUrl: deployment.indexerUrl,
      chain: deployment.chain,
      wsRpcUrl: deployment.rpcWebSocketUrl,
      addresses: deployment.addresses,
    });
    this.publicClient = createPublicClient({
      chain: deployment.chain,
      transport: http(deployment.rpcHttpUrl),
      batch: { multicall: true },
    }) as PublicClient;
  }

  listBinaryMarkets(options: BinaryMarketFilter & { limit?: number } = {}) {
    return this.exchange.client.listBinaryMarkets(options);
  }

  getBinaryMarket(marketId: string) {
    return this.exchange.client.getBinaryMarket(marketId);
  }

  getMarketOnchain(marketId: Hex) {
    return this.exchange.client.getMarketOnchain(marketId);
  }

  async getMarketResolution(marketId: string) {
    const result = await this.exchange.client.getMarketResolution(marketId);
    return {
      events: result.events,
      reference: result.reference,
      closingAnswer: result.closingAnswer,
      openingAnswer: result.openingAnswer,
    };
  }

  getMarketStatusHistory(marketId: string) {
    return this.exchange.client.getMarketStatusHistory(marketId);
  }

  getMarketFees(marketId: string) {
    return this.exchange.client.getMarketFees(marketId);
  }

  getOnchainResolutionPrice(marketId: Hex) {
    return this.exchange.client.getOnchainResolutionPrice(marketId);
  }

  getPayoutNumerators(marketAddress: Address) {
    return this.publicClient.readContract({
      address: marketAddress,
      abi: binaryMarketPayoutAbi,
      functionName: "payoutNumerators",
    });
  }

  async getSettlement(key: bigint): Promise<SettlementRecord> {
    const record = await this.publicClient.readContract({
      address: this.deployment.addresses.binarySettlement,
      abi: binarySettlementAbi,
      functionName: "getSettlement",
      args: [key],
    });
    return {
      collateralToken: record.collateralToken,
      backing: record.backing,
      finalized: record.finalized,
      voided: record.voided,
      settlementFeeBpsTimes1k: record.settlementFeeBpsTimes1k,
      feeRecipient: record.feeRecipient,
      pool: record.pool,
      nonce: record.nonce,
      payoutNumerators: record.payoutNumerators,
    };
  }

  getOutcomeBalance(outcomeToken: Address, account: Address, tokenId: bigint) {
    return this.exchange.client.getOutcomeBalance({ outcomeToken, account, id: tokenId });
  }

  getOutcomeBalanceAtBlock(
    outcomeToken: Address,
    account: Address,
    tokenId: bigint,
    blockNumber: bigint,
  ) {
    return this.publicClient.readContract({
      address: outcomeToken,
      abi: erc6909Abi,
      functionName: "balanceOf",
      args: [account, tokenId],
      blockNumber,
    });
  }

  async getSettlementAtBlock(key: bigint, blockNumber: bigint): Promise<SettlementRecord> {
    const record = await this.publicClient.readContract({
      address: this.deployment.addresses.binarySettlement,
      abi: binarySettlementAbi,
      functionName: "getSettlement",
      args: [key],
      blockNumber,
    });
    return {
      collateralToken: record.collateralToken,
      backing: record.backing,
      finalized: record.finalized,
      voided: record.voided,
      settlementFeeBpsTimes1k: record.settlementFeeBpsTimes1k,
      feeRecipient: record.feeRecipient,
      pool: record.pool,
      nonce: record.nonce,
      payoutNumerators: record.payoutNumerators,
    };
  }

  isOperator(outcomeToken: Address, owner: Address, operator: Address) {
    return this.publicClient.readContract({
      address: outcomeToken,
      abi: erc6909Abi,
      functionName: "isOperator",
      args: [owner, operator],
    });
  }

  async simulateRedeemMany(call: RedeemManyCall) {
    const blockNumber = await this.publicClient.getBlockNumber();
    const request = {
      account: call.owner,
      address: this.deployment.addresses.binaryModule,
      abi: binaryModuleWriteAbi,
      functionName: "redeemMany",
      args: [
        call.operatorId,
        call.venueId,
        [...call.marketIds],
        [...call.outcomeIndexes],
        [...call.amounts],
      ],
      blockNumber,
    } as const;
    await this.publicClient.simulateContract(request);
    const gasEstimate = await this.publicClient.estimateContractGas(request);
    return { gasEstimate, verifiedBlock: blockNumber };
  }

  async verifyRedeemManyTransaction(transactionHash: Hex, expected: RedeemManyCall) {
    const transaction = await this.publicClient.getTransaction({ hash: transactionHash });
    const reasons: string[] = [];
    if (transaction.from.toLowerCase() !== expected.owner.toLowerCase()) {
      reasons.push("transaction sender does not match the plan owner");
    }
    if (
      transaction.to === null ||
      transaction.to.toLowerCase() !== this.deployment.addresses.binaryModule.toLowerCase()
    ) {
      reasons.push("transaction target is not the configured DreamDEX binary module");
    }
    if (transaction.value !== 0n) reasons.push("redeemMany transaction must not send native value");
    try {
      const decoded = decodeFunctionData({ abi: binaryModuleWriteAbi, data: transaction.input });
      if (decoded.functionName !== "redeemMany") {
        reasons.push("transaction does not call redeemMany");
      } else {
        const [operatorId, venueId, marketIds, outcomeIndexes, amounts] = decoded.args;
        if (operatorId !== expected.operatorId) reasons.push("operatorId differs from the plan");
        if (venueId.toLowerCase() !== expected.venueId.toLowerCase()) {
          reasons.push("venueId differs from the plan");
        }
        if (
          marketIds.length !== expected.marketIds.length ||
          marketIds.some(
            (marketId, index) =>
              marketId.toLowerCase() !== expected.marketIds[index]?.toLowerCase(),
          )
        ) {
          reasons.push("marketIds differ from the plan");
        }
        if (
          outcomeIndexes.length !== expected.outcomeIndexes.length ||
          outcomeIndexes.some(
            (outcomeIndex, index) => outcomeIndex !== expected.outcomeIndexes[index],
          )
        ) {
          reasons.push("outcome indexes differ from the plan");
        }
        if (
          amounts.length !== expected.amounts.length ||
          amounts.some((amount, index) => amount !== expected.amounts[index])
        ) {
          reasons.push("amounts differ from the plan");
        }
      }
    } catch {
      reasons.push("transaction calldata is not a supported DreamDEX redeemMany call");
    }
    return { valid: reasons.length === 0, reasons, nonce: BigInt(transaction.nonce) };
  }

  async getTransactionReceiptSnapshot(transactionHash: Hex) {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash: transactionHash });
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          data: log.data,
          topics: log.topics,
          logIndex: log.logIndex,
        })),
      };
    } catch (error) {
      if (error instanceof Error && error.name.includes("NotFound")) return null;
      throw error;
    }
  }

  async getMissingTransactionStatus(transactionHash: Hex, owner: Address, nonce: bigint) {
    try {
      await this.publicClient.getTransaction({ hash: transactionHash });
      return "pending" as const;
    } catch (error) {
      if (!(error instanceof Error) || !error.name.includes("NotFound")) throw error;
    }
    const minedTransactionCount = await this.publicClient.getTransactionCount({
      address: owner,
      blockTag: "latest",
    });
    return BigInt(minedTransactionCount) > nonce ? ("superseded" as const) : ("pending" as const);
  }

  async getBlockTimestamp(blockNumber: bigint) {
    return (await this.publicClient.getBlock({ blockNumber })).timestamp;
  }

  getOwed(owner: Address, token: Address) {
    return this.publicClient.readContract({
      address: this.deployment.addresses.binarySettlement,
      abi: binarySettlementAbi,
      functionName: "owed",
      args: [owner, token],
    });
  }

  async getFinalizationEvent(query: FinalizationEventQuery): Promise<FinalizationEvent | null> {
    const lastBlock = query.toBlock ?? (await this.publicClient.getBlockNumber());
    const maximumRange = 999n;
    let log: Awaited<ReturnType<typeof this.publicClient.getLogs>>[number] | undefined;
    for (let fromBlock = query.fromBlock; fromBlock <= lastBlock; fromBlock += maximumRange + 1n) {
      const toBlock = fromBlock + maximumRange > lastBlock ? lastBlock : fromBlock + maximumRange;
      const logs = await this.publicClient.getLogs({
        address: this.deployment.addresses.binarySettlement,
        event: deployedBinarySettlementEventsAbi[0],
        args: { marketKey: query.marketKey, pool: query.pool },
        fromBlock,
        toBlock,
      });
      log = logs.at(-1);
      if (log !== undefined) break;
    }
    if (log === undefined || log.transactionHash === null || log.blockNumber === null) return null;
    const decoded = log as typeof log & {
      readonly args: {
        readonly marketKey?: bigint;
        readonly pool?: Address;
        readonly nonce?: bigint;
        readonly collateralToken?: Address;
        readonly netBacking?: bigint;
        readonly voided?: boolean;
        readonly payoutNumerators?: readonly bigint[];
      };
    };
    const {
      marketKey: key,
      pool,
      nonce,
      collateralToken,
      netBacking,
      voided,
      payoutNumerators,
    } = decoded.args;
    if (
      key === undefined ||
      pool === undefined ||
      nonce === undefined ||
      collateralToken === undefined ||
      netBacking === undefined ||
      voided === undefined ||
      payoutNumerators === undefined
    ) {
      throw new Error("deployed MarketFinalized log is missing decoded arguments");
    }
    return {
      marketKey: key,
      pool,
      nonce,
      collateralToken,
      netBacking,
      voided,
      payoutNumerators,
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
    };
  }

  async getHead() {
    const block = await this.publicClient.getBlock();
    return { blockNumber: block.number, timestamp: block.timestamp };
  }

  getRouterActions(account: string, options?: RouterActionsOptions) {
    return this.exchange.client.getRouterActions(account, options);
  }

  getFills(pool: string, options?: FillsOptions) {
    return this.exchange.client.getFills(pool, options);
  }

  close() {
    return this.exchange.close();
  }
}

export async function readMarketBundle(
  gateway: DreamDexReadGateway,
  marketId: Hex,
): Promise<MarketReadBundle> {
  const [indexed, onchain, resolution, statusHistory, fees, onchainResolutionPrice, head] =
    await Promise.all([
      gateway.getBinaryMarket(marketId),
      gateway.getMarketOnchain(marketId),
      gateway.getMarketResolution(marketId),
      gateway.getMarketStatusHistory(marketId),
      gateway.getMarketFees(marketId),
      gateway.getOnchainResolutionPrice(marketId),
      gateway.getHead(),
    ]);
  if (indexed === null) throw new Error(`DreamDEX indexer has no binary market ${marketId}`);
  const [directPayoutNumerators, settlement] = await Promise.all([
    gateway.getPayoutNumerators(onchain.marketAddress),
    gateway.getSettlement(marketKey(onchain.yesId)),
  ]);
  const finalizationEvent = settlement.finalized
    ? await gateway.getFinalizationEvent({
        marketKey: marketKey(onchain.yesId),
        pool: onchain.pool,
        fromBlock: BigInt(indexed.resolvedAtBlock ?? indexed.createdAtBlock),
        toBlock: head.blockNumber,
      })
    : null;
  return {
    indexed,
    onchain,
    directPayoutNumerators,
    settlement,
    resolution,
    statusHistory,
    fees,
    onchainResolutionPrice,
    finalizationEvent,
    head,
  };
}
