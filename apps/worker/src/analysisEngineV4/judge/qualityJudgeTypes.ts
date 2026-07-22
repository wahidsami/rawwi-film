import type {
  SceneAnalysisConceptCollection,
  SceneAnalysisExplanationCollection,
  SceneAnalysisEvidenceCollection,
  SceneAnalysisLegalDecisionCollection,
} from "../sceneAnalysisState.js";

export type QualityJudgeStatus = "pass" | "reject" | "needs_review";

export type QualityJudgeRuleId =
  | "evidence_exists"
  | "evidence_grounded"
  | "evidence_identity_consistent"
  | "concept_links_evidence"
  | "legal_originates_from_concept"
  | "explanation_is_grounded"
  | "explanation_no_hallucination"
  | "evidence_snippet_exact"
  | "duplicate_detection"
  | "confidence_threshold";

export type QualityJudgeRuleEvaluation = Readonly<{
  ruleId: QualityJudgeRuleId;
  label: string;
  passed: boolean;
  reason: string;
  evidenceId: string | null;
  conceptId: string | null;
  legalDecisionId: string | null;
  explanationId: string | null;
}>;

export type VerifiedFinding = Readonly<{
  findingId: string;
  evidenceId: string;
  conceptId: string;
  legalDecisionId: string;
  explanationId: string;
  verificationResult: QualityJudgeStatus;
  verificationReasons: readonly string[];
  overallConfidence: number;
}>;

export type QualityJudgeReport = Readonly<{
  sceneId: string;
  totalFindings: number;
  passCount: number;
  rejectCount: number;
  needsReviewCount: number;
  duplicateMergedCount: number;
  overallStatus: QualityJudgeStatus;
  overallConfidence: number;
  ruleEvaluations: readonly QualityJudgeRuleEvaluation[];
  rejectionReasons: readonly string[];
}>;

export type VerifiedFindingCollection = Readonly<{
  sceneId: string;
  verifiedFindings: readonly VerifiedFinding[];
  primaryVerifiedFindingId: string | null;
  primaryVerifiedFinding: VerifiedFinding | null;
  ruleEvaluations: readonly QualityJudgeRuleEvaluation[];
  report: QualityJudgeReport;
  confidence: number;
  executionTimeMs: number;
}>;

export type QualityJudgeEngineInput = Readonly<{
  sceneId: string;
  evidenceCollection: SceneAnalysisEvidenceCollection | null;
  conceptCollection: SceneAnalysisConceptCollection | null;
  legalDecisionCollection: SceneAnalysisLegalDecisionCollection | null;
  explanationCollection: SceneAnalysisExplanationCollection | null;
}>;
