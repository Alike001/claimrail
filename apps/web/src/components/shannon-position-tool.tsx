"use client";

import {
  isBinaryMarket,
  ORDER_TYPE,
  SOMNIA_TESTNET_ADDRESSES,
  SomniaMarkets,
  type BinaryBuySide,
  type UnifiedMarket,
} from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { useRef, useState } from "react";
import { formatUnits, type Address, type Hash, type WalletClient } from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { SOMNIA_SHANNON_CHAIN_ID } from "../wallet/config";

const INDEXER_URL = "https://dev.smk.somnia.host/v1/graphql";
const WS_RPC_URL = "wss://api.infra.testnet.somnia.network/ws";
const TEST_USDC: Address = (() => {
  const address = SOMNIA_TESTNET_ADDRESSES.testUsdc;
  if (address === undefined) {
    throw new Error("The pinned DreamDEX SDK does not define Shannon test collateral.");
  }
  return address;
})();
const TEST_COLLATERAL = TEST_USDC.toLowerCase();
const DREAMDEX_TEST_VENUE = "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c";
const STAKE = 1_000_000n;
const MINIMUM_SECONDS_LEFT = 180;

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type Direction = "up" | "down";
type ToolStage =
  "idle" | "finding" | "ready" | "preparing" | "approving" | "trading" | "complete" | "error";

interface PositionPlan {
  readonly marketId: `0x${string}`;
  readonly symbol: string;
  readonly asset: string;
  readonly interval: string;
  readonly expiry: number;
  readonly secondsRemaining: number;
  readonly pool: Address;
  readonly side: BinaryBuySide;
  readonly direction: Direction;
  readonly quantity: bigint;
  readonly limitPrice: bigint;
  readonly yesPrice: bigint;
  readonly escrow: bigint;
}

interface CompletedPosition {
  readonly marketId: string;
  readonly transactionHash: Hash;
  readonly approvalHash?: Hash;
  readonly direction: Direction;
  readonly filled: bigint;
  readonly expectedTokenId: bigint;
}

function short(value: string, start = 8, end = 6) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const possible = error as Error & { shortMessage?: string };
    return possible.shortMessage ?? error.message;
  }
  return "The operation could not be completed.";
}

function createExchange(walletClient?: WalletClient) {
  return new SomniaMarkets({
    chain: somniaShannon,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    indexerUrl: INDEXER_URL,
    wsRpcUrl: WS_RPC_URL,
    ...(walletClient === undefined ? {} : { walletClient }),
  });
}

function isDreamDexCandidate(market: UnifiedMarket, now: number): boolean {
  if (!market.active || !isBinaryMarket(market.info)) return false;
  return (
    market.info.status === "Trading" &&
    market.info.collateral.toLowerCase() === TEST_COLLATERAL &&
    market.info.venueId?.toLowerCase() === DREAMDEX_TEST_VENUE &&
    Number(market.info.expiry) - now >= MINIMUM_SECONDS_LEFT &&
    Number(market.info.intervalSec) >= 300
  );
}

function candidateOrder(left: UnifiedMarket, right: UnifiedMarket): number {
  if (!isBinaryMarket(left.info) || !isBinaryMarket(right.info)) return 0;
  const preferredInterval = (seconds: number) =>
    seconds === 900 ? 0 : seconds === 3600 ? 1 : seconds === 300 ? 2 : 3;
  return (
    preferredInterval(Number(left.info.intervalSec)) -
      preferredInterval(Number(right.info.intervalSec)) ||
    Number(left.info.expiry) - Number(right.info.expiry) ||
    left.symbol.localeCompare(right.symbol)
  );
}

