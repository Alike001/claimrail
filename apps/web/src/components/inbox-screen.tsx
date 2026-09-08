"use client";

import type { InboxFilter, InboxViewModel } from "@claimrail/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Header } from "./header";
import { ManualClaimFlow } from "./manual-claim-flow";
import { RailMark } from "./rail-mark";
import { WalletSearch } from "./wallet-search";

const filters: readonly { readonly id: InboxFilter; readonly label: string }[] = [
  { id: "all", label: "all positions" },
  { id: "attention", label: "needs attention" },
  { id: "claimable", label: "ready to claim" },
];

function LifecycleRail({ counts }: { readonly counts: InboxViewModel["counts"] }) {
  const stations = [
    ["live", counts.open, "trading now", "signal"],
    ["waiting", counts.locked, "result pending", "warning"],
    ["settled", counts.resolved, "result recorded", "neutral"],
    ["ready", counts.ready, "funds available", "signal"],
  ] as const;
  return (
    <section className="lifecycle" aria-label="Position lifecycle">
      <div className="track" />
      {stations.map(([name, count, detail, tone]) => (
        <div className={`station ${tone}`} key={name}>
          <span className="station-node">
            <i />
          </span>
          <strong>
            {name} {count}
          </strong>
          <small>{detail}</small>
        </div>
      ))}
    </section>
  );
}

function ClaimTray({
  view,
  open,
  onToggle,
}: {
  readonly view: InboxViewModel;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <aside className={`claim-tray ${open ? "expanded" : ""}`} aria-label="Claim plan preview">
      <button className="tray-handle" type="button" onClick={onToggle} aria-expanded={open}>
        <span className="sr-only">{open ? "Close" : "Review"} claim plan</span>
      </button>
      {open ? (
        <div className="tray-expanded">
          <div className="tray-title">
            <span>claim review</span>
            <span>{view.counts.ready} positions</span>
            <strong>{view.claimable}</strong>
            <button type="button" onClick={onToggle}>
              close
            </button>
          </div>
          <section>
            <h3>{view.fixture ? "ready to claim" : "verified positions"}</h3>
            {view.rows
              .filter((row) => row.filter.includes("claimable"))
              .map((row) => (
                <div className="included" key={row.identity}>
                  <span className="status-square success" />
                  <div>
                    <strong>
                      {row.market} · {row.position.split(" · ")[0]}
                    </strong>
                    <small>result confirmed · amount checked</small>
                  </div>
                  <b>{row.returnValue}</b>
                </div>
              ))}
            <h3>not ready yet</h3>
            <ul className="excluded">
              {view.rows
                .filter((row) => !row.filter.includes("claimable"))
                .map((row) => (
                  <li key={row.identity}>
                    <span className={`status-square ${row.stationTone}`} />
                    {row.market} {row.position.split(" · ")[0]} · {row.reason}
                  </li>
                ))}
            </ul>
          </section>
          {view.fixture ? (
            <section className="transaction-plan">
              <h3>wallet steps</h3>
              <p className="plan-intro">
                You will review each step in your wallet. Funds return directly to the position
                owner.
              </p>
              <div className="steps">
                <span className="active">
                  <i>1</i>
                  allow DreamDEX
                </span>
                <span>
                  <i>2</i>
                  claim funds
                </span>
              </div>
              <details className="technical-details">
                <summary>See technical transaction details</summary>
                <dl>
                  <dt>DreamDEX module</dt>
                  <dd>0x3ecC…e388</dd>
                  <dt>permission scope</dt>
                  <dd>module-wide</dd>
                  <dt>safety simulation</dt>
                  <dd className="success-text">passed</dd>
                  <dt>expected payout</dt>
                  <dd className="success-text">{view.claimable}</dd>
                  <dt>plan hash</dt>
                  <dd>0xb72a…41e9</dd>
                </dl>
              </details>
              <p className="approval-warning">
                <span className="status-square warning" />
                The first step lets DreamDEX use this wallet&apos;s outcome tokens. This permission
                stays active until the owner revokes it.
              </p>
              <button className="primary-action" type="button" disabled>
                allow DreamDEX <span>→</span>
              </button>
              <small className="phase-note">example only · no transaction will be sent</small>
            </section>
          ) : (
            <ManualClaimFlow
              owner={view.address}
              expectedDisplay={view.claimable}
              collateralDecimals={view.collateralDecimals}
              collateralSymbol={view.collateralSymbol}
            />
          )}
          <p className="custody-note">
            proceeds go directly to {view.address.slice(0, 6)}…{view.address.slice(-4)}
            <br />
            ClaimRail never stores your private key.
          </p>
        </div>
      ) : (
        <div className="tray-collapsed">
          <div className="ready-count">
            <RailMark compact /> <strong>{view.counts.ready} ready to claim</strong>
          </div>
          <div className="tray-total">
            <strong>{view.claimable}</strong>
            <small>checked on Somnia at block {view.verifiedBlock}</small>
          </div>
          <button className="primary-action" type="button" onClick={onToggle}>
            review funds <span>→</span>
          </button>
          <small>wallet signature required · no keys stored</small>
        </div>
      )}
    </aside>
  );
}

