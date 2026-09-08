"use client";

import Link from "next/link";
import { useState } from "react";
import { RailMark } from "./rail-mark";

export function Header({
  address,
  active = "inbox",
  variant = "product",
}: {
  readonly address?: string | undefined;
  readonly active?:
    | "inbox"
    | "history"
    | "notifications"
    | "developer-home"
    | "developer-events"
    | "developer-deliveries"
    | "docs";
  readonly variant?: "product" | "marketing" | "developer";
}) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Check a wallet";
  return (
    <header
      className={`site-header ${variant === "marketing" ? "marketing-header" : ""} ${variant === "developer" ? "developer-header" : ""}`}
    >
      <Link className="brand" href="/">
        <RailMark /> <span>claimrail</span>
      </Link>
      <nav aria-label="Primary" className={navigationOpen ? "open" : undefined}>
        {variant === "marketing" ? (
          <>
            <Link href="#how-it-works">How it works</Link>
            <Link href="#why-claimrail">Why ClaimRail</Link>
            <Link href="#safety">Safety</Link>
            <Link href="/developers">For developers</Link>
          </>
        ) : variant === "developer" ? (
          <>
            <Link className={active === "developer-home" ? "active" : undefined} href="/developers">
              Overview
            </Link>
            <Link
              className={active === "developer-events" ? "active" : undefined}
              href="/developers/events"
            >
              Event tester
            </Link>
            <Link
              className={active === "developer-deliveries" ? "active" : undefined}
              href="/developers/deliveries"
            >
              Deliveries
            </Link>
            <Link href="/docs#api">API reference</Link>
            <Link href="/">Back to app</Link>
          </>
        ) : (
          <>
            <Link className={active === "inbox" ? "active" : undefined} href="/">
              Positions
            </Link>
            {address ? (
              <Link
                className={active === "history" ? "active" : undefined}
                href={`/wallet/${address}/history`}
              >
                History
              </Link>
            ) : (
              <span>History</span>
            )}
            <Link
              className={active === "notifications" ? "active" : undefined}
              href="/notifications"
            >
              Alerts
            </Link>
            <Link className={active === "docs" ? "active" : undefined} href="/docs">
              Learn
            </Link>
          </>
        )}
      </nav>
      <div className="network">
        <span className="network-dot" />
        Somnia testnet
      </div>
      {variant === "marketing" ? (
        <Link className="wallet-short marketing-cta" href="#wallet-lookup">
          {short}
        </Link>
      ) : (
        <span className="wallet-short">{short}</span>
      )}
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
