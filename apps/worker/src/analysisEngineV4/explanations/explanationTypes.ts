import type { ConceptCollection } from "../concepts/conceptTypes.js";
import type { EvidenceCollection } from "../evidence/evidenceTypes.js";
import type { LegalDecisionCollection } from "../legal/legalDecision.js";
import type { VerifiedEvidence } from "../evidence/evidenceTypes.js";

export type ExplanationRecommendedAction =
  | "Delete"
  | "Modify"
  | "Requires Approval"
  | "Refer to Authority"
  | "Requires Verification"
  | "No Action";

export type ExplanationRecord = Readonly<{
  id: string;
  legalDecisionId: string;
  conceptId: string;
  evidenceId: string;
  title: string;
  summary: string;
  reasoning: readonly string[];
  recommendedAction: ExplanationRecommendedAction;
  confidence: number;
}>;

export type ExplanationValidationResult = Readonly<{
  status: "pass" | "reject";
  rejectedReasons: readonly string[];
}>;

export type ExplanationCollection = Readonly<{
  sceneId: string;
  explanations: readonly ExplanationRecord[];
  primaryExplanationId: string | null;
  primaryExplanation: ExplanationRecord | null;
  prompt: string;
  response: string;
  validationResult: ExplanationValidationResult;
  confidence: number;
  executionTimeMs: number;
}>;

export type ExplanationEngineInput = Readonly<{
  sceneId: string;
  sceneSummary: string;
  evidenceCollection: EvidenceCollection | null;
  verifiedEvidence: VerifiedEvidence | null;
  conceptCollection: ConceptCollection | null;
  legalDecisionCollection: LegalDecisionCollection | null;
}>;
