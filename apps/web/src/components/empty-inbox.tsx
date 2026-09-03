import { Header } from "./header";
import { WalletSearch } from "./wallet-search";

export function EmptyInbox() {
  return (
    <div className="app-shell empty-shell">
      <Header />
      <main className="lookup">
        <div>
          <h1>Follow a position from trade to payout.</h1>
          <p>
            Inspect any public DreamDEX wallet without connecting it. ClaimRail verifies settlement
            against Somnia before calling funds claimable.
          </p>
          <WalletSearch />
        </div>
        <div className="lookup-rail" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
      </main>
      <footer className="status-footer">
        <span>read-only public lookup</span>
        <span>independent ClaimRail interface</span>
      </footer>
    </div>
  );
}
