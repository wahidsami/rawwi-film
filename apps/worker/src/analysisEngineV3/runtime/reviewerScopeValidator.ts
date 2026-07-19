import type { EmergencyContextualReviewerRoutingReport } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { LegalFinding } from "../legal/legalResult.js";
import { createLegalFinding } from "../legal/legalResult.js";
import type { V3ReasonedDecisionResult } from "../provider/providerTypes.js";
import type { ReviewerScopeDeclaration } from "../reviewerKnowledge/reviewerScopeMatrix.js";
import { getReviewerScopeDeclaration, getReviewerScopeDeclarationsByIds } from "../reviewerKnowledge/reviewerScopeMatrix.js";
import type { ReviewerCanonicalArticleOwner, ReviewerCanonicalArticleOwnershipMap } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { createDefaultReviewerKnowledgeRegistry, resolveKnowledgeDomainCandidateArticleIds } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { findKnowledgeDocumentByArticleReference } from "../knowledge/knowledgeRegistry.js";
import { logger } from "../../logger.js";

export type ReviewerScopeValidatorInput = Readonly<{
  routing: EmergencyContextualReviewerRoutingReport;
  canonicalArticleOwnershipByArticleId: ReviewerCanonicalArticleOwnershipMap;
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

function resolveSupportingArticleIds(articleId: number): readonly number[] {
  const knowledgeDocument = findKnowledgeDocumentByArticleReference(articleId);
  const knowledgeDomain = knowledgeDocument?.metadata.knowledgeDomain ?? null;
  if (!knowledgeDomain) return Object.freeze([]);
  const candidateArticleIds = resolveKnowledgeDomainCandidateArticleIds(createDefaultReviewerKnowledgeRegistry(), knowledgeDomain);
  return Object.freeze(candidateArticleIds.filter((candidateArticleId) => candidateArticleId !== articleId));
}

function selectCanonicalOwner(
  canonicalOwners: readonly ReviewerCanonicalArticleOwner[],
  selectedReviewerIds: readonly string[],
  gptReviewerId: string,
): ReviewerCanonicalArticleOwner | null {
  if (canonicalOwners.length === 0) return null;
  if (canonicalOwners.length === 1) return canonicalOwners[0] ?? null;

  const selectedReviewerSet = new Set(selectedReviewerIds.map((reviewerId) => reviewerId.trim().toLowerCase()));
  const selectedOwner = canonicalOwners.find((owner) => selectedReviewerSet.has(owner.reviewerId.trim().toLowerCase()));
  if (selectedOwner) return selectedOwner;

  const gptOwner = canonicalOwners.find((owner) => owner.reviewerId.trim().toLowerCase() === gptReviewerId.trim().toLowerCase());
  if (gptOwner) return gptOwner;

  return canonicalOwners[0] ?? null;
}

function buildFindingFromEvaluation(
  input: ReviewerScopeValidatorInput,
  evaluation: V3ReasonedDecisionResult["articleEvaluations"][number],
  index: number,
  canonicalOwner: ReviewerCanonicalArticleOwner,
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
    findingKey: `${canonicalOwner.reviewerId}:${evaluation.articleId}:${index}:${normalizeText(evaluation.reason)}:${normalizeText(evaluation.status)}`,
    moduleId: canonicalOwner.reviewerId,
    moduleTitle: canonicalOwner.reviewerLabel,
    articleIds: [evaluation.articleId, ...resolveSupportingArticleIds(evaluation.articleId)],
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
  const ownershipByArticleId = input.canonicalArticleOwnershipByArticleId;
  const canonicalOwnerReviewerIds = uniqueSorted(Object.values(ownershipByArticleId).flatMap((owners) => owners.map((owner) => owner.reviewerId)));
  const reviewerIdsForMatrix = uniqueSorted([...selectedReviewerIds, ...canonicalOwnerReviewerIds]);
  const scopeMatrix = Object.freeze([
    ...getReviewerScopeDeclarationsByIds(reviewerIdsForMatrix),
    ...reviewerIdsForMatrix
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

  const evaluations = Array.isArray(input.reasonedDecision?.articleEvaluations) && input.reasonedDecision.articleEvaluations.length > 0
    ? input.reasonedDecision.articleEvaluations.filter((evaluation) => evaluation.status === "PASS")
    : input.decision.finding
      ? [{
          articleId: input.decision.finding.articleIds[0] ?? input.decision.articleIds[0] ?? 0,
          status: "PASS" as const,
          evidence: [input.decision.finding.evidence.text],
          reason: input.decision.finding.reason,
          confidence: input.decision.finding.confidence,
        }]
      : [];
  const acceptedFindings: LegalFinding[] = [];
  const rejectedFindingsByScope: LegalFinding[] = [];

  for (const [index, evaluation] of evaluations.entries()) {
    const articleId = evaluation.articleId ?? null;
    const canonicalOwners = articleId === null ? [] : (ownershipByArticleId[String(articleId)] ?? []);
    const canonicalOwner = articleId === null ? null : selectCanonicalOwner(canonicalOwners, selectedReviewerIds, input.decision.moduleId);
    const routerReviewerLabel = selectedReviewerLabels[0] ?? null;
    const gptReviewerLabel = input.decision.moduleTitle;
    const gptReviewerId = input.decision.moduleId;

    if (!canonicalOwner) {
      const rejectedFinding = createLegalFinding({
        findingKey: `${articleId === null ? "unknown" : articleId}:${index}:${normalizeText(evaluation.reason)}:${normalizeText(evaluation.status)}`,
        moduleId: input.decision.moduleId,
        moduleTitle: input.decision.moduleTitle,
        articleIds: articleId === null ? [] : [articleId],
        status: "accept",
        reason: evaluation.reason,
        confidence: evaluation.confidence,
        semantic: input.decision.semantic,
        narrative: input.decision.narrative,
        evidence: input.decision.evidence.candidates[0] ?? {
          text: evaluation.evidence[0] ?? "",
          startOffset: 0,
          endOffset: Math.max(1, (evaluation.evidence[0] ?? "").length),
          confidence: input.decision.evidence.confidence,
          source: "chunk",
          notes: [],
        },
        context: input.decision.context,
        exceptionCodes: [],
      });
      rejectedFindingsByScope.push(rejectedFinding);
      logger.warn("V3 reviewer scope validation rejected finding", {
        validator_name: "reviewerScopeValidator",
        router_reviewer: routerReviewerLabel,
        canonical_owner: canonicalOwners.map((owner) => owner.reviewerLabel),
        gpt_reviewer: gptReviewerLabel,
        final_reviewer: null,
        reassignment_reason: null,
        rejection_occurred: true,
        rejection_reason: canonicalOwners.length === 0 ? "article_has_no_canonical_owner" : "article_owner_ambiguous",
        line_of_code: "reviewerScopeValidator.ts:95-145",
        article_id: articleId,
      });
      continue;
    }

    const finalReviewerLabel = canonicalOwner.reviewerLabel;
    const finalReviewerId = canonicalOwner.reviewerId;
    const routerSelected = selectedReviewerIds.includes(finalReviewerId);
    const reassignmentReason = gptReviewerId !== finalReviewerId
      ? (routerSelected
        ? "GPT reviewer differed from the canonical owner; reassigning to canonical reviewer."
        : "Router excluded the canonical reviewer; reassigning to canonical reviewer.")
      : null;

    acceptedFindings.push(buildFindingFromEvaluation(input, evaluation, index, canonicalOwner));

    logger.info("V3 reviewer scope validation ownership resolution", {
      validator_name: "reviewerScopeValidator",
      router_reviewer: routerReviewerLabel,
        canonical_owner: finalReviewerLabel,
        canonical_owner_candidates: canonicalOwners.map((owner) => owner.reviewerLabel),
        gpt_reviewer: gptReviewerLabel,
        final_reviewer: finalReviewerLabel,
        reassignment_reason: reassignmentReason,
      rejection_occurred: false,
      article_id: articleId,
      evaluation_index: index,
      selected_reviewers: selectedReviewerLabels,
      candidate_reviewers: selectedReviewerIds,
    });
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
    ? "Canonical article ownership resolved and the returned finding was reassigned to the canonical reviewer."
    : rejectedFindingsByScope.length > 0
      ? "The returned finding was rejected because the article did not have a unique canonical owner."
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
