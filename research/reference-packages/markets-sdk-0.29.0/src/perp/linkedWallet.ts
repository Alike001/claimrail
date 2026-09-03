// The unified trading account — reading the linked-wallet funding rail (DEX-2361).
//
// PERP-ONLY, and CHAIN TIER throughout: every read here goes to a contract, and that
// stays true now that the rail's events ARE indexed. The split is by question, not by
// what happens to be available: "what is outstanding right now" is a bank read, because
// the claim is live state that a replayed log can only approximate. HISTORY — every pull,
// settle and return — is the indexer's, in `PerpMarginPull` and `PerpMainFundingEvent`.
//
// Those two tables landed after this module did, so a caller wanting the ledger over time
// reads them rather than reconstructing it from these. Note they are split by SIDE and
// must not be summed together: one pull emits a pool event AND a bank event for the same
// wei. See their schema notes.
//
// WHY THIS EXISTS AT ALL. True isolation on perps needs one account per isolated
// position — "isolated margin" is single-market confinement, not a per-position
// collateral bucket — so N isolated positions mean N wallets. That used to make every
// sub-account its own treasury operation. Linking the wallets lets a child's
// position-increasing order draw the shortfall from its MAIN's wallet, so one treasury
// serves N buckets.
//
// TWO LAYERS, AND THEY ARE NOT THE SAME QUESTION.
//
//   1. The registry (`LinkedWalletRegistry`) is the CONSENT graph — who is linked to
//      whom. Being linked grants no authority over funds by itself.
//   2. The bank (`MarginBank`) is the MONEY layer, and it is what has to be armed:
//      until `getLinkedWalletRegistry()` is non-zero the rail is dormant and no child
//      can draw on any main no matter what the registry says.
//
// So "are we linked" and "will this order spend my main's wallet" are different reads,
// and {@link quotePerpFundingPayer} answers the second one directly rather than making
// a caller compose the first with an arming check.

import type { Address, PublicClient } from "viem";
import * as ReadsAbi from "../readsAbi.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 *  Whether a child's next position-increasing order would draw on a main's wallet,
 *  and whose.
 *
 *  A discriminated union rather than a bare address, because zero from
 *  `quoteFundingPayer` collapses three genuinely different situations that a UI must
 *  not render identically: the rail is dormant, this wallet is unlinked, or this
 *  wallet IS a main. Narrow on `funded` first.
 *
 * @category perpetual markets
 */
export type PerpFundingPayer =
  | {
      /** A main would be debited for whatever this account's own wallet cannot cover. */
      funded: true;
      /**
       *  The main whose wallet would be debited. This is the live resolution, not the
       *  snapshot a past pull recorded — see {@link PerpMainFunding.payer} for that,
       *  and note the two can differ after an unlink and re-link.
       */
      payer: Address;
    }
  | {
      /**
       *  No main would be debited. `reason` says which of the three cases applies;
       *  only `unlinked` is something the user can change by linking.
       */
      funded: false;
      /**
       *  - `dormant` — the bank holds no registry address, so the feature is off for
       *    everyone on this deployment. Linking would not help.
       *  - `unlinked` — the rail is armed but this wallet has no main.
       *  - `isMain` — this wallet resolves to itself. Mains fund children, not the
       *    reverse; funding flows main->child only.
       */
      reason: "dormant" | "unlinked" | "isMain";
    };

/**
 *  The outstanding claim against a child, and who it is owed to.
 *
 *  What a main funds can be BORROWED, NEVER WITHDRAWN: `withdraw` pays the child at
 *  most `balance - principal`, so a compromised child key can trade the money and lose
 *  it but cannot take it out.
 *
 * @category perpetual markets
 */
