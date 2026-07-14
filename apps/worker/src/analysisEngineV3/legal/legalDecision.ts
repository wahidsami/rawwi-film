import type { LegalDecision } from "./legalResult.js";
import type { LegalEvaluationStatus } from "./legalTypes.js";
import { createLegalDecision } from "./legalResult.js";

export type { LegalDecision } from "./legalResult.js";
export type LegalDecisionStatus = LegalEvaluationStatus;
export { createLegalDecision } from "./legalResult.js";

export function finalizeLegalDecision(decision: LegalDecision): LegalDecision {
  return createLegalDecision(decision);
}
