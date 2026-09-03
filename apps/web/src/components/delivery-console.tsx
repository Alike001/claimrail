"use client";

import type {
  AccessVerificationResponse,
  DeliveryConsoleChallengeResponse,
  DeliveryDetailResponse,
  DeliveryListItem,
  DeliveryListResponse,
  DeliveryReplayResponse,
} from "@claimrail/contracts";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useConnect, useConnection, useConnectors, useSignMessage } from "wagmi";
import { Header } from "./header";

type Filter = "all" | "pending" | "retrying" | "dead" | "delivered";

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const walletError = error as Error & { shortMessage?: string };
    return walletError.shortMessage ?? error.message;
  }
  return "The delivery console request failed.";
}

async function parseResponse<Value>(response: Response): Promise<Value> {
  const body = (await response.json()) as Value & {
    readonly error?: { readonly message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

function short(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatTime(value: string | null) {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function deliveryMatches(item: DeliveryListItem, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "pending") return item.status === "pending" || item.status === "delivering";
  if (filter === "retrying") return item.status === "failed";
  return item.status === filter;
}

function fixtureDetailFor(
  delivery: DeliveryListItem,
  template: DeliveryDetailResponse,
): DeliveryDetailResponse {
  if (delivery.id === template.id) return template;
  const attemptStatus =
    delivery.status === "delivered"
      ? "delivered"
      : delivery.status === "delivering"
        ? "delivering"
        : "failed";
  return {
    ...delivery,
    schemaVersion: "1",
    event: {
      id: delivery.eventId,
      schemaVersion: "1",
      type: delivery.eventType,
      aggregateType: delivery.eventType.split(".")[0] ?? "event",
      aggregateId: delivery.eventId,
      occurredAt: delivery.createdAt,
      payload: { wallet: delivery.owner, fixture: true },
      sourceTransactionHash: null,
      sourceLogIndex: null,
      blockNumber: template.event.blockNumber,
    },
    attempts:
      delivery.attemptCount === 0 || delivery.lastAttemptAt === null
        ? []
        : [
            {
              attempt: delivery.attemptCount,
              status: attemptStatus,
              httpStatus: delivery.status === "delivered" ? 204 : 503,
              providerMessageId: delivery.status === "delivered" ? "fixture-request" : null,
              error: delivery.lastError,
              signatureVersion: "v1",
              requestTimestamp: Math.floor(new Date(delivery.lastAttemptAt).getTime() / 1_000),
              startedAt: delivery.lastAttemptAt,
              finishedAt: delivery.lastAttemptAt,
            },
          ],
  };
}

function Status({ value }: { readonly value: DeliveryListItem["status"] }) {
  return (
    <span className={`delivery-status status-${value}`}>
      <i aria-hidden="true" /> {value === "failed" ? "retrying" : value}
    </span>
  );
}

function EmptyInspector() {
  return (
    <section className="delivery-empty-inspector">
      <span>↳</span>
      <div>
        <h2>Select a delivery</h2>
        <p>Inspect its signed canonical event, every attempt, and any retry failure.</p>
      </div>
    </section>
  );
}

function DeliveryInspector({
  detail,
  fixture,
  replaying,
  onReplay,
}: {
  readonly detail: DeliveryDetailResponse;
  readonly fixture: boolean;
  readonly replaying: boolean;
  readonly onReplay: () => void;
}) {
  return (
    <section className="delivery-inspector" aria-label="Selected delivery inspector">
      <div className="delivery-facts">
        <p className="panel-kicker">delivery record</p>
        <dl>
          <dt>delivery ID</dt>
          <dd title={detail.id}>{detail.id}</dd>
          <dt>canonical event ID</dt>
          <dd>{detail.eventId}</dd>
          <dt>event type</dt>
          <dd>{detail.eventType}</dd>
          <dt>channel</dt>
          <dd>{detail.kind}</dd>
          <dt>owner</dt>
          <dd>{detail.owner}</dd>
          <dt>endpoint</dt>
          <dd className="protocol-text">{detail.destination}</dd>
          <dt>created at</dt>
          <dd>{new Date(detail.createdAt).toISOString()}</dd>
          <dt>signature</dt>
          <dd className="valid-copy">● {detail.attempts.at(-1)?.signatureVersion ?? "not sent"}</dd>
        </dl>
      </div>
      <div className="attempt-panel">
        <p className="panel-kicker">attempt timeline</p>
        <ol>
          {[...detail.attempts].reverse().map((attempt) => (
            <li key={attempt.attempt}>
              <i aria-hidden="true" />
              <div>
                <strong>attempt {attempt.attempt}</strong>
                <time>{formatTime(attempt.startedAt)} UTC</time>
                <small>{attempt.error ?? "Destination accepted the event"}</small>
              </div>
              <b>{attempt.httpStatus ?? "…"}</b>
            </li>
          ))}
        </ol>
        {detail.status === "dead" ? (
          <p className="dead-note">max attempts reached · dead letter</p>
        ) : null}
      </div>
      <div className="response-panel">
        <p className="panel-kicker">last response</p>
        <dl>
          <dt>status code</dt>
          <dd>{detail.attempts.at(-1)?.httpStatus ?? "—"}</dd>
          <dt>signature</dt>
          <dd>{detail.attempts.at(-1)?.signatureVersion ?? "—"}</dd>
          <dt>request time</dt>
          <dd>{detail.attempts.at(-1)?.requestTimestamp ?? "—"}</dd>
        </dl>
        <pre>{detail.lastError ?? "No delivery error recorded."}</pre>
      </div>
      <div className="payload-panel">
        <p className="panel-kicker">canonical payload</p>
        <pre>{JSON.stringify(detail.event, null, 2)}</pre>
        <button
          className="replay-button"
          type="button"
          disabled={detail.status !== "dead" || replaying || fixture}
          onClick={onReplay}
        >
          {replaying ? "requeueing…" : "▷ replay dead letter"}
        </button>
        <small>
          {fixture
            ? "fixture mode · replay intentionally disabled"
            : detail.status === "dead"
              ? "creates a new delivery attempt; never moves funds"
              : "replay unlocks only after the delivery reaches dead-letter state"}
        </small>
      </div>
    </section>
  );
}

export function DeliveryConsole({
  fixtureList,
  fixtureDetail,
}: {
  readonly fixtureList?: DeliveryListResponse;
  readonly fixtureDetail?: DeliveryDetailResponse;
}) {
  const fixture = fixtureList !== undefined;
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const signMessage = useSignMessage();
  const [accessToken, setAccessToken] = useState<string>();
  const [authorizedOwner, setAuthorizedOwner] = useState<string>();
  const [list, setList] = useState<DeliveryListResponse | undefined>(fixtureList);
  const [detail, setDetail] = useState<DeliveryDetailResponse | undefined>(fixtureDetail);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<"idle" | "connecting" | "authorizing" | "loading" | "replaying">(
    "idle",
  );
  const [message, setMessage] = useState<string>();

  const sessionMismatch =
    !fixture &&
    authorizedOwner !== undefined &&
    (connection.address === undefined ||
      connection.address.toLowerCase() !== authorizedOwner.toLowerCase());
  const consoleList = sessionMismatch ? undefined : list;
  const visible = useMemo(
    () => consoleList?.deliveries.filter((item) => deliveryMatches(item, filter)) ?? [],
    [consoleList, filter],
  );

  async function connectWallet() {
    const connector = connectors[0];
    if (connector === undefined) {
      setMessage("No injected browser wallet was found.");
      return;
    }
    setBusy("connecting");
    setMessage(undefined);
    try {
      await connect.mutateAsync({ connector });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy("idle");
    }
  }

  async function loadDeliveries(token: string) {
    const loaded = await parseResponse<DeliveryListResponse>(
      await fetch("/api/v1/deliveries", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    );
    setList(loaded);
    setDetail(undefined);
  }

  async function authorize() {
    if (connection.address === undefined) return;
    setBusy("authorizing");
    setMessage(undefined);
    try {
      const challenge = await parseResponse<DeliveryConsoleChallengeResponse>(
        await fetch("/api/v1/access/challenges", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner: connection.address }),
        }),
      );
      const signature = await signMessage.mutateAsync({ message: challenge.message });
      const access = await parseResponse<AccessVerificationResponse>(
        await fetch("/api/v1/access/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            message: challenge.message,
            signature,
          }),
        }),
      );
      setAccessToken(access.accessToken);
      setAuthorizedOwner(access.owner);
      await loadDeliveries(access.accessToken);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy("idle");
    }
  }

  async function inspect(delivery: DeliveryListItem) {
    if (fixture && fixtureDetail !== undefined) {
      setDetail(fixtureDetailFor(delivery, fixtureDetail));
      return;
    }
    if (accessToken === undefined) return;
    setBusy("loading");
    setMessage(undefined);
    try {
      setDetail(
        await parseResponse<DeliveryDetailResponse>(
          await fetch(`/api/v1/deliveries/${delivery.id}`, {
            headers: { authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          }),
        ),
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy("idle");
    }
  }

  async function replay() {
    if (accessToken === undefined || detail === undefined || detail.status !== "dead") return;
    setBusy("replaying");
    setMessage(undefined);
    try {
      const replayed = await parseResponse<DeliveryReplayResponse>(
        await fetch(`/api/v1/deliveries/${detail.id}/replay`, {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
        }),
      );
      setMessage(
        `Dead letter requeued. ${replayed.attemptsRemaining} delivery attempts are available.`,
      );
      await loadDeliveries(accessToken);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy("idle");
    }
  }

  const unlocked = fixture || consoleList !== undefined;
  return (
    <div className="delivery-console-shell">
      <Header address={connection.address ?? consoleList?.owner} active="developers" />
      <main className="delivery-console-main">
        <section className="console-head">
          <div>
            <p className="eyebrow">developer operations</p>
            <h1>Developer Delivery Console</h1>
            <p>Inspect signed webhook delivery and replay dead letters.</p>
            <Link href="/notifications">← notification routes</Link>
          </div>
          {consoleList ? (
            <dl className="console-summary">
              <div>
                <dt>active routes</dt>
                <dd>{consoleList.summary.activeRoutes}</dd>
              </div>
              <div>
                <dt>pending</dt>
                <dd>{consoleList.summary.pending}</dd>
              </div>
              <div>
                <dt>retrying</dt>
                <dd>{consoleList.summary.retrying}</dd>
              </div>
              <div>
                <dt>dead</dt>
                <dd>{consoleList.summary.dead}</dd>
              </div>
            </dl>
          ) : (
            <section className="console-lock">
              <span>owner-only operational data</span>
              <strong>
                {connection.address ? short(connection.address) : "wallet proof required"}
              </strong>
              {connection.address === undefined ? (
                <button type="button" onClick={connectWallet} disabled={busy !== "idle"}>
                  {busy === "connecting" ? "connecting…" : "connect wallet"} →
                </button>
              ) : (
                <button type="button" onClick={authorize} disabled={busy !== "idle"}>
                  {busy === "authorizing" ? "check wallet…" : "sign to inspect"} →
                </button>
              )}
              <small>15-minute access · no gas · no financial authority</small>
            </section>
          )}
        </section>
        {fixture ? (
          <p className="fixture-banner">verified UI fixture · no live delivery data</p>
        ) : null}
        {sessionMismatch ? (
          <p className="console-message" role="status">
            Wallet changed. Sign again to inspect this owner&apos;s deliveries.
          </p>
        ) : null}
        {message ? (
          <p className="console-message" role="status">
            {message}
          </p>
        ) : null}
        {unlocked && consoleList ? (
          <>
            <section className="delivery-ledger">
              <div className="delivery-tabs" aria-label="Filter deliveries">
                {(["all", "pending", "retrying", "dead", "delivered"] as const).map((value) => (
                  <button
                    key={value}
                    className={filter === value ? "active" : undefined}
                    type="button"
                    onClick={() => setFilter(value)}
                  >
                    {value}{" "}
                    <span>
                      {value === "all" ? consoleList.summary.total : consoleList.summary[value]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="delivery-table-wrap">
                <table className="delivery-table">
                  <thead>
                    <tr>
                      <th>event type</th>
                      <th>owner</th>
                      <th>endpoint</th>
                      <th>status</th>
                      <th>attempts</th>
                      <th>last attempt</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => (
                      <tr key={item.id} className={detail?.id === item.id ? "selected" : undefined}>
                        <td>
                          <span className="event-indicator" />
                          {item.eventType}
                        </td>
                        <td>{short(item.owner)}</td>
                        <td title={item.destination}>
                          {item.kind === "webhook" ? "" : `${item.kind}:`}
                          {short(item.destination, 29, 8)}
                        </td>
                        <td>
                          <Status value={item.status} />
                        </td>
                        <td>
                          {item.attemptCount}/{item.maxAttempts}
                        </td>
                        <td>{formatTime(item.lastAttemptAt)}</td>
                        <td>
                          <button type="button" onClick={() => inspect(item)}>
                            inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visible.length === 0 ? (
                  <p className="delivery-empty">No deliveries in this state.</p>
                ) : null}
              </div>
            </section>
            {detail ? (
              <DeliveryInspector
                detail={detail}
                fixture={fixture}
                replaying={busy === "replaying"}
                onReplay={replay}
              />
            ) : (
              <EmptyInspector />
            )}
          </>
        ) : null}
      </main>
      <footer className="status-footer docs-footer">
        <span>claimrail / delivery operations</span>
        <span>owner-scoped · canonical events · signed webhooks</span>
      </footer>
    </div>
  );
}
