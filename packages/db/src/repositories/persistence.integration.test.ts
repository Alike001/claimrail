import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asAddress,
  asBaseUnit,
  asBlockNumber,
  asChainId,
  asMarketId,
  asTimestampMs,
  asTokenId,
  asVenueId,
  finalizeClaimPlan,
  prepareClaimPlan,
} from "@claimrail/core";
import {
  createDatabase,
  databaseHealth,
  databaseReadiness,
  migrateDatabase,
  type DatabaseContext,
} from "../client.js";
import { OutboxJobRepository } from "../jobs/repository.js";
import { ClaimRailStateRepository } from "./state.js";
import { ClaimRepository } from "./claims.js";
import { SubscriptionRepository } from "./subscriptions.js";
import { DeliveryRepository } from "./deliveries.js";
import { AccessRepository } from "./access.js";
import type { PersistWalletTransitionInput } from "./types.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl === undefined ? describe.skip : describe;
const MODULE = "0x3ecc694cef705358864a646142ac17a90e29e388";
const SETTLEMENT = "0xbf4a49e0dfd092e5fbe8e5761064c49533e6ed23";
const MARKET_ID = `0x${"12".repeat(32)}`;
const MARKET = `50312:${MODULE}:${MARKET_ID}`;
const WALLET = "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477";
const POSITION = `${MARKET}:${WALLET}:0`;
const MAX_UINT256 = (1n << 256n) - 1n;
const WHEN = new Date("2026-09-03T12:00:00.000Z");
const OUTCOME_TOKEN = "0xb52c5934113af5c0bb20eb3c72290c8215f755b9";
const VENUE_ID = `0x${"ab".repeat(32)}`;

async function readyClaimPlan() {
  const draft = prepareClaimPlan({
    chainId: asChainId(50_312),
    binaryModule: asAddress(MODULE),
    outcomeToken: asAddress(OUTCOME_TOKEN),
    venueId: asVenueId(VENUE_ID),
    operatorId: 4,
    owner: asAddress(WALLET),
    recipient: asAddress(WALLET),
    operatorApproved: true,
    candidates: [
      {
        candidateId: "db-claimable-1",
        market: {
          chainId: asChainId(50_312),
          binaryModule: asAddress(MODULE),
          marketId: asMarketId(MARKET_ID),
        },
        owner: asAddress(WALLET),
        venueId: asVenueId(VENUE_ID),
        operatorId: 4,
        outcomeIndex: 0,
        tokenId: asTokenId(2n),
        outcomeToken: asAddress(OUTCOME_TOKEN),
        amount: asBaseUnit(1_000_000n),
        verifiedBalance: asBaseUnit(1_000_000n),
        pool: asAddress("0x383c5fc76e6b022fe28fabb3c95d186ad9b19ec5"),
        marketNonce: 490n,
        collateral: asAddress("0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e"),
        contractStatus: "resolved",
        isResolved: true,
        isVoided: false,
        settlementFinalized: true,
        settlementBacking: asBaseUnit(1_500_000_000n),
        payoutVector: {
          numerators: [asBaseUnit(10_000_000n), asBaseUnit(0n)],
          denominator: asBaseUnit(10_000_000n),
        },
        settlementFeeBpsTimes1k: asBaseUnit(0n),
        alreadyRedeemed: false,
        freshness: "fresh",
        conflicts: [],
        evidenceVersion: "db-test-v1",
      },
    ],
    discoveryCompleteness: "complete",
    verifiedBlock: asBlockNumber(478_725_909n),
    now: asTimestampMs(WHEN.getTime()),
    ttlMs: 60_000,
    batchPolicy: { name: "db-test", maxEntries: 100, evidenceReference: "db:test" },
  });
  return finalizeClaimPlan({
    draft,
    simulations: [
      {
        status: "passed",
        batchIndex: 0,
        gasEstimate: 650_000n,
        verifiedBlock: asBlockNumber(478_725_909n),
      },
    ],
  });
}

