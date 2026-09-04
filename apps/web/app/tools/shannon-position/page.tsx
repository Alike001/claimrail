import { notFound } from "next/navigation";
import { Header } from "@/src/components/header";
import { ShannonPositionTool } from "@/src/components/shannon-position-tool";

export default function ShannonPositionToolPage() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.CLAIMRAIL_ENABLE_TEST_POSITION_TOOL !== "true"
  ) {
    notFound();
  }

  return (
    <div className="test-position-shell">
      <Header />
      <main className="test-position-main">
        <header className="test-position-intro">
          <p className="eyebrow">local test tool / Shannon only</p>
          <h1>Open one position. Leave it for ClaimRail.</h1>
          <p>
            This private development screen finds a live DreamDEX Event Contract, builds a trade
            capped at 1 tUSDC, and asks MetaMask to sign it. No private key reaches ClaimRail.
          </p>
        </header>
        <ShannonPositionTool />
      </main>
    </div>
  );
}
