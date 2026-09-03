"use client";

import Link from "next/link";
import { useState } from "react";
import { RailMark } from "./rail-mark";

export function Header({
  address,
  active = "inbox",
}: {
  readonly address?: string;
  readonly active?: "inbox" | "history" | "docs";
}) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "observe wallet";
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <RailMark /> <span>claimrail</span>
      </Link>
      <nav aria-label="Primary" className={navigationOpen ? "open" : undefined}>
        <Link className={active === "inbox" ? "active" : undefined} href="/">
          inbox
        </Link>
        {address ? (
          <Link
            className={active === "history" ? "active" : undefined}
            href={`/wallet/${address}/history`}
          >
            history
          </Link>
        ) : (
          <span>history</span>
        )}
        <Link href="/docs#api">developers</Link>
        <Link className={active === "docs" ? "active" : undefined} href="/docs">
          docs
        </Link>
      </nav>
      <div className="network">
        <span className="network-dot" />
        Somnia
      </div>
      <span className="wallet-short">{short}</span>
      <button
        className="menu-button"
        type="button"
        aria-label={navigationOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={navigationOpen}
        onClick={() => setNavigationOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </header>
  );
}