function transitionInput(
  overrides: {
    readonly eventId?: string;
    readonly marketIdentity?: string;
    readonly positionIdentity?: string;
    readonly outboxMaxAttempts?: number;
  } = {},
): PersistWalletTransitionInput {
  const marketIdentity = overrides.marketIdentity ?? MARKET;
  const positionIdentity = overrides.positionIdentity ?? POSITION;
  return {
    deployment: {
      key: "somnia-shannon:0.29.0",
      chainId: 50312,
      adapterVersion: "0.29.0",
      name: "Somnia Shannon",
      binaryModule: MODULE,
      binarySettlement: SETTLEMENT,
      configuration: { payoutVectorDenominator: 10_000_000n },
    },
    walletAddress: WALLET,
    scan: {
      sourceRunId: "scan-478725909",
      completeness: "complete",
      source: "dreamdex-indexer:OutcomeBalance",
      pageCount: 1,
      rowCount: 1,
      uniquePositionCount: 1,
      failureDetails: [{ largestObservedToken: MAX_UINT256 }],
      startedAt: WHEN,
      completedAt: WHEN,
    },
    market: {
      identity: marketIdentity,
      marketId: MARKET_ID,
      binaryModule: MODULE,
      pool: "0x383c5fc76e6b022fe28fabb3c95d186ad9b19ec5",
      marketNonce: 490n,
      marketAddress: "0x1e66d219ed22cc650e513f47111e0848cb497714",
      outcomeToken: "0xb52c5934113af5c0bb20eb3c72290c8215f755b9",
      collateral: "0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e",
      contractStatus: "resolved",
      settlementFinalized: true,
      lifecycle: "finalized",
      evidenceVersion: "claimrail-dreamdex-reconciliation/v1",
      canonical: { marketNonce: 490n, lifecycle: "finalized" },
      verifiedBlock: 478_725_909n,
      observedAt: WHEN,
      observation: {
        source: "somnia-chain",
        sourceId: `market:${marketIdentity}:478725909`,
        payload: { block: 478_725_909n },
      },
      settlement: {
        status: "verified",
        finalized: true,
        voided: false,
        backing: 1_500_000_000n,
        settlementFeeBpsTimes1k: 0n,
        payoutNumerators: ["10000000", "0"],
        payoutDenominator: 10_000_000n,
        finalizationTransaction: `0x${"34".repeat(32)}`,
        evidence: { topic: `0x${"56".repeat(32)}` },
      },
    },
    position: {
      identity: positionIdentity,
      outcomeIndex: 0,
      tokenId: MAX_UINT256,
      verifiedBalance: 1_000_000n,
      state: "claimable",
      expectedPayout: 1_000_000n,
      evidenceVersion: "claimrail-wallet-position/v1",
      evidence: { verified: true },
      verifiedBlock: 478_725_909n,
      observedAt: WHEN,
      observation: {
        source: "somnia-chain",
        sourceId: `position:${positionIdentity}:478725909`,
        payload: { balance: 1_000_000n },
      },
    },
    transition: {
      eventId: overrides.eventId ?? `0x${"78".repeat(32)}`,
      eventType: "wallet.claimable",
      aggregateType: "position",
      aggregateId: positionIdentity,
      schemaVersion: "1",
      payload: { positionIdentity, expectedPayout: 1_000_000n },
      sourceTransactionHash: `0x${"34".repeat(32)}`,
      sourceLogIndex: 61,
      blockNumber: 478_725_909n,
      occurredAt: WHEN,
      outboxTopic: "canonical-events",
      ...(overrides.outboxMaxAttempts === undefined
        ? {}
        : { outboxMaxAttempts: overrides.outboxMaxAttempts }),
    },
  };
}