export interface PerpMainFunding {
  /**
   *  Principal a main has funded and not yet recovered, in collateral units. Zero
   *  means nothing is outstanding.
   *
   *  It is NOT a segregated bucket. The child's own money and its main's are one
   *  fungible balance, and the claim is clamped to `min(principal, balance)` at flat
   *  moments — so the child's own contribution is the JUNIOR tranche and a loss eats
   *  it first. A child that genuinely lost the money does not owe it forever.
   */
  principal: bigint;
  /**
   *  The payer recorded AT FUNDING TIME, or zero when nothing is outstanding.
   *
   *  Snapshotted deliberately: both routes home settle against this address, so an
   *  unlink or re-link between the pull and the repayment cannot misroute the money to
   *  whoever happens to be linked later. When this disagrees with the LIVE resolution
   *  ({@link PerpFundingPayer}), THIS is who gets repaid.
   */
  payer: Address;
  /**
   *  How much of `principal` the child could withdraw: always zero while a claim
   *  stands, and present as a field only so a caller does not have to re-derive the
   *  rule from prose. Included because "why can I not withdraw my balance" is the
   *  commonest question this surface has to answer.
   */
  readonly withdrawableFromPrincipal: 0n;
}

/**
 *  A link group, with the maturity the raw graph does not carry.
 *
 *  `maturesAt` matters for a reason worth stating: ADL netting is gated on maturity so
 *  that a link armed in reaction to an impending auto-deleveraging cannot buy netting
 *  credit. The FUNDING rail deliberately reads the raw graph instead, because the main
 *  proposed the link and owns the allowance, and there is no analogous surprise. So a
 *  link can be fundable and not yet mature — do not use `maturesAt` to decide whether
 *  a pull will happen.
 *
 * @category perpetual markets
 */
export interface PerpWalletLinkage {
  /** The group's main. Zero when the wallet is unlinked. */
  main: Address;
  /** The main plus every child. Empty when the wallet is unlinked. */
  members: readonly Address[];
  /** Unix seconds the link was formed, or 0. */
  linkedAt: bigint;
  /** Unix seconds the link becomes mature FOR ADL NETTING, or 0. Not a funding gate. */
  maturesAt: bigint;
  /** Convenience: whether this wallet is a child (has a main that is not itself). */
  isChild: boolean;
  /** Convenience: whether this wallet is a main with at least one child. */
  isMain: boolean;
}

/**
 *  The registry the bank resolves links through, or `null` while the rail is dormant.
 *
 *  Chain tier. Read this from the BANK rather than from a deployment manifest: the
 *  bank is what decides which registry is authoritative, and a registry nobody has
 *  armed is inert. `null` here means every other read in this module will report
 *  "not funded" regardless of what any registry contains.
 */
export async function getPerpLinkedWalletRegistry(
  marginBank: Address,
  client: PublicClient,
): Promise<Address | null> {
  const registry = await client.readContract({
    address: marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "getLinkedWalletRegistry",
  });
  return registry === ZERO_ADDRESS ? null : registry;
}

/**
 *  Will this account's next position-increasing order spend a main's wallet, and whose?
 *
 *  Chain tier. Two reads, because the contract's single zero cannot distinguish
 *  "dormant" from "unlinked" and a UI has to: one of those is the user's to fix by
 *  linking, the other is not.
 *
 *  The arming check is done FIRST and short-circuits, so a deployment with the rail off
 *  costs one read and never reports a misleading `unlinked`.
 */
export async function quotePerpFundingPayer(
  marginBank: Address,
  account: Address,
  client: PublicClient,
): Promise<PerpFundingPayer> {
  const registry = await getPerpLinkedWalletRegistry(marginBank, client);
  if (registry === null) return { funded: false, reason: "dormant" };

  const payer = await client.readContract({
    address: marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "quoteFundingPayer",
    args: [account],
  });
  if (payer !== ZERO_ADDRESS) return { funded: true, payer };

  // The bank returned zero with the rail armed, so it is the graph that declines. Ask
  // the registry which way: a wallet that resolves to ITSELF is a main (funding flows
  // main->child only), and anything else is genuinely unlinked.
  const main = await client.readContract({
    address: registry,
    abi: ReadsAbi.linkedWalletRegistryReadAbi,
    functionName: "mainOf",
    args: [account],
  });
  return { funded: false, reason: main === account ? "isMain" : "unlinked" };
}

