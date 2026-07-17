import type { EmergencyContextualReviewerRoutingReport } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { LegalFinding } from "../legal/legalResult.js";
import type { ReviewerScopeDeclaration } from "../reviewerKnowledge/reviewerScopeMatrix.js";
import { getReviewerScopeDeclaration, getReviewerScopeDeclarationsByIds } from "../reviewerKnowledge/reviewerScopeMatrix.js";
import { logger } from "../../logger.js";

export type ReviewerScopeValidatorInput = Readonly<{
  routing: EmergencyContextualReviewerRoutingReport;
  decision: LegalDecision;
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
  scopeReason: string;
}>;

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
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

  const findings = input.decision.finding ? [input.decision.finding] : [];
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

  const acceptedDecision: LegalDecision = acceptedFindings.length > 0
    ? input.decision
    : Object.freeze({
        ...input.decision,
        status: "reject",
        reason: rejectedFindingsByScope.length > 0
          ? `${input.decision.reason} | Scope validation rejected the finding because it is outside the declared reviewer scope.`
          : input.decision.reason,
        finding: null,
        trace: Object.freeze([
          ...input.decision.trace,
          rejectedFindingsByScope.length > 0 ? "scope_validation:rejected" : "scope_validation:accepted",
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
    scopeReason,
  });
}