async function buildPlan(direction: Direction, marketId?: string): Promise<PositionPlan> {
  const exchange = createExchange();
  const side: BinaryBuySide = direction === "up" ? "BUY_YES" : "BUY_NO";
  try {
    const markets = Object.values(await exchange.loadMarkets(true));
    const now = Math.floor(Date.now() / 1000);
    const candidates = markets
      .filter((market) => isDreamDexCandidate(market, now))
      .filter(
        (market) =>
          marketId === undefined ||
          (isBinaryMarket(market.info) &&
            market.info.marketId.toLowerCase() === marketId.toLowerCase()),
      )
      .sort(candidateOrder);

    for (const market of candidates) {
      if (!isBinaryMarket(market.info)) continue;
      const onchain = await exchange.client.getMarketOnchain(market.info.marketId);
      if (
        onchain.status !== 1 ||
        onchain.finalized ||
        Number(onchain.expiry) - Math.floor(Date.now() / 1000) < MINIMUM_SECONDS_LEFT
      ) {
        continue;
      }

      const watch = await exchange.client.watchMarket(onchain.pool);
      try {
        const quote = await exchange.client.quoteBinaryStake({
          marketId: market.info.marketId,
          side,
          stake: STAKE,
        });
        if (quote === null || quote.quantity <= 0n || quote.escrow > STAKE) continue;
        return {
          marketId: market.info.marketId as `0x${string}`,
          symbol: market.symbol,
          asset: market.info.asset,
          interval: market.info.interval ?? `${Number(market.info.intervalSec) / 60}m`,
          expiry: Number(onchain.expiry),
          secondsRemaining: Number(onchain.expiry) - Math.floor(Date.now() / 1000),
          pool: onchain.pool,
          side,
          direction,
          quantity: quote.quantity,
          limitPrice: quote.limitPrice,
          yesPrice: quote.yesPrice,
          escrow: quote.escrow,
        };
      } finally {
        watch.stop();
      }
    }
    throw new Error(
      marketId === undefined
        ? `No liquid ${direction.toUpperCase()} market has at least three minutes remaining. Try Preview again when the next window opens.`
        : "That market is no longer safely tradable. Build a new preview.",
    );
  } finally {
    await exchange.close();
  }
}

