import type { LegalDecision } from "./legalDecision.js";
import type { LegalModuleInput } from "./legalTypes.js";
import type { LegalExceptionResult, LegalFinding } from "./legalResult.js";

export type LegalModuleEvaluationInput = Readonly<{
  moduleId: string;
  intelligence: import("../intelligence/intelligenceContext.js").IntelligenceContext;
}>;

export interface LegalModule {
  readonly id: string;
  readonly title: string;
  readonly articleIds: readonly number[];
  applies(input: LegalModuleEvaluationInput): boolean;
  evaluate(input: LegalModuleEvaluationInput): LegalDecision;
  exceptions(input: LegalModuleEvaluationInput, decision: LegalDecision): readonly LegalExceptionResult[];
  buildFinding(input: LegalModuleEvaluationInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null;
}

export function isLegalModuleInput(input: LegalModuleInput): input is LegalModuleEvaluationInput {
  return Boolean(input && typeof input.moduleId === "string");
}
