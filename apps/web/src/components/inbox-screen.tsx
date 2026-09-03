"use client";

import type { InboxFilter, InboxViewModel } from "@claimrail/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Header } from "./header";
import { ManualClaimFlow } from "./manual-claim-flow";
import { RailMark } from "./rail-mark";
import { WalletSearch } from "./wallet-search";

const filters: readonly { readonly id: InboxFilter; readonly label: string }[] = [
  { id: "all", label: "all" },
  { id: "attention", label: "needs attention" },
  { id: "claimable", label: "claimable" },
];

function LifecycleRail({ counts }: { readonly counts: InboxViewModel["counts"] }) {
  const stations = [
    ["open", counts.open, "trading", "signal"],
    ["locked", counts.locked, "waiting for oracle", "warning"],
    ["resolved", counts.resolved, "result recorded", "neutral"],
    ["ready", counts.ready, "funds can be claimed", "signal"],
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
            <span>claim plan</span>
            <span>{view.counts.ready} positions</span>
            <strong>{view.claimable}</strong>
            <button type="button" onClick={onToggle}>
              close
            </button>
          </div>
          <section>
            <h3>{view.fixture ? "included positions" : "claimable candidates"}</h3>
            {view.rows
              .filter((row) => row.filter.includes("claimable"))
              .map((row) => (
                <div className="included" key={row.identity}>
                  <span className="status-square success" />
                  <div>
                    <strong>
                      {row.market} · {row.position.split(" · ")[0]}
                    </strong>
                    <small>finalized · winner · verified</small>
                  </div>
                  <b>{row.returnValue}</b>
                </div>
              ))}
            <h3>not included</h3>
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
              <h3>transaction plan</h3>
              <div className="steps">
                <span className="active">
                  <i>1</i>
                  approve module
                </span>
                <span>
                  <i>2</i>
                  redeemMany
                </span>
              </div>
              <dl>
                <dt>module</dt>
                <dd>0x3ecC…e388</dd>
                <dt>scope</dt>
                <dd>module-wide</dd>
                <dt>simulation</dt>
                <dd className="success-text">passed</dd>
                <dt>expected payout</dt>
                <dd className="success-text">{view.claimable}</dd>
                <dt>plan hash</dt>
                <dd>0xb72a…41e9</dd>
              </dl>
              <button className="text-link" type="button" disabled>
                inspect calldata
              </button>
              <p className="approval-warning">
                <span className="status-square warning" />
                This grants the DreamDEX binary module access to every outcome-token ID held by this
                wallet. Approval remains active until revoked.
              </p>
              <button className="primary-action" type="button" disabled>
                approve module <span>→</span>
              </button>
              <small className="phase-note">
                manual claiming arrives in Phase 6 · no transaction will be sent
              </small>
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
            <RailMark compact /> <strong>{view.counts.ready} ready</strong>
          </div>
          <div className="tray-total">
            <strong>{view.claimable}</strong>
            <small>
              verified at block {view.verifiedBlock} · {view.counts.ready} entries
            </small>
          </div>
          <button className="primary-action" type="button" onClick={onToggle}>
            review claim <span>→</span>
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
          <small>claimable</small>
          <strong>{view.claimable}</strong>
        </div>
        <div className="metric">
          <small>verified block</small>
          <strong>{view.verifiedBlock}</strong>
        </div>
        <div className="metric provenance">
          <small>
            settlement source
            {view.fixture ? <em>fixture · no live funds</em> : null}
          </small>
          <strong>
            DreamDEX <i>·</i> built on Somnia
          </strong>
        </div>
      </section>
      <LifecycleRail counts={view.counts} />
      <main className="inbox">
        <h1>settlement inbox</h1>
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
            <span>position</span>
            <span>window</span>
            <span>station</span>
            <span>oracle / reason</span>
            <span>return</span>
            <span>evidence</span>
          </div>
          {visibleRows.map((row) => (
            <div className="ledger-row" role="row" key={row.identity}>
              <span className="market-cell">
                <i className={`rail-signal ${row.stationTone}`} />
                {row.market}
              </span>
              <span data-label="position">{row.position}</span>
              <span data-label="window">{row.window}</span>
              <span data-label="station">
                <i className={`status-square ${row.stationTone}`} />
                {row.station}
              </span>
              <span data-label="oracle / reason">{row.reason}</span>
              <span className={`${row.returnTone}-text`} data-label="return">
                {row.returnValue}
              </span>
              <span data-label="evidence">
                <Link href={`/markets/${row.marketId}${view.fixture ? "?fixture=1" : ""}`}>
                  {row.action}
                </Link>
              </span>
            </div>
          ))}
        </div>
        {visibleRows.length === 0 ? (
          <div className="empty-state">No positions at this station.</div>
        ) : null}
      </main>
      <ClaimTray view={view} open={trayOpen} onToggle={() => setTrayOpen((current) => !current)} />
      <footer className="status-footer">
        <span>
          {view.completeness === "complete" ? "index complete" : `index ${view.completeness}`} ·
          observed {new Date(view.observedAt).toLocaleTimeString()}
        </span>
        <span>independent ClaimRail interface</span>
      </footer>
    </div>
  );
}
