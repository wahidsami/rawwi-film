import type { V3ReasonedDecisionValidationIssue } from "../provider/reasonedDecisionValidation.js";
import type { V3ProviderErrorDetails } from "../provider/providerError.js";
import type { ReviewerScopeValidatorResult } from "./reviewerScopeValidator.js";
import type { V3ReasonedDecisionResult, V3ReasonedDecisionArticleEvaluation } from "../provider/providerTypes.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { LegalFinding } from "../legal/legalResult.js";

export type V3DiagnosticMapperFinding = Readonly<{
  article_id: number;
  atom_id?: string | null;
  confidence: number;
  evidence_snippet?: string | null;
  title_ar?: string | null;
  description_ar?: string | null;
  rationale_ar?: string | null;
  final_ruling?: string | null;
  detection_pass?: string | null;
  moduleId?: string | null;
  reason?: string | null;
}>;

export type V3DiagnosticStageSummary = Readonly<{
  stage: "provider" | "grounding_validation" | "scope_validation" | "mapper" | "persistence";
  inputCount: number;
  outputCount: number;
  rejectionCount: number;
  rejectionReason: string | null;
  sourceValidator: string | null;
}>;

export type V3DiagnosticRejectedFinding = Readonly<{
  validatorName: string;
  sourceValidator: string;
  reviewer: string | null;
  article: number | string | null;
  atom: string | null;
  evidence: readonly string[];
  rejectionReason: string;
  lineOfCode: string | null;
}>;

export type V3DiagnosticTraceRemovedItem = {
  label: string;
  reason: string;
  score?: number | null;
  metadata?: Readonly<Record<string, unknown>> | null;
};

export type V3DiagnosticTraceStage = {
  stage: string;
  inputCount: number;
  outputCount: number;
  removedCount: number;
  removalReason: string | null;
  removedItems: readonly V3DiagnosticTraceRemovedItem[];
  details: Readonly<Record<string, unknown>>;
};

export type V3DiagnosticEvidenceTrace = {
  originalChunkText: string;
  promptReplayFilePath: string | null;
  stages: readonly V3DiagnosticTraceStage[];
  providerResponse: Readonly<Record<string, unknown>> | null;
  groundingValidation: Readonly<Record<string, unknown>> | null;
  scopeValidation: Readonly<Record<string, unknown>> | null;
  mapperResult: Readonly<Record<string, unknown>> | null;
    persistedFindings: Readonly<{
    inputCount: number;
    outputCount: number;
    removedCount: number;
    removalReason: string | null;
    details: Readonly<Record<string, unknown>>;
  }> | null;
};

export type V3DiagnosticReport = {
  enabled: true;
  provider_error: V3ProviderErrorDetails | null;
  providerFindingsCount: number;
  rawProviderFindings: readonly {
    articleId: number;
    status: V3ReasonedDecisionArticleEvaluation["status"];
    confidence: number;
    evidence: readonly string[];
    reason: string;
  }[];
  groundingAcceptedCount: number;
  groundingRejectedCount: number;
  scopeAcceptedCount: number;
  scopeRejectedCount: number;
  mapperFindingsCount: number;
  persistenceFindingsCount: number | null;
  persistenceInsertedCount: number | null;
  persistenceSkippedCount: number | null;
  finalV3FindingsCount: number;
  rawV3FindingsCount: number;
  rejectedFindings: readonly V3DiagnosticRejectedFinding[];
  acceptanceRate: number;
  topRejectionReasons: readonly { reason: string; count: number }[];
  stageSummary: readonly V3DiagnosticStageSummary[];
  validatorHistory: readonly string[];
  evidenceTrace: V3DiagnosticEvidenceTrace | null;
};

function summarizeProviderFindings(decision: V3ReasonedDecisionResult): V3DiagnosticReport["rawProviderFindings"] {
  return decision.articleEvaluations.map((evaluation) => ({
    articleId: evaluation.articleId,
    status: evaluation.status,
    confidence: evaluation.confidence,
    evidence: [...evaluation.evidence],
    reason: evaluation.reason,
  }));
}

