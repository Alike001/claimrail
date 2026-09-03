import { pgEnum } from "drizzle-orm/pg-core";

export const scanCompletenessEnum = pgEnum("scan_completeness", ["complete", "partial", "failed"]);

export const contractStatusEnum = pgEnum("contract_status", [
  "listed",
  "trading",
  "locked",
  "settling",
  "resolved",
  "voided",
]);

export const marketLifecycleEnum = pgEnum("market_lifecycle", [
  "listed",
  "trading",
  "locked",
  "settling",
  "resolved",
  "voided",
  "finalized",
]);

export const evidenceStatusEnum = pgEnum("evidence_status", [
  "missing",
  "pending",
  "verified",
  "conflicting",
]);

export const positionStateEnum = pgEnum("position_state", [
  "open",
  "locked",
  "winning_unfinalized",
  "claimable",
  "losing",
  "void_refundable",
  "claim_submitted",
  "redeemed",
  "payout_owed",
]);

export const claimStatusEnum = pgEnum("claim_status", [
  "draft",
  "ready",
  "submitted",
  "confirmed",
  "failed",
  "superseded",
]);

export const claimReceiptStatusEnum = pgEnum("claim_receipt_status", [
  "pending",
  "confirmed",
  "failed",
  "superseded",
]);

export const canonicalEventTypeEnum = pgEnum("canonical_event_type", [
  "market.locked",
  "market.resolved",
  "market.finalized",
  "market.voided",
  "wallet.claimable",
  "wallet.payout_owed",
  "claim.plan_created",
  "claim.submitted",
  "claim.confirmed",
  "claim.failed",
  "claim.superseded",
]);

export const jobStatusEnum = pgEnum("job_status", ["pending", "leased", "completed", "dead"]);

export const subscriptionKindEnum = pgEnum("subscription_kind", ["webhook", "browser", "telegram"]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "delivering",
  "delivered",
  "failed",
  "dead",
]);

export const bindingStatusEnum = pgEnum("binding_status", ["pending", "verified", "revoked"]);
