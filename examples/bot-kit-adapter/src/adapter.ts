import { canonicalDeliveryEventSchema, type CanonicalDeliveryEvent } from "@claimrail/contracts";

export interface OwnerClaimRequest {
  readonly marketId: string;
  readonly event: CanonicalDeliveryEvent;
}

export interface ClaimRailBotCallbacks {
  readonly pauseMarket: (input: {
    readonly marketId: string;
    readonly reason: "locked" | "claimable";
    readonly event: CanonicalDeliveryEvent;
  }) => void | Promise<void>;
  readonly requestOwnerApprovedClaim: (
    input: OwnerClaimRequest,
  ) => Promise<{ readonly claimId: string } | null>;
  readonly resumeMarket: (input: {
    readonly marketId: string;
    readonly claimId: string;
    readonly event: CanonicalDeliveryEvent;
  }) => void | Promise<void>;
  readonly needsAttention?: (input: {
    readonly marketId: string | null;
    readonly claimId: string;
    readonly event: CanonicalDeliveryEvent;
  }) => void | Promise<void>;
}

function stringField(event: CanonicalDeliveryEvent, name: string): string | null {
  const value = event.payload[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function marketId(event: CanonicalDeliveryEvent): string | null {
  return (
    stringField(event, "marketId") ??
    (/^0x[0-9a-fA-F]{64}$/.test(event.aggregateId) ? event.aggregateId : null)
  );
}

function claimId(event: CanonicalDeliveryEvent): string | null {
  return (
    stringField(event, "claimId") ?? (event.aggregateType === "claim" ? event.aggregateId : null)
  );
}

export class DreamDexClaimRailAdapter {
  readonly #callbacks: ClaimRailBotCallbacks;
  readonly #processed = new Set<string>();
  readonly #processedOrder: string[] = [];
  readonly #pausedMarkets = new Set<string>();
  readonly #claimMarkets = new Map<string, string>();

  constructor(callbacks: ClaimRailBotCallbacks) {
    this.#callbacks = callbacks;
  }

  async accept(value: unknown): Promise<void> {
    const event = canonicalDeliveryEventSchema.parse(value);
    if (this.#processed.has(event.id)) return;
    this.#remember(event.id);

    if (event.type === "market.locked") {
      const id = marketId(event);
      if (id === null) return;
      this.#pausedMarkets.add(id);
      await this.#callbacks.pauseMarket({ marketId: id, reason: "locked", event });
      return;
    }

    if (event.type === "wallet.claimable") {
      const id = marketId(event);
      if (id === null) return;
      if (!this.#pausedMarkets.has(id)) {
        this.#pausedMarkets.add(id);
        await this.#callbacks.pauseMarket({ marketId: id, reason: "claimable", event });
      }
      const requested = await this.#callbacks.requestOwnerApprovedClaim({ marketId: id, event });
      if (requested !== null) this.#claimMarkets.set(requested.claimId, id);
      return;
    }

    if (event.type === "claim.confirmed") {
      const claim = claimId(event);
      if (claim === null) return;
      const id = this.#claimMarkets.get(claim);
      if (id === undefined) return;
      this.#claimMarkets.delete(claim);
      this.#pausedMarkets.delete(id);
      await this.#callbacks.resumeMarket({ marketId: id, claimId: claim, event });
      return;
    }

    if (event.type === "claim.failed" || event.type === "claim.superseded") {
      const claim = claimId(event);
      if (claim === null) return;
      await this.#callbacks.needsAttention?.({
        marketId: this.#claimMarkets.get(claim) ?? null,
        claimId: claim,
        event,
      });
    }
  }

  canTrade(market: string): boolean {
    return !this.#pausedMarkets.has(market);
  }

  snapshot() {
    return {
      pausedMarkets: [...this.#pausedMarkets],
      pendingClaims: [...this.#claimMarkets.entries()].map(([claim, market]) => ({
        claimId: claim,
        marketId: market,
      })),
    };
  }

  #remember(id: string): void {
    this.#processed.add(id);
    this.#processedOrder.push(id);
    if (this.#processedOrder.length > 1_000) {
      const oldest = this.#processedOrder.shift();
      if (oldest !== undefined) this.#processed.delete(oldest);
    }
  }
}