function summarizeScopeRejections(scopeValidation: ReviewerScopeValidatorResult, decision: LegalDecision): readonly V3DiagnosticRejectedFinding[] {
  if (scopeValidation.rejectedFindingsByScope.length === 0) return [];

  return scopeValidation.rejectedFindingsByScope.map((finding) => ({
    validatorName: "reviewerScopeValidator",
    sourceValidator: "reviewerScopeValidator",
    reviewer: finding.moduleId ?? decision.moduleId ?? null,
    article: finding.articleIds[0] ?? decision.articleIds[0] ?? null,
    atom: null,
    evidence: [finding.evidence.text].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    rejectionReason: scopeValidation.scopeReason,
    lineOfCode: "reviewerScopeValidator.ts:54-78",
  }));
}

function summarizeGroundingRejections(issues: readonly V3ReasonedDecisionValidationIssue[], decision: V3ReasonedDecisionResult): readonly V3DiagnosticRejectedFinding[] {
  if (issues.length === 0) return [];

  const primaryArticle = decision.articleEvaluations[0]?.articleId ?? null;
  const primaryEvidence = decision.supportingEvidence[0] ?? null;
  return issues.map((issue) => ({
    validatorName: "reasonedDecisionValidation",
    sourceValidator: "reasonedDecisionValidation",
    reviewer: null,
    article: primaryArticle,
    atom: null,
    evidence: primaryEvidence ? [primaryEvidence] : [],
    rejectionReason: `${issue.code}:${issue.path}`,
    lineOfCode: "reasonedDecisionValidation.ts:252-334",
  }));
}

function summarizeMapperRejection(decision: LegalDecision, findings: readonly unknown[]): readonly V3DiagnosticRejectedFinding[] {
  if (findings.length > 0 || !decision.finding || decision.status !== "reject") return [];

  return [{
    validatorName: "findingMapper",
    sourceValidator: "findingMapper",
    reviewer: decision.moduleId ?? null,
    article: decision.finding?.articleIds[0] ?? decision.articleIds[0] ?? null,
    atom: null,
    evidence: [decision.finding?.evidence.text ?? ""].filter((value): value is string => value.trim().length > 0),
    rejectionReason: decision.reason,
    lineOfCode: "findingMapper.ts:419-421",
  }];
}

