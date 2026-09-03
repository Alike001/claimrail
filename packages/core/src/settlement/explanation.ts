import type { EvidenceValue } from "../evidence/types.js";
import type { BaseUnit, TransactionHash } from "../identity/types.js";
import type { ContractStatus, PayoutVectorRecord } from "../markets/types.js";

export interface SettlementExplanationInput {
  readonly marketQuestion: string;
  readonly rule: string;
  readonly contractStatus: ContractStatus;
  readonly settlementFinalized: boolean;
  readonly openingValue: EvidenceValue<BaseUnit>;
  readonly closingValue: EvidenceValue<BaseUnit>;
  readonly valueDecimals: number;
  readonly winningOutcome: EvidenceValue<0 | 1 | null>;
  readonly voidReason: EvidenceValue<string>;
  readonly payoutVector: EvidenceValue<PayoutVectorRecord>;
  readonly oracleQuestionId: EvidenceValue<string>;
  readonly resolutionTransaction: EvidenceValue<TransactionHash>;
  readonly finalizationTransaction: EvidenceValue<TransactionHash>;
}
