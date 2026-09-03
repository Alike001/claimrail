import { buildInboxViewModel } from "@claimrail/ui";
import {
  claimPlanSchema,
  claimReceiptResponseSchema,
  type ClaimReceiptResponse,
} from "@claimrail/contracts";
import { ClaimRepository, createDatabase, type StoredClaimReceipt } from "@claimrail/db";
import {
  ClaimRailClaimService,
  ClaimRailReadService,
  DreamDexSdkGateway,
  SHANNON_DREAMDEX,
} from "@claimrail/dreamdex";
import { getAddress, isHex, type Address, type Hex } from "viem";

async function closeGateway(gateway: DreamDexSdkGateway): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      gateway.close(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 3_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function readWalletInbox(address: string) {
  const normalized = getAddress(address);
  const gateway = new DreamDexSdkGateway(SHANNON_DREAMDEX);
  try {
    const result = await new ClaimRailReadService({
      deployment: SHANNON_DREAMDEX,
      gateway,
    }).readWallet(normalized, { pageSize: 100, maxPages: 100, pageTimeoutMs: 12_000 });
    return {
      result,
      view: buildInboxViewModel({
        address: result.address,
        scan: result.positions,
        markets: result.markets.map(({ market }) => market),
      }),
    };
  } finally {
    await closeGateway(gateway);
  }
}

export async function readMarketSettlement(marketId: string) {
  if (!isHex(marketId) || marketId.length !== 66) throw new TypeError("InvalidMarketId");
  const gateway = new DreamDexSdkGateway(SHANNON_DREAMDEX);
  try {
    return await new ClaimRailReadService({
      deployment: SHANNON_DREAMDEX,
      gateway,
    }).explainSettlement(marketId as Hex);
  } finally {
    await closeGateway(gateway);
  }
}

function deploymentWrite() {
  return {
    key: SHANNON_DREAMDEX.key,
    chainId: SHANNON_DREAMDEX.chain.id,
    adapterVersion: SHANNON_DREAMDEX.adapterVersion,
    name: SHANNON_DREAMDEX.chain.name,
    binaryModule: SHANNON_DREAMDEX.addresses.binaryModule,
    binarySettlement: SHANNON_DREAMDEX.addresses.binarySettlement,
    configuration: {
      rpcHttpUrl: SHANNON_DREAMDEX.rpcHttpUrl,
      indexerUrl: SHANNON_DREAMDEX.indexerUrl,
      explorerUrl: SHANNON_DREAMDEX.explorerUrl,
      payoutVectorDenominator: SHANNON_DREAMDEX.payoutVectorDenominator,
    },
  };
}

export async function prepareManualClaim(owner: string) {
  const gateway = new DreamDexSdkGateway(SHANNON_DREAMDEX);
  try {
    const result = await new ClaimRailClaimService({
      deployment: SHANNON_DREAMDEX,
      gateway,
    }).prepare(owner, { pageSize: 100, maxPages: 100, pageTimeoutMs: 12_000 });
    if (result.status === "ready") {
      const databaseUrl = process.env.DATABASE_URL;
      if (databaseUrl === undefined || databaseUrl.trim() === "") {
        throw new Error("durable claim-plan storage is unavailable");
      }
      const database = createDatabase(databaseUrl, {
        maxConnections: 2,
        applicationName: "claimrail-web-claims",
      });
      try {
        await new ClaimRepository(database.db).persistReadyPlan({
          deployment: deploymentWrite(),
          plan: result.plan,
        });
      } finally {
        await database.close();
      }
    }
    return result;
  } finally {
    await closeGateway(gateway);
  }
}

export async function persistClaimSubmission(input: {
  readonly planHash: string;
  readonly owner: string;
  readonly chainId: number;
  readonly batchIndex: number;
  readonly transactionHash: string;
}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("durable claim submission storage is unavailable");
  }
  const database = createDatabase(databaseUrl, {
    maxConnections: 2,
    applicationName: "claimrail-web-claims",
  });
  try {
    const repository = new ClaimRepository(database.db);
    const stored = await repository.loadPlan(SHANNON_DREAMDEX.key, input.planHash);
    if (stored === null) throw new Error("claim plan was not found");
    const plan = claimPlanSchema.parse(stored.plan);
    const batch = plan.batches.find(({ index }) => index === input.batchIndex);
    if (batch === undefined) throw new Error("submission batch does not exist in the claim plan");
    const gateway = new DreamDexSdkGateway(SHANNON_DREAMDEX);
    let transactionNonce: bigint | undefined;
    try {
      let verification: Awaited<ReturnType<typeof gateway.verifyRedeemManyTransaction>> | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < 10 && verification === undefined; attempt += 1) {
        try {
          verification = await gateway.verifyRedeemManyTransaction(input.transactionHash as Hex, {
            owner: input.owner as Address,
            operatorId: plan.operatorId,
            venueId: plan.venueId as Hex,
            marketIds: batch.entries.map(({ marketId }) => marketId as Hex),
            outcomeIndexes: batch.entries.map(({ outcomeIndex }) => outcomeIndex),
            amounts: batch.entries.map(({ amount }) => BigInt(amount)),
          });
        } catch (error) {
          lastError = error;
          if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      if (verification === undefined) throw lastError ?? new Error("transaction was not found");
      if (!verification.valid) {
        throw new Error(
          `transaction does not match the claim plan: ${verification.reasons.join("; ")}`,
        );
      }
      transactionNonce = verification.nonce;
    } finally {
      await closeGateway(gateway);
    }
    return await repository.recordSubmission({
      deploymentKey: SHANNON_DREAMDEX.key,
      ...input,
      nonce:
        transactionNonce ??
        (() => {
          throw new Error("transaction nonce was not verified");
        })(),
      submittedAt: new Date(),
    });
  } finally {
    await database.close();
  }
}

export async function readClaimReceipt(claimId: string): Promise<ClaimReceiptResponse | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("durable claim receipt storage is unavailable");
  }
  const database = createDatabase(databaseUrl, {
    maxConnections: 2,
    applicationName: "claimrail-web-receipts",
  });
  try {
    const stored = await new ClaimRepository(database.db).getClaimReceipt(claimId);
    if (stored === null) return null;
    return serializeClaimReceipt(stored);
  } finally {
    await database.close();
  }
}