/**
 *  What a main has funded into a child and not yet recovered.
 *
 *  Chain tier, two reads batched. Safe to call on any account — a wallet that has
 *  never been funded reports zero principal and a zero payer rather than reverting.
 */
export async function getPerpMainFunding(
  marginBank: Address,
  account: Address,
  client: PublicClient,
): Promise<PerpMainFunding> {
  const bank = { address: marginBank, abi: ReadsAbi.marginBankReadAbi } as const;
  const [principal, payer] = await Promise.all([
    client.readContract({ ...bank, functionName: "getMainFundedPrincipal", args: [account] }),
    client.readContract({ ...bank, functionName: "getMainFundingPayer", args: [account] }),
  ]);
  return { principal, payer, withdrawableFromPrincipal: 0n };
}

/**
 *  What a wallet could actually contribute to a pull right now — `min(balance,
 *  allowance)`, in collateral units.
 *
 *  Chain tier. This is why a child holding no ERC20 approval contributes zero rather
 *  than reverting the order: the rail SIZES its own contribution with this figure
 *  instead of attempting a transfer and failing.
 *
 *  Read it two ways, and they answer different questions. On the MAIN it is the ceiling
 *  on what its children can collectively draw — and the number a main reduces to revoke
 *  the rail without unlinking, since consent is the allowance. On the CHILD it is how
 *  much of its own money it will burn before reaching its main's.
 */
export async function getPerpWalletPullCapacity(
  marginBank: Address,
  wallet: Address,
  client: PublicClient,
): Promise<bigint> {
  return client.readContract({
    address: marginBank,
    abi: ReadsAbi.marginBankReadAbi,
    functionName: "quoteWalletCapacity",
    args: [wallet],
  });
}

/**
 *  A wallet's link group and its ADL-netting maturity.
 *
 *  Chain tier, one read. Takes the REGISTRY address, not the bank — resolve it with
 *  {@link getPerpLinkedWalletRegistry} so a dormant deployment is visible as such
 *  rather than as an empty group.
 *
 *  `isChild` / `isMain` are derived here because the raw encoding is a trap: a main
 *  resolves to ITSELF in `mainOf`, so the natural test `main !== zero` is true for
 *  mains and children alike.
 */
export async function getPerpWalletLinkage(
  registry: Address,
  wallet: Address,
  client: PublicClient,
): Promise<PerpWalletLinkage> {
  const linkage = await client.readContract({
    address: registry,
    abi: ReadsAbi.linkedWalletRegistryReadAbi,
    functionName: "linkageOf",
    args: [wallet],
  });
  const main = linkage.main;
  const linked = main !== ZERO_ADDRESS;
  return {
    main,
    members: linkage.members,
    linkedAt: BigInt(linkage.linkedAt),
    maturesAt: BigInt(linkage.maturesAt),
    isChild: linked && main !== wallet,
    isMain: linked && main === wallet && linkage.members.length > 1,
  };
}

/**
 *  Every child of a main, excluding the main itself.
 *
 *  Chain tier. Bounded by the registry's `maxChildren`, so this is the list of isolated
 *  buckets one treasury currently serves.
 */
export async function listPerpLinkedChildren(
  registry: Address,
  main: Address,
  client: PublicClient,
): Promise<readonly Address[]> {
  return client.readContract({
    address: registry,
    abi: ReadsAbi.linkedWalletRegistryReadAbi,
    functionName: "childrenOf",
    args: [main],
  });
}

/**
 *  How many children one main may hold — the cap on isolated buckets per treasury.
 *
 *  Chain tier. Worth reading before offering to link another wallet, since the cap is
 *  owner-tunable and a client that hardcodes it will offer a link the registry refuses.
 */
export async function getPerpMaxLinkedChildren(registry: Address, client: PublicClient): Promise<bigint> {
  return client.readContract({
    address: registry,
    abi: ReadsAbi.linkedWalletRegistryReadAbi,
    functionName: "maxChildren",
  });
}
