import type { EmergencyContextualReviewerRoutingReport } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { LegalFinding } from "../legal/legalResult.js";
import { createLegalFinding } from "../legal/legalResult.js";
import type { V3ReasonedDecisionResult } from "../provider/providerTypes.js";
import type { ReviewerScopeDeclaration } from "../reviewerKnowledge/reviewerScopeMatrix.js";
import { getReviewerScopeDeclaration, getReviewerScopeDeclarationsByIds } from "../reviewerKnowledge/reviewerScopeMatrix.js";
import { logger } from "../../logger.js";

export type ReviewerScopeValidatorInput = Readonly<{
  routing: EmergencyContextualReviewerRoutingReport;
  decision: LegalDecision;
  reasonedDecision?: V3ReasonedDecisionResult | null;
}>;

export type ReviewerScopeValidatorResult = Readonly<{
  scopeMatrix: readonly ReviewerScopeDeclaration[];
  selectedReviewerIds: readonly string[];
  selectedReviewerLabels: readonly string[];
  rejectedReviewerIds: readonly string[];
  rejectedReviewerLabels: readonly string[];
  acceptedFindingsCount: number;
  rejectedFindingsByScopeCount: number;
  acceptedFindings: readonly LegalFinding[];
  rejectedFindingsByScope: readonly LegalFinding[];
  sanitizedDecision: LegalDecision;
  sanitizedReasonedDecision: V3ReasonedDecisionResult | null;
  scopeReason: string;
}>;

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function pickEvidenceText(input: ReviewerScopeValidatorInput, articleId: number): string {
  const reasonedDecision = input.reasonedDecision;
  if (!reasonedDecision) return input.decision.evidence.candidates[0]?.text ?? `article:${articleId}`;

  for (const evidence of reasonedDecision.supportingEvidence) {
    const normalized = normalizeText(evidence);
    if (normalized.length > 0) return evidence;
  }

  for (const evaluation of reasonedDecision.articleEvaluations) {
    for (const evidence of evaluation.evidence) {
      const normalized = normalizeText(evidence);
      if (normalized.length > 0) return evidence;
    }
  }

  return input.decision.evidence.candidates[0]?.text ?? `article:${articleId}`;
}

function buildFindingFromEvaluation(
  input: ReviewerScopeValidatorInput,
  evaluation: V3ReasonedDecisionResult["articleEvaluations"][number],
  index: number,
): LegalFinding {
  const evidenceText = pickEvidenceText(input, evaluation.articleId);
  const baseEvidence = input.decision.evidence.candidates[0] ?? {
    text: evidenceText,
    startOffset: 0,
    endOffset: Math.max(1, evidenceText.length),
    confidence: input.decision.evidence.confidence,
    source: "chunk" as const,
    notes: [],
  };

  return createLegalFinding({
    findingKey: `${input.decision.moduleId}:${evaluation.articleId}:${index}:${normalizeText(evaluation.reason)}:${normalizeText(evaluation.status)}`,
    moduleId: input.decision.moduleId,
    moduleTitle: input.decision.moduleTitle,
    articleIds: [evaluation.articleId],
    status: "accept",
    reason: evaluation.reason,
    confidence: evaluation.confidence,
    semantic: input.decision.semantic,
    narrative: input.decision.narrative,
    evidence: {
      text: evidenceText,
      startOffset: baseEvidence.startOffset,
      endOffset: baseEvidence.endOffset,
      confidence: baseEvidence.confidence,
      source: baseEvidence.source,
      notes: baseEvidence.notes ?? [],
    },
    context: input.decision.context,
    exceptionCodes: [],
  });
}