export function ShannonPositionTool() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const switchChain = useSwitchChain();
  const publicClient = usePublicClient({ chainId: SOMNIA_SHANNON_CHAIN_ID });
  const walletClient = useWalletClient({ chainId: SOMNIA_SHANNON_CHAIN_ID });
  const [direction, setDirection] = useState<Direction>("up");
  const [stage, setStage] = useState<ToolStage>("idle");
  const [plan, setPlan] = useState<PositionPlan>();
  const [completed, setCompleted] = useState<CompletedPosition>();
  const [message, setMessage] = useState<string>();
  const submissionLock = useRef(false);

  const correctChain = connection.chainId === SOMNIA_SHANNON_CHAIN_ID;

  async function connectWallet() {
    const connector = connectors[0];
    if (connector === undefined) {
      setMessage("No injected browser wallet was found.");
      setStage("error");
      return;
    }
    setMessage(undefined);
    try {
      await connect.mutateAsync({ connector, chainId: SOMNIA_SHANNON_CHAIN_ID });
      setStage("idle");
    } catch (error) {
      setMessage(errorMessage(error));
      setStage("error");
    }
  }

  async function preview() {
    setMessage(undefined);
    setCompleted(undefined);
    setStage("finding");
    try {
      const next = await buildPlan(direction);
      setPlan(next);
      setStage("ready");
    } catch (error) {
      setPlan(undefined);
      setMessage(errorMessage(error));
      setStage("error");
    }
  }

  async function openPosition() {
    if (
      plan === undefined ||
      publicClient === undefined ||
      walletClient.data === undefined ||
      connection.address === undefined ||
      !correctChain ||
      submissionLock.current
    ) {
      return;
    }

    submissionLock.current = true;
    setCompleted(undefined);
    setStage("preparing");
    setMessage("Preparing exactly one order. Click nothing else while MetaMask opens.");
    const exchange = createExchange(walletClient.data as WalletClient);
    let completedSuccessfully = false;
    try {
      if ((await publicClient.getChainId()) !== SOMNIA_SHANNON_CHAIN_ID) {
        throw new Error("RPC safety check failed: the selected client is not Shannon chain 50312.");
      }

      const fresh = await buildPlan(direction, plan.marketId);
      const [balance, allowance] = await Promise.all([
        publicClient.readContract({
          address: TEST_USDC,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [connection.address],
        }),
        publicClient.readContract({
          address: TEST_USDC,
          abi: erc20Abi,
          functionName: "allowance",
          args: [connection.address, fresh.pool],
        }),
      ]);
      if (balance < fresh.escrow) {
        throw new Error(
          `This wallet has ${formatUnits(balance, 6)} tUSDC but the protected order needs ${formatUnits(fresh.escrow, 6)} tUSDC.`,
        );
      }

      let approvalHash: Hash | undefined;
      if (allowance < fresh.escrow) {
        setStage("approving");
        setMessage(
          `MetaMask will approve only ${formatUnits(fresh.escrow, 6)} tUSDC for this market pool.`,
        );
        approvalHash = await walletClient.data.writeContract({
          account: connection.address,
          chain: somniaShannon,
          address: TEST_USDC,
          abi: erc20Abi,
          functionName: "approve",
          args: [fresh.pool, fresh.escrow],
        });
        const approvalReceipt = await publicClient.waitForTransactionReceipt({
          hash: approvalHash,
        });
        if (approvalReceipt.status !== "success") throw new Error("The tUSDC approval reverted.");
      }

      setStage("trading");
      setMessage(
        `Approval is ready. Confirm the ${fresh.direction.toUpperCase()} order; its maximum loss is ${formatUnits(fresh.escrow, 6)} tUSDC.`,
      );
      const onchain = await exchange.client.getMarketOnchain(fresh.marketId);
      if (onchain.status !== 1 || onchain.finalized) {
        throw new Error(
          "The market locked before submission. Build a new preview; no trade was sent.",
        );
      }
      const result = await exchange.trader.placeOrder({
        pool: fresh.pool,
        side: fresh.side,
        price: fresh.yesPrice,
        quantity: fresh.quantity,
        orderType: ORDER_TYPE.MARKET,
        expireTimestampNs: BigInt(fresh.expiry) * 1_000_000_000n,
        autoApprove: false,
      });
      if (result.receipt.status !== "success") throw new Error("The DreamDEX order reverted.");
      const filled = result.fills.reduce((total, fill) => total + fill.quantityFilled, 0n);
      if (filled <= 0n) {
        throw new Error(
          `Order ${result.hash} confirmed but the quote moved before it arrived, so no position was filled. Preview again.`,
        );
      }

      const expectedTokenId = direction === "up" ? onchain.yesId : onchain.noId;
      setCompleted({
        marketId: fresh.marketId,
        transactionHash: result.hash,
        ...(approvalHash === undefined ? {} : { approvalHash }),
        direction,
        filled,
        expectedTokenId,
      });
      completedSuccessfully = true;
      setPlan(fresh);
      setMessage("Position confirmed on Shannon. Leave it open and do not redeem it yet.");
      setStage("complete");
    } catch (error) {
      setMessage(errorMessage(error));
      setStage("error");
    } finally {
      if (!completedSuccessfully) submissionLock.current = false;
      await exchange.close();
    }
  }

  let primaryAction;
  if (!connection.isConnected) {
    primaryAction = (
      <button className="primary-action" type="button" onClick={connectWallet}>
        connect MetaMask <span>→</span>
      </button>
    );
  } else if (!correctChain) {
    primaryAction = (
      <button
        className="primary-action"
        type="button"
        onClick={() => switchChain.mutate({ chainId: SOMNIA_SHANNON_CHAIN_ID })}
      >
        switch to Shannon <span>→</span>
      </button>
    );
  } else if (plan === undefined || plan.direction !== direction || stage === "error") {
    primaryAction = (
      <button
        className="primary-action"
        type="button"
        disabled={stage === "finding"}
        onClick={preview}
      >
        {stage === "finding" ? "finding a live market…" : "preview 1 tUSDC position"} <span>→</span>
      </button>
    );
  } else if (stage === "complete") {
    primaryAction = (
      <button className="primary-action" type="button" disabled>
        position confirmed
      </button>
    );
  } else {
    primaryAction = (
      <button
        className="primary-action"
        type="button"
        disabled={stage === "preparing" || stage === "approving" || stage === "trading"}
        onClick={openPosition}
      >
        {stage === "preparing"
          ? "preparing one order…"
          : stage === "approving"
            ? "confirm exact approval…"
            : stage === "trading"
              ? "confirm position…"
              : `open ${direction} position`}{" "}
        <span>→</span>
      </button>
    );
  }

  return (
    <section className="test-position-workspace" aria-label="Shannon test position creator">
      <div className="test-position-controls">
        <div>
          <p className="eyebrow">choose a direction</p>
          <div className="direction-control" role="group" aria-label="Position direction">
            {(["up", "down"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                className={direction === choice ? "selected" : undefined}
                disabled={
                  stage === "preparing" ||
                  stage === "approving" ||
                  stage === "trading" ||
                  stage === "complete"
                }
                onClick={() => {
                  setDirection(choice);
                  setPlan(undefined);
                  setMessage(undefined);
                }}
              >
                <span>{choice === "up" ? "▲" : "▼"}</span>
                {choice}
              </button>
            ))}
          </div>
        </div>
        <dl className="test-wallet-state">
          <dt>wallet</dt>
          <dd>{connection.address ? short(connection.address) : "not connected"}</dd>
          <dt>network</dt>
          <dd className={correctChain ? "success-text" : undefined}>
            {correctChain ? "Shannon · 50312" : "connect to Shannon"}
          </dd>
          <dt>maximum stake</dt>
          <dd>1.000000 tUSDC</dd>
        </dl>
      </div>

      <div className="test-position-plan">
        <p className="eyebrow">fresh transaction plan</p>
        {plan ? (
          <dl>
            <dt>market</dt>
            <dd>{plan.asset} closes at or above its opening price</dd>
            <dt>direction</dt>
            <dd>{plan.direction.toUpperCase()}</dd>
            <dt>window</dt>
            <dd>{plan.interval}</dd>
            <dt>time remaining</dt>
            <dd>{Math.max(0, Math.floor(plan.secondsRemaining / 60))} minutes at preview</dd>
            <dt>market ID</dt>
            <dd title={plan.marketId}>{short(plan.marketId, 12, 8)}</dd>
            <dt>pool</dt>
            <dd title={plan.pool}>{short(plan.pool)}</dd>
            <dt>protected limit</dt>
            <dd>{formatUnits(plan.limitPrice, 6)} tUSDC per contract</dd>
            <dt>expected contracts</dt>
            <dd>{formatUnits(plan.quantity, 6)}</dd>
            <dt>maximum loss</dt>
            <dd>{formatUnits(plan.escrow, 6)} tUSDC</dd>
          </dl>
        ) : (
          <p className="test-position-empty">
            Preview reads the current book and verifies the market directly on-chain. It sends no
            transaction.
          </p>
        )}
        {message ? (
          <p className={stage === "error" ? "flow-error" : "flow-message"} role="status">
            {message}
          </p>
        ) : null}
        {completed ? (
          <div className="test-position-result">
            <strong>Save these public identifiers</strong>
            <code>{completed.marketId}</code>
            <a
              href={`https://shannon-explorer.somnia.network/tx/${completed.transactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              position transaction · {completed.transactionHash} ↗
            </a>
            <span>
              {completed.direction.toUpperCase()} · {formatUnits(completed.filled, 6)} contracts ·
              token ID {completed.expectedTokenId.toString()}
            </span>
          </div>
        ) : null}
        <p className="single-submit-warning">
          Click the action once, then wait. MetaMask can take up to 30 seconds to appear.
        </p>
        {primaryAction}
        <small className="phase-note">
          local development only · Shannon chain 50312 · exact allowance · no private key input
        </small>
      </div>
    </section>
  );
}
