import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAddress } from "viem";

const INDEXER_URL = process.env.INDEXER_URL?.trim() || "https://dev.smk.somnia.host/v1/graphql";
const DEFAULT_WALLET = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";

const query = `
  query ClaimRailOutcomeBalancePage($account: String!, $limit: Int!, $offset: Int!) {
    OutcomeBalance(
      where: { account: { _eq: $account }, balance: { _gt: "0" } }
      order_by: { id: asc }
      limit: $limit
      offset: $offset
    ) {
      id
      account
      outcomeIndex
      tokenId
      balance
      market {
        id
        marketAddress
        poolAddress
        asset
        question
        clobStatus
        expiry
        winningOutcome
        voided
        quoteDecimals
        intervalSec
      }
    }
  }
`;

type PositionRow = {
  id: string;
  account: string;
  outcomeIndex: number;
  tokenId: string;
  balance: string;
  market: Record<string, unknown> | null;
};

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

async function fetchPage(account: string, limit: number, offset: number): Promise<PositionRow[]> {
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { account, limit, offset } }),
  });
  if (!response.ok) throw new Error(`Indexer returned HTTP ${response.status}`);
  const body = await response.json() as {
    data?: { OutcomeBalance?: PositionRow[] };
    errors?: Array<{ message?: string }>;
  };
  if (body.errors?.length) throw new Error(body.errors.map((error) => error.message ?? "GraphQL error").join("; "));
  if (!body.data?.OutcomeBalance) throw new Error("Indexer response omitted OutcomeBalance");
  return body.data.OutcomeBalance;
}

async function main(): Promise<void> {
  const account = getAddress(option("--wallet") ?? DEFAULT_WALLET).toLowerCase();
  const pageSize = positiveInteger(option("--page-size"), 100, "--page-size");
  const maxPages = positiveInteger(option("--max-pages"), 100, "--max-pages");
  const startedAt = new Date();
  const runId = startedAt.toISOString().replaceAll(":", "-").replace(".", "-");
  const rows: PositionRow[] = [];
  const pages: Array<{ offset: number; count: number; firstId: string | null; lastId: string | null }> = [];
  let complete = false;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const pageRows = await fetchPage(account, pageSize, offset);
    pages.push({
      offset,
      count: pageRows.length,
      firstId: pageRows[0]?.id ?? null,
      lastId: pageRows.at(-1)?.id ?? null,
    });
    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      complete = true;
      break;
    }
  }

  const ids = rows.map((row) => row.id);
  const uniqueIds = new Set(ids);
  const uniqueTokenIds = new Set(rows.map((row) => row.tokenId));
  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    method: "read-only paginated GraphQL query; no wallet connection or transaction",
    indexerUrl: INDEXER_URL,
    account,
    pageSize,
    maxPages,
    complete,
    totalRows: rows.length,
    uniqueRows: uniqueIds.size,
    uniqueTokenIds: uniqueTokenIds.size,
    duplicateRowIds: rows.length - uniqueIds.size,
    orderedIdSha256: createHash("sha256").update(ids.join("\n")).digest("hex"),
    pages,
    rows,
  };

  const outputDirectory = resolve("evidence", "pagination", runId);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "outcome-balances.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report, rows: undefined }, null, 2)}\nEvidence written to ${outputDirectory}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