export function InboxScreen({ view }: { readonly view: InboxViewModel }) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [trayOpen, setTrayOpen] = useState(false);
  const visibleRows = useMemo(
    () => view.rows.filter((row) => row.filter.includes(filter)),
    [view.rows, filter],
  );
  return (
    <div className="app-shell">
      <Header address={view.address} />
      <section className="wallet-band">
        <WalletSearch initialAddress={view.address} />
        <div className="metric">
          <small>ready to claim</small>
          <strong>{view.claimable}</strong>
        </div>
        <div className="metric">
          <small>last checked</small>
          <strong>{view.verifiedBlock}</strong>
        </div>
        <div className="metric provenance">
          <small>
            powered by
            {view.fixture ? <em>fixture · no live funds</em> : null}
          </small>
          <strong>
            DreamDEX <i>·</i> built on Somnia
          </strong>
        </div>
      </section>
      <main className="position-main" id="main-content">
        <section className="position-overview">
          <div className="inbox-heading">
            <div>
              <p className="eyebrow">Your DreamDEX positions</p>
              <h1>See what finished and what you can claim.</h1>
            </div>
            <p>
              ClaimRail checks each position against Somnia, then shows the result and your next
              action in plain language.
            </p>
          </div>
          <LifecycleRail counts={view.counts} />
        </section>
        <div className="position-workspace">
          <section className="inbox" aria-labelledby="position-list-title">
            <div className="position-list-heading">
              <div>
                <p className="eyebrow">Position list</p>
                <h2 id="position-list-title">What your wallet holds</h2>
              </div>
              <span>{view.rows.length} positions found</span>
            </div>
            <div className="tabs" role="tablist" aria-label="Inbox filter">
              {filters.map(({ id, label }) => {
                const count =
                  id === "all"
                    ? view.rows.length
                    : view.rows.filter((row) => row.filter.includes(id)).length;
                return (
                  <button
                    role="tab"
                    aria-selected={filter === id}
                    key={id}
                    onClick={() => setFilter(id)}
                  >
                    {label} {count}
                  </button>
                );
              })}
            </div>
            {view.completeness !== "complete" ? (
              <p className="scan-warning" role="status">
                {view.completeness} scan · totals may be incomplete
              </p>
            ) : null}
            <div className="ledger" role="table" aria-label="Settlement positions">
              <div className="ledger-head" role="row">
                <span>market</span>
                <span>your position</span>
                <span>status</span>
                <span>amount</span>
                <span>details</span>
              </div>
              {visibleRows.map((row) => {
                const [side, quantity] = row.position.split(" · ");
                return (
                  <div className="ledger-row" role="row" key={row.identity}>
                    <span className="market-cell">
                      <i className={`rail-signal ${row.stationTone}`} />
                      <span>
                        <strong>{row.market}</strong>
                        <small>{row.reason}</small>
                      </span>
                    </span>
                    <span className="position-cell" data-label="your position">
                      <strong>{side}</strong>
                      <small>
                        {quantity} contracts · {row.window}
                      </small>
                    </span>
                    <span data-label="status">
                      <i className={`status-square ${row.stationTone}`} />
                      {row.station}
                    </span>
                    <span className={`${row.returnTone}-text`} data-label="amount">
                      {row.returnValue}
                    </span>
                    <span data-label="details">
                      <Link href={`/markets/${row.marketId}${view.fixture ? "?fixture=1" : ""}`}>
                        {row.action}
                      </Link>
                    </span>
                  </div>
                );
              })}
            </div>
            {visibleRows.length === 0 ? (
              <div className="empty-state">No positions in this view.</div>
            ) : null}
          </section>
          <ClaimTray
            view={view}
            open={trayOpen}
            onToggle={() => setTrayOpen((current) => !current)}
          />
        </div>
      </main>
      <footer className="status-footer">
        <span>
          {view.completeness === "complete" ? "index complete" : `index ${view.completeness}`} ·
          updated {new Date(view.observedAt).toLocaleTimeString()}
        </span>
        <span>independent ClaimRail interface</span>
      </footer>
    </div>
  );
}
