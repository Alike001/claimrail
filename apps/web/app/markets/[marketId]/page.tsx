import { EvidenceScreen } from "../../../src/components/evidence-screen";
import { fixtureExplanation, fixtureMarket } from "../../../src/fixtures/evidence";
import { readMarketSettlement } from "../../../src/server/claimrail";

export const dynamic = "force-dynamic";

export default async function MarketPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ marketId: string }>;
  readonly searchParams: Promise<{ fixture?: string }>;
}) {
  const [{ marketId }, query] = await Promise.all([params, searchParams]);
  if (query.fixture === "1" && process.env.NODE_ENV !== "production")
    return <EvidenceScreen market={fixtureMarket} explanation={fixtureExplanation} fixture />;
  const result = await readMarketSettlement(marketId).catch(() => null);
  if (result === null) {
    return (
      <div className="error-page">
        <h1>Settlement evidence unavailable.</h1>
        <p>
          The market ID is invalid or an upstream source did not answer. ClaimRail will not guess
          missing evidence.
        </p>
        <a href="/">return to inbox</a>
      </div>
    );
  }
  return <EvidenceScreen market={result.market} explanation={result.explanation} />;
}
