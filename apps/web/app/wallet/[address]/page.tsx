import { fixtureInbox } from "../../../src/fixtures/inbox";
import { InboxScreen } from "../../../src/components/inbox-screen";
import { readWalletInbox } from "../../../src/server/claimrail";

export const dynamic = "force-dynamic";

export default async function WalletPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ address: string }>;
  readonly searchParams: Promise<{ fixture?: string }>;
}) {
  const [{ address }, query] = await Promise.all([params, searchParams]);
  if (query.fixture === "1" && process.env.NODE_ENV !== "production")
    return <InboxScreen view={fixtureInbox} />;
  const result = await readWalletInbox(address).catch(() => null);
  if (result === null) {
    return (
      <div className="error-page">
        <h1>Wallet inspection failed.</h1>
        <p>Check the address, then try again. No wallet connection or funds were touched.</p>
        <a href="/">return to lookup</a>
      </div>
    );
  }
  return <InboxScreen view={result.view} />;
}
