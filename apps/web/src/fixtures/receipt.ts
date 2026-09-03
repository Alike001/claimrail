import type { ClaimReceiptResponse } from "@claimrail/contracts";

export const RECEIPT_FIXTURE_ID = `claim:0x${"12".repeat(32)}`;

export const receiptFixture: ClaimReceiptResponse = {
  schemaVersion: "1",
  claimId: RECEIPT_FIXTURE_ID,
  planHash: `0x${"12".repeat(32)}`,
  chainId: 50_312,
  owner: "0xa8059aae0157bdfd1a05fe1ecabf7364a7893fb5",
  recipient: "0xa8059aae0157bdfd1a05fe1ecabf7364a7893fb5",
  status: "confirmed",
  expectedPayout: "1494000000",
  actualCollateral: "1494000000",
  gasUsed: "1420000",
  submittedAt: "2026-09-03T12:01:40.000Z",
  confirmedAt: "2026-09-03T12:03:20.000Z",
  blockNumber: "478572322",
  transactions: [
    {
      batchIndex: 0,
      nonce: "7",
      transactionHash: "0xa0eeb1bf54a449c92ccd5b0e847faf21e77dfcfecf5a17df113ee0e2e5f896fb",
      status: "confirmed",
      attempts: 1,
      submittedAt: "2026-09-03T12:01:40.000Z",
      confirmedAt: "2026-09-03T12:03:20.000Z",
      blockNumber: "478572322",
      gasUsed: "1420000",
      actualCollateral: "1494000000",
      fallbackOwed: "0",
      receipt: {
        schemaVersion: "1",
        entries: [
          {
            marketId: "0x00000000000000000000000000000000000000000000000000000000000121ed",
            outcomeIndex: 0,
            amountBurned: "1494000000",
            actualCollateral: "1494000000",
          },
        ],
        evidenceLinks: [
          "https://shannon-explorer.somnia.network/tx/0xa0eeb1bf54a449c92ccd5b0e847faf21e77dfcfecf5a17df113ee0e2e5f896fb",
        ],
        verification: {
          postBalances: [
            {
              tokenId: "4874552181458820275566616024331342572547006279496190115371908761519360",
              balance: "0",
            },
          ],
          postSettlementBacking: [{ marketKey: "74221", backing: "6000000" }],
        },
      },
    },
  ],
};