function topRejectionReasons(rejectedFindings: readonly V3DiagnosticRejectedFinding[]): readonly { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const finding of rejectedFindings) {
    counts.set(finding.rejectionReason, (counts.get(finding.rejectionReason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

export function buildV3DiagnosticReport(input: Readonly<{
  providerDecision: V3ReasonedDecisionResult;
  groundingValidation: Readonly<{ valid: boolean; issues: readonly V3ReasonedDecisionValidationIssue[]; validationNote: string }>;
  scopeValidation: ReviewerScopeValidatorResult;
  validatedDecision: LegalDecision;
  mapperFindings: readonly V3DiagnosticMapperFinding[];
  providerError?: V3ProviderErrorDetails | null;
  evidenceTrace?: V3DiagnosticEvidenceTrace | null;
}>): V3DiagnosticReport {
  const rawProviderFindings = summarizeProviderFindings(input.providerDecision);
  const groundingRejectedCount = input.groundingValidation.issues.length;
  const scopeRejectedCount = input.scopeValidation.rejectedFindingsByScope.length;
  const rejectedFindings = [
    ...summarizeGroundingRejections(input.groundingValidation.issues, input.providerDecision),
    ...summarizeScopeRejections(input.scopeValidation, input.validatedDecision),
    ...summarizeMapperRejection(input.validatedDecision, input.mapperFindings),
  ];

  const providerFindingsCount = rawProviderFindings.length;
  const groundingAcceptedCount = input.groundingValidation.valid ? 1 : 0;
  const scopeAcceptedCount = input.scopeValidation.acceptedFindingsCount;
  const mapperFindingsCount = input.mapperFindings.length;

  return {
    enabled: true,
    provider_error: input.providerError ?? null,
    providerFindingsCount,
    rawProviderFindings,
    groundingAcceptedCount,
    groundingRejectedCount,
    scopeAcceptedCount,
    scopeRejectedCount,
    mapperFindingsCount,
    persistenceFindingsCount: null,
    persistenceInsertedCount: null,
    persistenceSkippedCount: null,
    finalV3FindingsCount: mapperFindingsCount,
    rawV3FindingsCount: mapperFindingsCount,
    rejectedFindings,
    acceptanceRate: providerFindingsCount > 0 ? mapperFindingsCount / providerFindingsCount : 0,
    topRejectionReasons: topRejectionReasons(rejectedFindings),
    stageSummary: [
      {
        stage: "provider",
        inputCount: 0,
        outputCount: providerFindingsCount,
        rejectionCount: 0,
        rejectionReason: null,
        sourceValidator: null,
      },
      {
        stage: "grounding_validation",
        inputCount: providerFindingsCount,
        outputCount: groundingAcceptedCount,
        rejectionCount: groundingRejectedCount,
        rejectionReason: groundingRejectedCount > 0 ? input.groundingValidation.validationNote : null,
        sourceValidator: "reasonedDecisionValidation",
      },
      {
        stage: "scope_validation",
        inputCount: groundingAcceptedCount,
        outputCount: scopeAcceptedCount,
        rejectionCount: scopeRejectedCount,
        rejectionReason: scopeRejectedCount > 0 ? input.scopeValidation.scopeReason : null,
        sourceValidator: "reviewerScopeValidator",
      },
      {
        stage: "mapper",
        inputCount: scopeAcceptedCount,
        outputCount: mapperFindingsCount,
        rejectionCount: Math.max(0, scopeAcceptedCount - mapperFindingsCount),
        rejectionReason: mapperFindingsCount === 0 && input.validatedDecision.status === "reject"
          ? input.validatedDecision.reason
          : null,
        sourceValidator: mapperFindingsCount === 0 ? "findingMapper" : null,
      },
      {
        stage: "persistence",
        inputCount: mapperFindingsCount,
        outputCount: mapperFindingsCount,
        rejectionCount: 0,
        rejectionReason: null,
        sourceValidator: null,
      },
    ],
    validatorHistory: [...input.validatedDecision.trace],
    evidenceTrace: input.evidenceTrace ?? null,
  };
}

export function buildV3ProviderFailureDiagnosticReport(input: Readonly<{
  providerError: V3ProviderErrorDetails;
}>): V3DiagnosticReport {
  return {
    enabled: true,
    provider_error: input.providerError,
    providerFindingsCount: 0,
    rawProviderFindings: [],
    groundingAcceptedCount: 0,
    groundingRejectedCount: 0,
    scopeAcceptedCount: 0,
    scopeRejectedCount: 0,
    mapperFindingsCount: 0,
    persistenceFindingsCount: null,
    persistenceInsertedCount: null,
    persistenceSkippedCount: null,
    finalV3FindingsCount: 0,
    rawV3FindingsCount: 0,
    rejectedFindings: [],
    acceptanceRate: 0,
    topRejectionReasons: [],
    stageSummary: [
      {
        stage: "provider",
        inputCount: 0,
        outputCount: 0,
        rejectionCount: 0,
        rejectionReason: input.providerError.message,
        sourceValidator: "openaiProvider",
      },
      {
        stage: "grounding_validation",
        inputCount: 0,
        outputCount: 0,
        rejectionCount: 0,
        rejectionReason: null,
        sourceValidator: "reasonedDecisionValidation",
      },
      {
        stage: "scope_validation",
        inputCount: 0,
        outputCount: 0,
        rejectionCount: 0,
        rejectionReason: null,
        sourceValidator: "reviewerScopeValidator",
      },
      {
        stage: "mapper",
        inputCount: 0,
        outputCount: 0,
        rejectionCount: 0,
        rejectionReason: null,
        sourceValidator: "findingMapper",
      },
      {
        stage: "persistence",
        inputCount: 0,
        outputCount: 0,
        rejectionCount: 0,
        rejectionReason: null,
        sourceValidator: null,
      },
    ],
    validatorHistory: [],
    evidenceTrace: null,
  };
}

export function finalizeV3DiagnosticReport(
  report: V3DiagnosticReport,
  input: Readonly<{ persistenceFindingsCount: number; persistenceInsertedCount: number; persistenceSkippedCount: number }>,
): V3DiagnosticReport {
  report.persistenceFindingsCount = input.persistenceFindingsCount;
  report.persistenceInsertedCount = input.persistenceInsertedCount;
  report.persistenceSkippedCount = input.persistenceSkippedCount;
  report.finalV3FindingsCount = input.persistenceFindingsCount;
  report.stageSummary = report.stageSummary.map((stage) => (
    stage.stage === "persistence"
      ? {
          ...stage,
          inputCount: report.mapperFindingsCount,
          outputCount: input.persistenceInsertedCount,
          rejectionCount: input.persistenceSkippedCount,
        }
      : stage
  ));
  return report;
}
