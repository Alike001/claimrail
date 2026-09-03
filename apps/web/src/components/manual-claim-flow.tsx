"use client";

import type { ClaimPrepareResponse, ClaimSubmissionResponse } from "@claimrail/contracts";
import Link from "next/link";
import {
  claimRailBinaryModuleWriteAbi,
  claimRailErc6909WriteAbi,
} from "@claimrail/dreamdex/write-abi";
import { useState, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { SOMNIA_SHANNON_CHAIN_ID } from "../wallet/config";

type FlowStage =
  | "idle"
  | "connecting"
  | "preparing"
  | "approval_required"
  | "approving"
  | "ready"
  | "submitting"
  | "pending_reconciliation"
  | "error";

function short(value: string, start = 8, end = 6) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const possible = error as Error & { shortMessage?: string };
    return possible.shortMessage ?? error.message;
  }
  return "The wallet request could not be completed.";
}

function formatAmount(raw: string, decimals: number, symbol: string) {
  const value = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, 2).padEnd(2, "0");
  return `${whole.toLocaleString("en-US")}.${fraction} ${symbol}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & {
    readonly error?: { readonly message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  return body;
}

export function ManualClaimFlow({
  owner,
  expectedDisplay,
  collateralDecimals,
  collateralSymbol,
}: {
  readonly owner: string;
  readonly expectedDisplay: string;
  readonly collateralDecimals: number;
  readonly collateralSymbol: string;
}) {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const switchChain = useSwitchChain();
  const writer = useWriteContract();
  const publicClient = usePublicClient({ chainId: SOMNIA_SHANNON_CHAIN_ID });
  const [stage, setStage] = useState<FlowStage>("idle");
  const [prepared, setPrepared] = useState<ClaimPrepareResponse>();
  const [message, setMessage] = useState<string>();
  const [transactionHashes, setTransactionHashes] = useState<readonly string[]>([]);
  const [claimIds, setClaimIds] = useState<readonly string[]>([]);
  const [showCalldata, setShowCalldata] = useState(false);

  const connectedOwner = connection.address?.toLowerCase() === owner.toLowerCase();
  const correctChain = connection.chainId === SOMNIA_SHANNON_CHAIN_ID;
  const plan = prepared?.plan;
  const preparedDisplay = plan
    ? formatAmount(plan.expectedPayout, collateralDecimals, collateralSymbol)
    : expectedDisplay;

  async function connectWallet() {
    const connector = connectors[0];
    if (connector === undefined) {
      setMessage("No injected browser wallet was found.");
      setStage("error");
      return;
    }
    setMessage(undefined);
    setStage("connecting");
    try {
      await connect.mutateAsync({ connector, chainId: SOMNIA_SHANNON_CHAIN_ID });
      setStage("idle");
    } catch (error) {
      setMessage(errorMessage(error));
      setStage("error");
    }
  }

  async function prepare(): Promise<ClaimPrepareResponse> {
    setMessage(undefined);
    setStage("preparing");
    const response = await fetch("/api/v1/claims/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner }),
    });
    const result = await parseResponse<ClaimPrepareResponse>(response);
    setPrepared(result);
    setStage(result.status === "ready" ? "ready" : "approval_required");
    return result;
  }

  async function safelyPrepare() {
    try {
      await prepare();
    } catch (error) {
      setMessage(errorMessage(error));
      setStage("error");
    }
  }

  async function approveModule() {
    if (
      prepared?.status !== "approval_required" ||
      publicClient === undefined ||
      !connection.isConnected ||
      !connectedOwner ||
      !correctChain
    )
      return;
    setMessage(undefined);
    setStage("approving");
    try {
      const hash = await writer.mutateAsync({
        account: connection.address,
        chainId: SOMNIA_SHANNON_CHAIN_ID,
        address: prepared.plan.outcomeToken as Address,
        abi: claimRailErc6909WriteAbi,
        functionName: "setOperator",
        args: [prepared.plan.binaryModule as Address, true],
      });
      setMessage(`Approval submitted ${short(hash)}. Waiting for its receipt before replanning.`);
      await publicClient.waitForTransactionReceipt({ hash });
      await prepare();
    } catch (error) {
      setMessage(errorMessage(error));
      setStage("error");
    }
  }

  async function submitClaim() {
    if (publicClient === undefined || !connection.isConnected || !connectedOwner || !correctChain)
      return;
    setMessage(undefined);
    setStage("preparing");
    try {
      const refreshed = await prepare();
      if (refreshed.status !== "ready") return;
      if (Date.now() >= refreshed.plan.expiresAt) throw new Error("The refreshed plan expired.");
      setStage("submitting");
      const hashes: Hex[] = [];
      for (const batch of refreshed.plan.batches) {
        const hash = await writer.mutateAsync({
          account: connection.address,
          chainId: SOMNIA_SHANNON_CHAIN_ID,
          address: refreshed.plan.binaryModule as Address,
          abi: claimRailBinaryModuleWriteAbi,
          functionName: "redeemMany",
          args: [
            refreshed.plan.operatorId,
            refreshed.plan.venueId as Hex,
            batch.entries.map(({ marketId }) => marketId as Hex),
            batch.entries.map(({ outcomeIndex }) => outcomeIndex),
            batch.entries.map(({ amount }) => BigInt(amount)),
          ],
        });
        hashes.push(hash);
        setTransactionHashes([...hashes]);
        const submission = await parseResponse<ClaimSubmissionResponse>(
          await fetch("/api/v1/claims/submissions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              planHash: refreshed.plan.integrityHash,
              owner,
              chainId: refreshed.plan.chainId,
              batchIndex: batch.index,
              transactionHash: hash,
            }),
          }),
        );
        setClaimIds((current) =>
          current.includes(submission.claimId) ? current : [...current, submission.claimId],
        );
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setStage("pending_reconciliation");
      setMessage(
        "Wallet receipt mined. ClaimRail is keeping the claim pending until receipt and post-balance reconciliation complete.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
      setStage("error");
    }
  }

  let action: ReactNode;
  if (!connection.isConnected) {
    action = (
      <button className="primary-action" type="button" onClick={connectWallet}>
        {stage === "connecting" ? "connecting…" : "connect owner wallet"} <span>→</span>
      </button>
    );
  } else if (!connectedOwner) {
    action = (
      <button className="primary-action" type="button" disabled>
        connect the position owner
      </button>
    );
  } else if (!correctChain) {
    action = (
      <button
        className="primary-action"
        type="button"
        onClick={() => switchChain.mutate({ chainId: SOMNIA_SHANNON_CHAIN_ID })}
      >
        switch to Somnia Shannon <span>→</span>
      </button>
    );
  } else if (prepared?.status === "approval_required") {
    action = (
      <button
        className="primary-action"
        type="button"
        disabled={stage === "approving"}
        onClick={approveModule}
      >
        {stage === "approving" ? "confirming approval…" : "approve module"} <span>→</span>
      </button>
    );
  } else if (prepared?.status === "ready") {
    action = (
      <button
        className="primary-action"
        type="button"
        disabled={stage === "submitting" || stage === "preparing"}
        onClick={submitClaim}
      >
        {stage === "submitting" || stage === "preparing"
          ? "verifying fresh plan…"
          : "redeem safely"}{" "}
        <span>→</span>
      </button>
    );
  } else {
    action = (
      <button
        className="primary-action"
        type="button"
        disabled={stage === "preparing"}
        onClick={safelyPrepare}
      >
        {stage === "preparing" ? "checking on-chain state…" : "prepare claim"} <span>→</span>
      </button>
    );
  }

  return (
    <section className="transaction-plan" aria-label="Manual claim transaction plan">
      <h3>transaction plan</h3>
      <div className="steps">
        <span className={prepared?.status === "approval_required" ? "active" : undefined}>
          <i>1</i>
          approve if needed
        </span>
        <span className={prepared?.status === "ready" ? "active" : undefined}>
          <i>2</i>
          redeemMany
        </span>
      </div>
      <dl>
        <dt>owner</dt>
        <dd>{short(owner)}</dd>
        <dt>network</dt>
        <dd>Somnia Shannon · 50312</dd>
        <dt>module</dt>
        <dd>{plan ? short(plan.binaryModule) : "verified during preparation"}</dd>
        <dt>scope</dt>
        <dd>{plan?.approval.scope ?? "module-wide if approval is needed"}</dd>
        <dt>simulation</dt>
        <dd className={prepared?.status === "ready" ? "success-text" : undefined}>
          {prepared?.status === "ready" ? "passed for every batch" : "runs after approval"}
        </dd>
        <dt>expected payout</dt>
        <dd className="success-text">{preparedDisplay}</dd>
        <dt>verified block</dt>
        <dd>{plan?.verifiedBlock ?? "pending"}</dd>
        <dt>expires</dt>
        <dd>
          {plan ? new Date(plan.expiresAt).toLocaleTimeString() : "90 seconds after creation"}
        </dd>
        <dt>plan hash</dt>
        <dd>
          {prepared?.status === "ready" ? short(prepared.plan.integrityHash) : "after simulation"}
        </dd>
      </dl>
      {plan ? (
        <button
          className="text-link"
          type="button"
          onClick={() => setShowCalldata((show) => !show)}
        >
          {showCalldata ? "hide" : "inspect"} exact calldata
        </button>
      ) : null}
      {plan ? (
        <div className="prepared-summary">
          <h4>
            exact plan · {plan.entries.length} included · {plan.exclusions.length} excluded
          </h4>
          {plan.entries.map((entry) => (
            <div key={entry.positionIdentity}>
              <span>
                {short(entry.marketId)} · {entry.outcomeIndex === 0 ? "UP" : "DOWN"}
              </span>
              <strong>
                burn {entry.amount} →{" "}
                {formatAmount(entry.expectedPayout, collateralDecimals, collateralSymbol)}
              </strong>
            </div>
          ))}
          {plan.exclusions.map((excluded) => (
            <div className="excluded-entry" key={`${excluded.marketId}:${excluded.outcomeIndex}`}>
              <span>
                {short(excluded.marketId)} · {excluded.outcomeIndex === 0 ? "UP" : "DOWN"}
              </span>
              <strong>
                excluded · {excluded.reason} · {excluded.detail}
              </strong>
            </div>
          ))}
        </div>
      ) : null}
      {showCalldata && plan ? (
        <pre className="calldata-preview">
          {JSON.stringify(
            plan.batches.map((batch) => ({
              contract: plan.binaryModule,
              function: "redeemMany",
              args: {
                operatorId: plan.operatorId,
                venueId: plan.venueId,
                marketIds: batch.entries.map(({ marketId }) => marketId),
                outcomeIndexes: batch.entries.map(({ outcomeIndex }) => outcomeIndex),
                amounts: batch.entries.map(({ amount }) => amount),
              },
            })),
            null,
            2,
          )}
        </pre>
      ) : null}
      {prepared?.status === "approval_required" ? (
        <p className="approval-warning">
          <span className="status-square warning" />
          This grants the DreamDEX binary module access to every outcome-token ID held by this
          wallet on {short(prepared.plan.outcomeToken)}. It remains active until the owner revokes
          it.
        </p>
      ) : null}
      {!connectedOwner && connection.isConnected ? (
        <p className="flow-error" role="alert">
          Connected wallet {short(connection.address ?? "not connected")} does not own these
          positions. ClaimRail will not prepare or submit its claim.
        </p>
      ) : null}
      {message ? (
        <p className={stage === "error" ? "flow-error" : "flow-message"} role="status">
          {message}
        </p>
      ) : null}
      {transactionHashes.map((hash) => (
        <a
          className="transaction-link"
          href={`https://shannon-explorer.somnia.network/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          key={hash}
        >
          pending claim · {short(hash)} ↗
        </a>
      ))}
      {claimIds.map((claimId) => (
        <Link className="transaction-link" href={`/claims/${claimId}`} key={claimId}>
          open ClaimRail receipt →
        </Link>
      ))}
      {action}
      <small className="phase-note">
        monitoring is read-only · only your wallet signs · no private key reaches ClaimRail
      </small>
    </section>
  );
}
