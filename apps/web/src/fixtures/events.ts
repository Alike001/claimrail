import {
  canonicalDeliveryEventSchema,
  signWebhook,
  type CanonicalDeliveryEvent,
  type WebhookEnvelope,
} from "@claimrail/contracts";

export interface EventPlaygroundFixture {
  readonly label: string;
  readonly happened: string;
  readonly consumerAction: string;
  readonly evidence: string;
  readonly event: CanonicalDeliveryEvent;
}

export interface EventPlaygroundSample {
  readonly secret: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly rawBody: string;
}

export const eventPlaygroundDemoSecret = "claimrail-playground-secret-not-for-production";

const marketId = "0x0000000000000000000000000000000000000000000000000000000000012222";
const claimableMarketId = "0x0000000000000000000000000000000000000000000000000000000000010269";
const finalizationHash = "0x70b3ae3ca63478ee5e7064e16992fda677a2d69136bb85dc34ce1aa1d35aea04";
const redemptionHash = "0xa0eeb1bf54a449c92ccd5b0e847faf21e77dfcfecf5a17df113ee0e2e5f896fb";

function event(value: CanonicalDeliveryEvent): CanonicalDeliveryEvent {
  return canonicalDeliveryEventSchema.parse(value);
}

export const eventPlaygroundFixtures: readonly EventPlaygroundFixture[] = [
  {
    label: "protocol settlement",
    happened: "DreamDEX finalized the market with outcome 0 paying the full payout vector.",
    consumerAction: "Stop waiting for the oracle and refresh every position in this market.",
    evidence: "fixtures/dreamdex/live/shannon-50312/finalized-market.json",
    event: event({
      id: "evt_shannon_market_12222_finalized",
      schemaVersion: "1",
      type: "market.finalized",
      aggregateType: "market",
      aggregateId: marketId,
      occurredAt: "2026-09-03T10:23:00.000Z",
      payload: {
        chainId: 50312,
        marketId,
        winningOutcome: 0,
        payoutNumerators: ["10000000", "0"],
        payoutDenominator: "10000000",
        netBacking: "1500000000",
      },
      sourceTransactionHash: finalizationHash,
      sourceLogIndex: 61,
      blockNumber: "478578871",
    }),
  },
  {
    label: "wallet settlement",
    happened: "A complete wallet scan found a finalized winning balance worth 2,970 USDso.",
    consumerAction: "Notify the owner or ask ClaimRail to build a fresh owner-signed claim plan.",
    evidence: "fixtures/dreamdex/live/shannon-50312/claimable-wallet.json",
    event: event({
      id: "evt_shannon_wallet_e1da_claimable_10269_1",
      schemaVersion: "1",
      type: "wallet.claimable",
      aggregateType: "position",
      aggregateId: `${claimableMarketId}:1:0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477`,
      occurredAt: "2026-09-03T10:29:15.580Z",
      payload: {
        chainId: 50312,
        wallet: "0xe1da3bdd4189fdefb2ef8a73bd37a4083f284477",
        marketId: claimableMarketId,
        outcomeIndex: 1,
        verifiedBalance: "2970000000",
        expectedPayout: "2970000000",
        settlementFinalized: true,
      },
      sourceTransactionHash: null,
      sourceLogIndex: null,
      blockNumber: "478582638",
    }),
  },
  {
    label: "receipt reconciliation",
    happened: "The settlement contract burned the winning tokens and returned 1,494 USDso.",
    consumerAction: "Mark the claim complete, issue a receipt, and allow a paused bot to resume.",
    evidence: "fixtures/dreamdex/live/shannon-50312/redemption-receipts.json",
    event: event({
      id: "evt_shannon_claim_a0eeb_confirmed",
      schemaVersion: "1",
      type: "claim.confirmed",
      aggregateType: "claim",
      aggregateId: `claim:${redemptionHash}`,
      occurredAt: "2026-09-03T10:24:32.078Z",
      payload: {
        chainId: 50312,
        claimId: `claim:${redemptionHash}`,
        wallet: "0xa8059aae0157bdfd1a05fe1ecabf7364a7893fb5",
        marketId,
        outcomeIndex: 0,
        amountBurned: "1494000000",
        collateralOut: "1494000000",
        transactionHash: redemptionHash,
      },
      sourceTransactionHash: redemptionHash,
      sourceLogIndex: 3,
      blockNumber: "478572322",
    }),
  },
] as const;

export async function createEventPlaygroundSample(
  index: number,
  now = Math.floor(Date.now() / 1_000),
): Promise<EventPlaygroundSample> {
  const fixture = eventPlaygroundFixtures[index];
  if (fixture === undefined) throw new RangeError("Unknown event playground sample");
  const envelope: WebhookEnvelope = {
    schemaVersion: "1",
    deliveryId: `019b9c85-92ac-7000-8000-00000000000${index + 1}`,
    attempt: 1,
    sentAt: new Date(now * 1_000).toISOString(),
    event: fixture.event,
  };
  const rawBody = JSON.stringify(envelope, null, 2);
  return {
    secret: eventPlaygroundDemoSecret,
    timestamp: String(now),
    signature: await signWebhook({
      secret: eventPlaygroundDemoSecret,
      timestamp: now,
      body: rawBody,
    }),
    rawBody,
  };
}