describePostgres("PostgreSQL persistence", () => {
  let context: DatabaseContext;

  beforeAll(async () => {
    context = createDatabase(databaseUrl!, {
      maxConnections: 8,
      applicationName: "claimrail-test",
    });
    await migrateDatabase(context, new URL("../../drizzle", import.meta.url).pathname);
  });

  beforeEach(async () => {
    await context.db.execute(sql`
      truncate table
        delivery_attempts, access_tokens, access_challenges, deliveries,
        notification_bindings, subscriptions, outbox_jobs,
        canonical_events, claim_transactions, claim_entries, claims, position_scan_members,
        position_observations, positions, settlement_evidence,
        market_observations, markets, scan_runs, watched_wallets,
        audit_records, deployments
      restart identity cascade
    `);
  });

  afterAll(async () => {
    await context.close();
  });

  it("applies the empty-database migration repeatedly and reports healthy without exposing the URL", async () => {
    await migrateDatabase(context, new URL("../../drizzle", import.meta.url).pathname);
    const health = await databaseHealth(context);
    const readiness = await databaseReadiness(context);
    expect(health).toMatchObject({ status: "healthy", database: "reachable" });
    expect(readiness).toMatchObject({ status: "healthy", schema: "ready" });
    expect(JSON.stringify(health)).not.toContain("postgresql://");
  });

  it("deduplicates a replay and round-trips a uint256 exactly", async () => {
    const repository = new ClaimRailStateRepository(context.db);
    const first = await repository.persistWalletTransition(transitionInput());
    await context.close();
    context = createDatabase(databaseUrl!, {
      maxConnections: 8,
      applicationName: "claimrail-test-replay-restarted",
    });
    const replay = await new ClaimRailStateRepository(context.db).persistWalletTransition(
      transitionInput(),
    );
    expect(first).toMatchObject({ eventCreated: true, outboxCreated: true });
    expect(replay).toMatchObject({ eventCreated: false, outboxCreated: false });
    expect(replay.scanRunId).toBe(first.scanRunId);
    const stored = await context.pool.query<{ token_id: string }>(
      "select token_id from positions where identity = $1",
      [POSITION],
    );
    expect(stored.rows[0]?.token_id).toBe(MAX_UINT256.toString());
    const counts = await context.pool.query<{
      events: string;
      jobs: string;
      scans: string;
      audits: string;
    }>(`
      select
        (select count(*) from canonical_events) as events,
        (select count(*) from outbox_jobs) as jobs,
        (select count(*) from scan_runs) as scans,
        (select count(*) from audit_records) as audits
    `);
    expect(counts.rows[0]).toEqual({ events: "1", jobs: "1", scans: "1", audits: "1" });
  });

  it("rolls state and event back when the outbox write fails", async () => {
    const repository = new ClaimRailStateRepository(context.db);
    const marketIdentity = `${MARKET}:rollback`;
    const positionIdentity = `${POSITION}:rollback`;
    await expect(
      repository.persistWalletTransition(
        transitionInput({
          eventId: `0x${"90".repeat(32)}`,
          marketIdentity,
          positionIdentity,
          outboxMaxAttempts: 0,
        }),
      ),
    ).rejects.toThrow();
    const result = await context.pool.query<{ count: string }>(
      "select count(*) from positions where identity = $1",
      [positionIdentity],
    );
    expect(result.rows[0]?.count).toBe("0");
  });

  it("persists an immutable claim plan and records each submitted batch idempotently", async () => {
    const plan = await readyClaimPlan();
    const repository = new ClaimRepository(context.db);
    const deployment = transitionInput().deployment;
    const persisted = await repository.persistReadyPlan({ deployment, plan });
    expect(persisted.claimId).toBe(`claim:${plan.integrityHash}`);
    const stored = await context.pool.query<{ expected_payout: string; metadata: unknown }>(
      "select expected_payout, metadata from claims where plan_hash = $1",
      [plan.integrityHash],
    );
    expect(stored.rows[0]?.expected_payout).toBe("1000000");
    expect(JSON.stringify(stored.rows[0]?.metadata)).toContain('"gasEstimate":"650000"');

    const submission = {
      deploymentKey: deployment.key,
      planHash: plan.integrityHash,
      owner: WALLET,
      chainId: 50_312,
      batchIndex: 0,
      nonce: 7n,
      transactionHash: `0x${"91".repeat(32)}`,
      submittedAt: new Date(WHEN.getTime() + 1_000),
    } as const;
    expect(await repository.recordSubmission(submission)).toMatchObject({ duplicate: false });
    expect(await repository.recordSubmission(submission)).toMatchObject({ duplicate: true });
    await expect(
      repository.recordSubmission({
        ...submission,
        transactionHash: `0x${"92".repeat(32)}`,
      }),
    ).rejects.toThrow("different transaction hash");
    const count = await context.pool.query<{ count: string }>(
      "select count(*) from claim_transactions where claim_id = $1",
      [persisted.claimId],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("leases a submitted claim once, defers it, and finalizes it idempotently", async () => {
    const plan = await readyClaimPlan();
    const repository = new ClaimRepository(context.db);
    const deployment = transitionInput().deployment;
    const { claimId } = await repository.persistReadyPlan({ deployment, plan });
    const transactionHash = `0x${"93".repeat(32)}`;
    const submittedAt = new Date(WHEN.getTime() + 1_000);
    await repository.recordSubmission({
      deploymentKey: deployment.key,
      planHash: plan.integrityHash,
      owner: WALLET,
      chainId: 50_312,
      batchIndex: 0,
      nonce: 8n,
      transactionHash,
      submittedAt,
    });

    const leaseTime = new Date(submittedAt.getTime() + 1_000);
    const leases = await Promise.all([
      repository.leasePendingTransaction({ workerId: "receipt-a", leaseMs: 1_000, now: leaseTime }),
      repository.leasePendingTransaction({ workerId: "receipt-b", leaseMs: 1_000, now: leaseTime }),
    ]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    const first = leases.find((lease) => lease !== null);
    if (first === undefined || first === null) throw new Error("expected a claim lease");
    expect(first).toMatchObject({ claimId, transactionHash, attempts: 1 });
    expect(first.plan.integrityHash).toBe(plan.integrityHash);

    expect(
      await repository.deferReconciliation({
        transactionId: first.id,
        workerId: first.leaseOwner,
        reason: "receipt unavailable",
        delayMs: 500,
        now: leaseTime,
      }),
    ).toBe(true);
    expect(
      await repository.leasePendingTransaction({
        workerId: "receipt-c",
        leaseMs: 1_000,
        now: new Date(leaseTime.getTime() + 499),
      }),
    ).toBeNull();
    const recovered = await repository.leasePendingTransaction({
      workerId: "receipt-c",
      leaseMs: 1_000,
      now: new Date(leaseTime.getTime() + 500),
    });
    if (recovered === null) throw new Error("expected a recovered claim lease");
    expect(recovered).toMatchObject({ id: first.id, attempts: 2, leaseOwner: "receipt-c" });

    const receipt = {
      schemaVersion: "1",
      planHash: plan.integrityHash,
      transactionHash,
      status: "confirmed",
      actualCollateral: "1000000",
    };
    const completedAt = new Date(leaseTime.getTime() + 600);
    expect(
      await repository.completeReconciliation({
        transactionId: recovered.id,
        workerId: recovered.leaseOwner,
        status: "confirmed",
        blockNumber: 478_725_999n,
        gasUsed: 650_001n,
        actualCollateral: 1_000_000n,
        receipt,
        fallbackOwed: 77n,
        now: completedAt,
      }),
    ).toBe(true);
    expect(
      await repository.completeReconciliation({
        transactionId: recovered.id,
        workerId: recovered.leaseOwner,
        status: "confirmed",
        blockNumber: 478_725_999n,
        gasUsed: 650_001n,
        actualCollateral: 1_000_000n,
        receipt,
        fallbackOwed: 77n,
        now: completedAt,
      }),
    ).toBe(false);
    const stored = await context.pool.query<{
      claim_status: string;
      transaction_status: string;
      actual_collateral: string;
      gas_used: string;
      events: string;
    }>(
      `select
        claim.status as claim_status,
        transaction.status as transaction_status,
        transaction.actual_collateral,
        transaction.gas_used,
        (select count(*) from canonical_events where id = $2) as events
      from claims as claim
      join claim_transactions as transaction on transaction.claim_id = claim.id
      where claim.id = $1`,
      [claimId, `claim.confirmed:${transactionHash}`],
    );
    expect(stored.rows[0]).toEqual({
      claim_status: "confirmed",
      transaction_status: "confirmed",
      actual_collateral: "1000000",
      gas_used: "650001",
      events: "1",
    });
    const owedEvents = await context.pool.query<{ events: string }>(
      "select count(*) as events from canonical_events where id = $1",
      [`wallet.payout_owed:${transactionHash}`],
    );
    expect(owedEvents.rows[0]?.events).toBe("1");
    const publicReceipt = await repository.getClaimReceipt(claimId);
    expect(publicReceipt).toMatchObject({
      claimId,
      status: "confirmed",
      expectedPayout: 1_000_000n,
      actualCollateral: 1_000_000n,
      gasUsed: 650_001n,
      transactions: [
        {
          status: "confirmed",
          transactionHash,
          fallbackOwed: 77n,
          receipt,
        },
      ],
    });
  });

  it("leases once under contention and recovers an expired lease after restart", async () => {
    await new ClaimRailStateRepository(context.db).persistWalletTransition(transitionInput());
    const jobs = new OutboxJobRepository(context.db);
    const time = new Date("2026-09-03T12:01:00.000Z");
    const leases = await Promise.all([
      jobs.leaseNext({ workerId: "worker-a", leaseMs: 1_000, now: time }),
      jobs.leaseNext({ workerId: "worker-b", leaseMs: 1_000, now: time }),
    ]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    const first = leases.find((lease) => lease !== null);
    if (first === undefined || first === null) throw new Error("expected a lease");
    expect(
      await jobs.leaseNext({
        workerId: "worker-c",
        leaseMs: 1_000,
        now: new Date(time.getTime() + 999),
      }),
    ).toBeNull();

    await context.close();
    context = createDatabase(databaseUrl!, {
      maxConnections: 8,
      applicationName: "claimrail-test-restarted",
    });
    const recovered = await new OutboxJobRepository(context.db).leaseNext({
      workerId: "worker-c",
      leaseMs: 1_000,
      now: new Date(time.getTime() + 1_001),
    });
    expect(recovered).toMatchObject({ id: first.id, leaseOwner: "worker-c", attempts: 2 });
    expect(await new OutboxJobRepository(context.db).complete(first.id, "worker-c")).toBe(true);
  });

  it("consumes an ownership challenge once and stores an encrypted webhook route", async () => {
    const repository = new SubscriptionRepository(context.db);
    const challengeId = "0d904bb5-4a5f-442d-a3fe-734646d50d58";
    const challengeHash = "ab".repeat(32);
    const createdAt = new Date("2026-09-03T12:00:00.000Z");
    await repository.createWebhookChallenge({
      id: challengeId,
      ownerAddress: WALLET,
      destination: "https://agent.example.test/claimrail",
      eventTypes: ["wallet.claimable", "claim.confirmed"],
      challengeHash,
      expiresAt: new Date(createdAt.getTime() + 60_000),
      createdAt,
    });
    expect(await repository.getPendingChallenge(challengeId)).toMatchObject({
      ownerAddress: WALLET,
      eventTypes: ["wallet.claimable", "claim.confirmed"],
      challengeHash,
    });
    const activated = await repository.activateWebhook({
      challengeId,
      expectedChallengeHash: challengeHash,
      secretHash: "cd".repeat(32),
      secretCiphertext: "v1.iv.tag.ciphertext",
      verifiedAt: new Date(createdAt.getTime() + 1_000),
    });
    expect(activated).toMatchObject({
      ownerAddress: WALLET,
      destination: "https://agent.example.test/claimrail",
      eventTypes: ["wallet.claimable", "claim.confirmed"],
    });
    await expect(
      repository.activateWebhook({
        challengeId,
        expectedChallengeHash: challengeHash,
        secretHash: "cd".repeat(32),
        secretCiphertext: "v1.iv.tag.ciphertext",
        verifiedAt: new Date(createdAt.getTime() + 2_000),
      }),
    ).rejects.toThrow("already used");
    const stored = await context.pool.query<{
      secret_hash: string;
      secret_ciphertext: string;
      audit_count: string;
    }>(
      `select
        subscription.secret_hash,
        subscription.secret_ciphertext,
        (select count(*) from audit_records where subject_id = subscription.id::text) as audit_count
      from subscriptions as subscription
      where subscription.id = $1`,
      [activated.id],
    );
    expect(stored.rows[0]).toEqual({
      secret_hash: "cd".repeat(32),
      secret_ciphertext: "v1.iv.tag.ciphertext",
      audit_count: "1",
    });
  });

  it("activates an encrypted browser route and leases it only to an enabled transport", async () => {
    const repository = new SubscriptionRepository(context.db);
    const challengeId = "1d904bb5-4a5f-442d-a3fe-734646d50d58";
    const challengeHash = "ae".repeat(32);
    const endpointFingerprint = "bf".repeat(32);
    const createdAt = new Date("2026-09-03T12:00:00.000Z");
    await repository.createBrowserChallenge({
      id: challengeId,
      ownerAddress: WALLET,
      endpointFingerprint,
      eventTypes: ["wallet.claimable"],
      subscriptionCiphertext: "v1.browser.encrypted",
      challengeHash,
      expiresAt: new Date(createdAt.getTime() + 60_000),
      createdAt,
    });
    expect(await repository.getPendingBrowserChallenge(challengeId)).toMatchObject({
      endpointFingerprint,
      subscriptionCiphertext: "v1.browser.encrypted",
      eventTypes: ["wallet.claimable"],
    });
    const activated = await repository.activateBrowser({
      challengeId,
      expectedChallengeHash: challengeHash,
      verifiedAt: new Date(createdAt.getTime() + 1_000),
    });
    expect(activated).toMatchObject({
      ownerAddress: WALLET,
      endpointFingerprint,
    });
    await new ClaimRailStateRepository(context.db).persistWalletTransition(transitionInput());
    const deliveries = new DeliveryRepository(context.db);
    expect(await deliveries.materializeEvent(`0x${"78".repeat(32)}`, createdAt)).toBe(1);
    expect(
      await deliveries.leaseNext({
        workerId: "webhook-only",
        leaseMs: 1_000,
        now: createdAt,
      }),
    ).toBeNull();
    const leased = await deliveries.leaseNext({
      workerId: "browser-worker",
      leaseMs: 1_000,
      enabledKinds: ["browser"],
      now: createdAt,
    });
    expect(leased).toMatchObject({
      kind: "browser",
      destination: endpointFingerprint,
      secretCiphertext: "v1.browser.encrypted",
    });
    if (leased === null) throw new Error("expected browser delivery lease");
    expect(
      await deliveries.fail({
        deliveryId: leased.id,
        workerId: leased.leaseOwner,
        attempt: leased.attempt,
        error: "BrowserPushExpired",
        httpStatus: 410,
        terminal: true,
        now: new Date(createdAt.getTime() + 2_000),
      }),
    ).toBe("dead");
    const stored = await context.pool.query<{
      raw_endpoint_count: string;
      audits: string;
      active: boolean;
    }>(
      `select
        (select count(*) from subscriptions where destination like 'https://%') as raw_endpoint_count,
        (select count(*) from audit_records where subject_id = $1::text) as audits,
        (select active from subscriptions where id = $1::uuid) as active`,
      [activated.id],
    );
    expect(stored.rows[0]).toEqual({ raw_endpoint_count: "0", audits: "1", active: false });
  });

  it("consumes a Telegram link once without storing the raw chat ID", async () => {
    const repository = new SubscriptionRepository(context.db);
    const challengeId = "2d904bb5-4a5f-442d-a3fe-734646d50d58";
    const challengeHash = "ce".repeat(32);
    const linkTokenHash = "df".repeat(32);
    const chatFingerprint = "e0".repeat(32);
    const createdAt = new Date("2026-09-03T12:00:00.000Z");
    await repository.createTelegramChallenge({
      id: challengeId,
      ownerAddress: WALLET,
      eventTypes: ["wallet.claimable"],
      challengeHash,
      expiresAt: new Date(createdAt.getTime() + 60_000),
      createdAt,
    });
    expect(await repository.getPendingTelegramChallenge(challengeId)).toMatchObject({
      ownerAddress: WALLET,
      eventTypes: ["wallet.claimable"],
      challengeHash,
    });
    await repository.markTelegramProofVerified({
      challengeId,
      expectedChallengeHash: challengeHash,
      linkTokenHash,
      linkExpiresAt: new Date(createdAt.getTime() + 120_000),
      verifiedAt: new Date(createdAt.getTime() + 1_000),
    });
    expect(
      await repository.activateTelegramLink({
        linkTokenHash: "00".repeat(32),
        chatFingerprint,
        chatCiphertext: "v1.telegram.encrypted",
        now: new Date(createdAt.getTime() + 2_000),
      }),
    ).toBeNull();
    const activated = await repository.activateTelegramLink({
      linkTokenHash,
      chatFingerprint,
      chatCiphertext: "v1.telegram.encrypted",
      now: new Date(createdAt.getTime() + 2_000),
    });
    expect(activated).toEqual({ ownerAddress: WALLET });
    expect(
      await repository.activateTelegramLink({
        linkTokenHash,
        chatFingerprint,
        chatCiphertext: "v1.telegram.encrypted",
        now: new Date(createdAt.getTime() + 3_000),
      }),
    ).toBeNull();
    const stored = await context.pool.query<{
      destination: string;
      secret_ciphertext: string;
      raw_chat_count: string;
      audit_count: string;
    }>(
      `select destination, secret_ciphertext,
        (select count(*) from subscriptions where destination = '123456789') as raw_chat_count,
        (select count(*) from audit_records where subject_id = subscription.id::text) as audit_count
       from subscriptions as subscription where kind = 'telegram'`,
    );
    expect(stored.rows[0]).toEqual({
      destination: chatFingerprint,
      secret_ciphertext: "v1.telegram.encrypted",
      raw_chat_count: "0",
      audit_count: "1",
    });
  });

  it("fans out each canonical event once and retries its webhook independently", async () => {
    const subscriptionsRepository = new SubscriptionRepository(context.db);
    const challengeId = "c742d9c7-b1af-4e14-b90f-bf58355318ad";
    const createdAt = new Date("2026-09-03T12:00:00.000Z");
    await subscriptionsRepository.createWebhookChallenge({
      id: challengeId,
      ownerAddress: WALLET,
      destination: "https://agent.example.test/claimrail",
      eventTypes: ["wallet.claimable"],
      challengeHash: "ef".repeat(32),
      expiresAt: new Date(createdAt.getTime() + 60_000),
      createdAt,
    });
    await subscriptionsRepository.activateWebhook({
      challengeId,
      expectedChallengeHash: "ef".repeat(32),
      secretHash: "cd".repeat(32),
      secretCiphertext: "v1.iv.tag.ciphertext",
      verifiedAt: new Date(createdAt.getTime() + 1_000),
    });
    const persisted = await new ClaimRailStateRepository(context.db).persistWalletTransition(
      transitionInput(),
    );
    const repository = new DeliveryRepository(context.db);
    expect(await repository.materializeEvent(`0x${"78".repeat(32)}`, createdAt)).toBe(1);
    expect(await repository.materializeEvent(`0x${"78".repeat(32)}`, createdAt)).toBe(0);

    const first = await repository.leaseNext({
      workerId: "delivery-a",
      leaseMs: 1_000,
      now: createdAt,
    });
    if (first === null) throw new Error("expected a webhook delivery lease");
    expect(first.event).toMatchObject({
      id: `0x${"78".repeat(32)}`,
      type: "wallet.claimable",
      aggregateId: POSITION,
    });
    expect(first).toMatchObject({ attempt: 1, maxAttempts: 8 });
    expect(
      await repository.fail({
        deliveryId: first.id,
        workerId: first.leaseOwner,
        attempt: first.attempt,
        error: "WebhookHttp503",
        httpStatus: 503,
        signatureVersion: "v1",
        requestTimestamp: 1_788_441_200,
        now: createdAt,
        baseBackoffMs: 100,
      }),
    ).toBe("failed");
    expect(
      await repository.leaseNext({
        workerId: "delivery-b",
        leaseMs: 1_000,
        now: new Date(createdAt.getTime() + 99),
      }),
    ).toBeNull();
    const second = await repository.leaseNext({
      workerId: "delivery-b",
      leaseMs: 1_000,
      now: new Date(createdAt.getTime() + 100),
    });
    if (second === null) throw new Error("expected a retried webhook delivery lease");
    expect(second.attempt).toBe(2);
    expect(
      await repository.complete({
        deliveryId: second.id,
        workerId: second.leaseOwner,
        attempt: second.attempt,
        providerMessageId: "receiver-42",
        httpStatus: 204,
        signatureVersion: "v1",
        requestTimestamp: 1_788_441_201,
        now: new Date(createdAt.getTime() + 110),
      }),
    ).toBe(true);
    const stored = await context.pool.query<{
      status: string;
      attempt_count: number;
      provider_message_id: string;
      count: string;
    }>(
      `select status, attempt_count, provider_message_id,
        (select count(*) from deliveries where event_id = $2) as count
      from deliveries where id = $1`,
      [second.id, persisted.eventCreated ? `0x${"78".repeat(32)}` : "missing"],
    );
    expect(stored.rows[0]).toEqual({
      status: "delivered",
      attempt_count: 2,
      provider_message_id: "receiver-42",
      count: "1",
    });
    const listed = await repository.listForOwner(WALLET);
    expect(listed).toMatchObject({ activeRoutes: 1 });
    expect(listed.deliveries).toHaveLength(1);
    expect(listed.deliveries[0]).toMatchObject({
      id: second.id,
      eventType: "wallet.claimable",
      status: "delivered",
      attemptCount: 2,
    });
    const detail = await repository.getForOwner(second.id, WALLET);
    expect(detail?.attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "failed",
        httpStatus: 503,
        signatureVersion: "v1",
      }),
      expect.objectContaining({
        attempt: 2,
        status: "delivered",
        httpStatus: 204,
        providerMessageId: "receiver-42",
      }),
    ]);
    expect(
      await repository.getForOwner(second.id, "0x0000000000000000000000000000000000000001"),
    ).toBeNull();
  });

  it("queues a clearly labelled route test once per cooldown without pretending it is financial", async () => {
    const subscriptionsRepository = new SubscriptionRepository(context.db);
    const createdAt = new Date("2026-09-03T12:00:00.000Z");
    expect(
      await new DeliveryRepository(context.db).enqueueTestNotification({
        ownerAddress: WALLET,
        now: createdAt,
      }),
    ).toBeNull();
    const challengeId = "d742d9c7-b1af-4e14-b90f-bf58355318ad";
    await subscriptionsRepository.createWebhookChallenge({
      id: challengeId,
      ownerAddress: WALLET,
      destination: "https://agent.example.test/test-route",
      eventTypes: ["wallet.claimable"],
      challengeHash: "f1".repeat(32),
      expiresAt: new Date(createdAt.getTime() + 60_000),
      createdAt,
    });
    await subscriptionsRepository.activateWebhook({
      challengeId,
      expectedChallengeHash: "f1".repeat(32),
      secretHash: "f2".repeat(32),
      secretCiphertext: "v1.iv.tag.ciphertext",
      verifiedAt: createdAt,
    });
    const repository = new DeliveryRepository(context.db);
    const first = await repository.enqueueTestNotification({
      ownerAddress: WALLET,
      now: createdAt,
    });
    expect(first).toMatchObject({ status: "queued", routeCount: 1, deliveryCount: 1 });
    const cooldown = await repository.enqueueTestNotification({
      ownerAddress: WALLET,
      now: new Date(createdAt.getTime() + 30_000),
    });
    expect(cooldown).toMatchObject({
      eventId: first?.eventId,
      status: "cooldown",
      routeCount: 1,
      deliveryCount: 0,
      nextAllowedAt: new Date(createdAt.getTime() + 60_000),
    });
    const stored = await context.pool.query<{
      type: string;
      payload: Record<string, unknown>;
      delivery_count: string;
      audit_count: string;
    }>(
      `select event.type, event.payload,
        (select count(*) from deliveries where event_id = event.id) as delivery_count,
        (select count(*) from audit_records where subject_id = event.id) as audit_count
       from canonical_events as event where event.id = $1`,
      [first?.eventId],
    );
    expect(stored.rows[0]).toMatchObject({
      type: "notification.test",
      payload: {
        owner: WALLET,
        testOnly: true,
        notice:
          "This is a ClaimRail test notification. It is not a market settlement or claimable payout.",
      },
      delivery_count: "1",
      audit_count: "1",
    });
  });

  it("requeues only an owner's dead webhook delivery and records the audit", async () => {
    const subscriptionsRepository = new SubscriptionRepository(context.db);
    const createdAt = new Date("2026-09-03T12:20:00.000Z");
    const challengeId = "cc42d9c7-b1af-4e14-b90f-bf58355318ad";
    await subscriptionsRepository.createWebhookChallenge({
      id: challengeId,
      ownerAddress: WALLET,
      destination: "https://agent.example.test/dead-letter",
      eventTypes: ["wallet.claimable"],
      challengeHash: "aa".repeat(32),
      expiresAt: new Date(createdAt.getTime() + 60_000),
      createdAt,
    });
    await subscriptionsRepository.activateWebhook({
      challengeId,
      expectedChallengeHash: "aa".repeat(32),
      secretHash: "bb".repeat(32),
      secretCiphertext: "v1.iv.tag.ciphertext",
      verifiedAt: createdAt,
    });
    await new ClaimRailStateRepository(context.db).persistWalletTransition(transitionInput());
    const repository = new DeliveryRepository(context.db);
    await repository.materializeEvent(`0x${"78".repeat(32)}`, createdAt);
    await context.pool.query("update deliveries set max_attempts = 1");
    const leased = await repository.leaseNext({
      workerId: "dead-worker",
      leaseMs: 1_000,
      now: createdAt,
    });
    if (leased === null) throw new Error("expected dead-letter delivery lease");
    expect(
      await repository.fail({
        deliveryId: leased.id,
        workerId: leased.leaseOwner,
        attempt: leased.attempt,
        error: "WebhookHttp500",
        httpStatus: 500,
        now: createdAt,
      }),
    ).toBe("dead");
    expect(
      await repository.replayDead({
        deliveryId: leased.id,
        ownerAddress: "0x0000000000000000000000000000000000000001",
        now: new Date(createdAt.getTime() + 1_000),
      }),
    ).toBeNull();
    const replayed = await repository.replayDead({
      deliveryId: leased.id,
      ownerAddress: WALLET,
      now: new Date(createdAt.getTime() + 1_000),
    });
    expect(replayed).toMatchObject({ attemptsRemaining: 8 });
    const stored = await context.pool.query<{
      status: string;
      max_attempts: number;
      audits: string;
    }>(
      `select status, max_attempts,
        (select count(*) from audit_records where subject_id = $1::text) as audits
       from deliveries where id = $1::uuid`,
      [leased.id],
    );
    expect(stored.rows[0]).toEqual({ status: "failed", max_attempts: 9, audits: "1" });
  });

  it("consumes delivery-console challenges once and authenticates scoped tokens", async () => {
    const repository = new AccessRepository(context.db);
    const createdAt = new Date("2026-09-03T12:30:00.000Z");
    const challengeId = "dd42d9c7-b1af-4e14-b90f-bf58355318ad";
    await repository.createChallenge({
      id: challengeId,
      ownerAddress: WALLET,
      purpose: "delivery_console",
      messageHash: "a1".repeat(32),
      expiresAt: new Date(createdAt.getTime() + 60_000),
      createdAt,
    });
    expect(await repository.getPendingChallenge(challengeId)).toMatchObject({
      ownerAddress: WALLET,
      purpose: "delivery_console",
    });
    const token = await repository.consumeAndCreateToken({
      challengeId,
      expectedMessageHash: "a1".repeat(32),
      tokenHash: "b2".repeat(32),
      scopes: ["deliveries:read", "deliveries:replay"],
      expiresAt: new Date(createdAt.getTime() + 120_000),
      now: new Date(createdAt.getTime() + 1_000),
    });
    expect(token.ownerAddress).toBe(WALLET);
    expect(
      await repository.authenticate({
        tokenHash: "b2".repeat(32),
        scope: "deliveries:replay",
        now: new Date(createdAt.getTime() + 2_000),
      }),
    ).toEqual({ ownerAddress: WALLET });
    expect(
      await repository.authenticate({
        tokenHash: "b2".repeat(32),
        scope: "not:granted",
        now: new Date(createdAt.getTime() + 2_000),
      }),
    ).toBeNull();
    await expect(
      repository.consumeAndCreateToken({
        challengeId,
        expectedMessageHash: "a1".repeat(32),
        tokenHash: "c3".repeat(32),
        scopes: ["deliveries:read"],
        expiresAt: new Date(createdAt.getTime() + 120_000),
        now: new Date(createdAt.getTime() + 2_000),
      }),
    ).rejects.toThrow("already used or expired");
    expect(
      await repository.authenticate({
        tokenHash: "b2".repeat(32),
        scope: "deliveries:read",
        now: new Date(createdAt.getTime() + 121_000),
      }),
    ).toBeNull();
  });

  it("backs off failures and dead-letters at the bounded attempt limit", async () => {
    await new ClaimRailStateRepository(context.db).persistWalletTransition(
      transitionInput({ outboxMaxAttempts: 2 }),
    );
    const jobs = new OutboxJobRepository(context.db);
    const start = new Date("2026-09-03T12:02:00.000Z");
    const first = await jobs.leaseNext({ workerId: "worker-a", leaseMs: 1_000, now: start });
    if (first === null) throw new Error("expected first lease");
    expect(
      await jobs.fail({
        jobId: first.id,
        workerId: "worker-a",
        error: "temporary",
        now: start,
        baseBackoffMs: 100,
        maxBackoffMs: 1_000,
      }),
    ).toBe("pending");
    expect(
      await jobs.leaseNext({
        workerId: "worker-b",
        leaseMs: 1_000,
        now: new Date(start.getTime() + 99),
      }),
    ).toBeNull();
    const second = await jobs.leaseNext({
      workerId: "worker-b",
      leaseMs: 1_000,
      now: new Date(start.getTime() + 100),
    });
    if (second === null) throw new Error("expected second lease");
    expect(
      await jobs.fail({
        jobId: second.id,
        workerId: "worker-b",
        error: "permanent",
        now: new Date(start.getTime() + 100),
      }),
    ).toBe("dead");
    expect(
      await jobs.leaseNext({
        workerId: "worker-c",
        leaseMs: 1_000,
        now: new Date(start.getTime() + 10_000),
      }),
    ).toBeNull();
  });
});
