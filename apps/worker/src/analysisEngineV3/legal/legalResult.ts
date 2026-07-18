import type {
  LegalContextResult,
  LegalEvaluationStatus,
  LegalEvidenceCandidate,
  LegalEvidenceResult,
  LegalModuleId,
  LegalNarrativeResult,
  LegalSemanticResult,
} from "./legalTypes.js";

export type LegalExceptionDisposition = "allow" | "review" | "block";

export type LegalExceptionResult = {
  readonly code: string;
  readonly label: string;
  readonly applies: boolean;
  readonly disposition: LegalExceptionDisposition;
  readonly reason: string;
  readonly confidence: number;
};

export type LegalFinding = {
  readonly findingKey: string;
  readonly moduleId: LegalModuleId;
  readonly moduleTitle: string;
  readonly articleIds: readonly number[];
  readonly status: LegalEvaluationStatus;
  readonly reason: string;
  readonly confidence: number;
  readonly exists?: boolean;
  readonly exceptionApplied?: boolean;
  readonly exceptionType?: string | null;
  readonly exceptionReason?: string | null;
  readonly recommendedAction?: "Approve" | "Reject" | "Needs Review" | null;
  readonly legalRecommendation?: "Approve" | "Reject" | "Needs Review" | null;
  readonly semantic: LegalSemanticResult;
  readonly narrative: LegalNarrativeResult;
  readonly evidence: LegalEvidenceCandidate;
  readonly context: LegalContextResult;
  readonly exceptionCodes: readonly string[];
};

export type LegalDecision = {
  readonly moduleId: LegalModuleId;
  readonly moduleTitle: string;
  readonly articleIds: readonly number[];
  readonly applies: boolean;
  readonly status: LegalEvaluationStatus;
  readonly reason: string;
  readonly confidence: number;
  readonly semantic: LegalSemanticResult;
  readonly narrative: LegalNarrativeResult;
  readonly evidence: LegalEvidenceResult;
  readonly context: LegalContextResult;
  readonly exceptions: readonly LegalExceptionResult[];
  readonly finding: LegalFinding | null;
  readonly trace: readonly string[];
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

export function createLegalExceptionResult(input: LegalExceptionResult): LegalExceptionResult {
  return {
    code: input.code,
    label: input.label,
    applies: input.applies,
    disposition: input.disposition,
    reason: input.reason,
    confidence: clampConfidence(input.confidence),
  };
}

export function createLegalFinding(input: LegalFinding): LegalFinding {
  const exceptionApplied = input.exceptionApplied ?? input.exceptionCodes.length > 0;
  const exceptionType = input.exceptionType ?? input.exceptionCodes[0] ?? null;
  const legalRecommendation = input.legalRecommendation ?? (input.status === "reject" ? "Reject" : input.status === "needs_review" ? "Needs Review" : "Approve");
  return {
    findingKey: input.findingKey,
    moduleId: input.moduleId,
    moduleTitle: input.moduleTitle,
    articleIds: [...input.articleIds],
    status: input.status,
    reason: input.reason,
    confidence: clampConfidence(input.confidence),
    exists: input.exists ?? true,
    exceptionApplied,
    exceptionType,
    exceptionReason: input.exceptionReason ?? (exceptionApplied ? input.reason : null),
    recommendedAction: input.recommendedAction ?? legalRecommendation,
    legalRecommendation,
    semantic: input.semantic,
    narrative: input.narrative,
    evidence: input.evidence,
    context: input.context,
    exceptionCodes: [...input.exceptionCodes],
  };
}

export function createLegalDecision(input: LegalDecision): LegalDecision {
  return {
    moduleId: input.moduleId,
    moduleTitle: input.moduleTitle,
    articleIds: [...input.articleIds],
    applies: input.applies,
    status: input.status,
    reason: input.reason,
    confidence: clampConfidence(input.confidence),
    semantic: input.semantic,
    narrative: input.narrative,
    evidence: input.evidence,
    context: input.context,
    exceptions: input.exceptions.map(createLegalExceptionResult),
    finding: input.finding ? createLegalFinding(input.finding) : null,
    trace: [...input.trace],
  };
}