export async function readWalletClaimReceipts(owner: string): Promise<{
  readonly available: boolean;
  readonly receipts: readonly ClaimReceiptResponse[];
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    return { available: false, receipts: [] };
  }
  const database = createDatabase(databaseUrl, {
    maxConnections: 2,
    applicationName: "claimrail-web-history",
  });
  try {
    const stored = await new ClaimRepository(database.db).listWalletClaimReceipts(owner);
    return {
      available: true,
      receipts: stored.map(serializeClaimReceipt),
    };
  } finally {
    await database.close();
  }
}

function serializeClaimReceipt(stored: StoredClaimReceipt): ClaimReceiptResponse {
  return claimReceiptResponseSchema.parse(
    jsonSafe({
      schemaVersion: "1",
      claimId: stored.claimId,
      planHash: stored.planHash,
      chainId: Number(stored.plan.chainId),
      owner: stored.owner,
      recipient: stored.recipient,
      status: stored.status,
      expectedPayout: stored.expectedPayout,
      actualCollateral: stored.actualCollateral,
      gasUsed: stored.gasUsed,
      submittedAt: stored.submittedAt?.toISOString() ?? null,
      confirmedAt: stored.confirmedAt?.toISOString() ?? null,
      blockNumber: stored.blockNumber,
      transactions: stored.transactions.map((transaction) => ({
        ...transaction,
        submittedAt: transaction.submittedAt.toISOString(),
        confirmedAt: transaction.confirmedAt?.toISOString() ?? null,
      })),
    }),
  );
}

export function jsonSafe<Value>(value: Value): Value {
  return JSON.parse(
    JSON.stringify(value, (_key, nested: unknown) =>
      typeof nested === "bigint" ? nested.toString() : nested,
    ),
  ) as Value;
}