export function validateReviewerScope(input: ReviewerScopeValidatorInput): ReviewerScopeValidatorResult {
  const selectedReviewerIds = uniqueSorted(input.routing.selectedReviewerIds);
  const selectedReviewerLabels = uniqueSorted(input.routing.selectedReviewerLabels);
  const rejectedReviewerIds = uniqueSorted(input.routing.rejectedReviewerIds);
  const rejectedReviewerLabels = uniqueSorted(input.routing.rejectedReviewerLabels);
  const scopeMatrix = Object.freeze([
    ...getReviewerScopeDeclarationsByIds(selectedReviewerIds),
    ...selectedReviewerIds
      .filter((reviewerId) => !getReviewerScopeDeclaration(reviewerId))
      .map((reviewerId) => ({
        reviewerId,
        label: reviewerId,
        folder: reviewerId,
        packId: reviewerId,
        ownedCategories: Object.freeze([] as string[]),
        cannotClassifyCategories: Object.freeze([] as string[]),
      })),
  ]);

  const findings = Array.isArray(input.reasonedDecision?.articleEvaluations) && input.reasonedDecision.articleEvaluations.length > 0
    ? input.reasonedDecision.articleEvaluations
        .filter((evaluation) => evaluation.status === "PASS")
        .map((evaluation, index) => buildFindingFromEvaluation(input, evaluation, index))
    : input.decision.finding ? [input.decision.finding] : [];
  const acceptedFindings: LegalFinding[] = [];
  const rejectedFindingsByScope: LegalFinding[] = [];
  const selectedReviewerSet = new Set(selectedReviewerIds.map((reviewerId) => reviewerId.toLowerCase()));

  for (const finding of findings) {
    const findingReviewerId = String(finding.moduleId ?? input.decision.moduleId).trim().toLowerCase();
    const moduleOwned = selectedReviewerSet.has(findingReviewerId);
    const articleOwned = finding.articleIds.length > 0;
    if (moduleOwned && articleOwned) {
      acceptedFindings.push(finding);
    } else {
      rejectedFindingsByScope.push(finding);
    }
  }

  const acceptedDecision: LegalDecision = Object.freeze({
    ...input.decision,
    status: acceptedFindings.length > 0
      ? "accept"
      : rejectedFindingsByScope.length > 0
        ? "reject"
        : input.decision.status,
    finding: acceptedFindings[0] ?? null,
    trace: Object.freeze([
      ...input.decision.trace,
      acceptedFindings.length > 0
        ? "scope_validation:accepted"
        : rejectedFindingsByScope.length > 0
          ? "scope_validation:policy_applied"
          : "scope_validation:accepted",
    ]),
  });

  const scopeReason = acceptedFindings.length > 0
    ? "Selected reviewer scope owns the returned finding."
    : rejectedFindingsByScope.length > 0
      ? "The returned finding was rejected because the reviewer did not own the classified category."
      : "No legal finding was returned.";

  logger.info("V3 reviewer scope validation", {
    validator_name: "reviewerScopeValidator",
    candidate_reviewers: selectedReviewerIds,
    candidate_reviewer_labels: selectedReviewerLabels,
    rejected_reviewers: rejectedReviewerIds,
    rejected_reviewer_labels: rejectedReviewerLabels,
    gpt_reviewer: input.decision.moduleId,
    gpt_article: input.decision.finding?.articleIds[0] ?? input.decision.articleIds[0] ?? null,
    rejection_reason: acceptedFindings.length > 0 ? null : scopeReason,
    line_of_code: "reviewerScopeValidator.ts:54-78",
    accepted_findings_count: acceptedFindings.length,
    rejected_findings_by_scope_count: rejectedFindingsByScope.length,
  });

  return Object.freeze({
    scopeMatrix,
    selectedReviewerIds,
    selectedReviewerLabels,
    rejectedReviewerIds,
    rejectedReviewerLabels,
    acceptedFindingsCount: acceptedFindings.length,
    rejectedFindingsByScopeCount: rejectedFindingsByScope.length,
    acceptedFindings: Object.freeze(acceptedFindings),
    rejectedFindingsByScope: Object.freeze(rejectedFindingsByScope),
    sanitizedDecision: acceptedDecision,
    sanitizedReasonedDecision: input.reasonedDecision
      ? Object.freeze({
          ...input.reasonedDecision,
          articleEvaluations: Object.freeze([...input.reasonedDecision.articleEvaluations]),
          applicableArticles: Object.freeze([...input.reasonedDecision.applicableArticles]),
          rejectedArticles: Object.freeze([...input.reasonedDecision.rejectedArticles]),
        })
      : null,
    scopeReason,
  });
}
