import { evaluateWithModule } from "../legal/legalEngine.js";
import type { LegalModule } from "../legal/legalModule.js";
import type { ReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import type { ReviewerDebateConfidenceDistribution, ReviewerDebateEngineInput, ReviewerDebateKnowledgeSupport, ReviewerDebateMetrics, ReviewerDebateOpinion, ReviewerDebatePackage, ReviewerDebatePairwiseAssessment } from "./reviewerDebateTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }
  return Object.freeze(result.sort((left, right) => normalizeText(left).localeCompare(normalizeText(right))));
}

function pickReviewerName(module: LegalModule): string {
  const id = module.id.toLowerCase();
  if (id.includes("religion")) return "Religion Reviewer";
  if (id.includes("politics")) return "Politics Reviewer";
  if (id.includes("nationalsecurity") || id.includes("national_security") || id.includes("security")) return "National Security Reviewer";
  if (id.includes("society")) return "Society Reviewer";
  if (id.includes("crime")) return "Crime Reviewer";
  if (id.includes("children")) return "Children Reviewer";
  if (id.includes("drugs")) return "Drugs Reviewer";
  if (id.includes("sexual")) return "Sexual Content Reviewer";
  if (id.includes("profanity")) return "Profanity Reviewer";
  if (id.includes("history")) return "History Reviewer";
  if (id.includes("family")) return "Family Values Reviewer";
  if (id.includes("leadership") || id.includes("state")) return "State Leadership Reviewer";
  if (id.includes("travel")) return "Travel Reviewer";
  return `${module.title || module.id} Reviewer`;
}

function reviewerKeywords(module: LegalModule, reviewerName: string): readonly string[] {
  const parts = [
    module.id,
    module.title,
    reviewerName,
    ...module.articleIds.map((articleId) => String(articleId)),
  ];
  return uniqueStrings(parts.flatMap((value) => value.split(/[\s_/:-]+/g)));
}

function scoreText(value: unknown, terms: readonly string[]): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const normalized = normalizeText(text);
  let score = 0;
  for (const term of terms) {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) continue;
    if (normalized.includes(normalizedTerm)) score += normalizedTerm.length >= 8 ? 3 : 1;
  }
  return score;
}

function selectTopIds<T>(items: readonly T[], terms: readonly string[], getId: (item: T) => string, limit: number): readonly string[] {
  return Object.freeze(
    [...items]
      .map((item) => ({
        id: getId(item),
        score: scoreText(item, terms),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, limit)
      .map((entry) => entry.id),
  );
}

function confidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return confidence(values.reduce((sum, value) => sum + confidence(value), 0) / values.length);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? confidence((sorted[middle - 1] + sorted[middle]) / 2)
    : confidence(sorted[middle] ?? 0);
}

function setIntersectionSize(left: readonly string[], right: readonly string[]): number {
  const rightSet = new Set(right.map((value) => normalizeText(value)));
  let count = 0;
  for (const value of left) {
    if (rightSet.has(normalizeText(value))) count += 1;
  }
  return count;
}

function unionStrings(values: readonly (readonly string[])[]): readonly string[] {
  return uniqueStrings(values.flatMap((value) => value));
}

function selectKnowledgeSupport(
  reviewerReasoningEngine: ReviewerReasoningEnginePayload,
  module: LegalModule,
  reviewerName: string,
): ReviewerDebateKnowledgeSupport {
  const terms = reviewerKeywords(module, reviewerName);
  const lessons = selectTopIds(reviewerReasoningEngine.lessons as readonly Record<string, unknown>[], terms, (item) => String(item.id ?? item.title ?? "lesson"), 4);
  const blueprints = selectTopIds(reviewerReasoningEngine.blueprints as readonly Record<string, unknown>[], terms, (item) => String(item.id ?? item.title ?? "blueprint"), 4);
  const patterns = selectTopIds(reviewerReasoningEngine.patterns as readonly Record<string, unknown>[], terms, (item) => String(item.id ?? item.title ?? "pattern"), 4);
  const relationships = selectTopIds(reviewerReasoningEngine.relationships as readonly Record<string, unknown>[], terms, (item) => String(item.term ?? item.relation ?? item.source ?? "relationship"), 6);
  const cases = selectTopIds(reviewerReasoningEngine.cases as readonly Record<string, unknown>[], terms, (item) => String(item.articleId ?? item.title ?? "case"), 4);
  const precedents = selectTopIds(
    (((reviewerReasoningEngine.precedents as Record<string, unknown> | null | undefined)?.top_matches as readonly Record<string, unknown>[]) ?? []),
    terms,
    (item) => String(item.decisionId ?? item.title ?? "precedent"),
    4,
  );

  return Object.freeze({
    lessons,
    blueprints,
    patterns,
    relationships,
    cases,
    precedents,
  });
}

function opinionConfidenceStatus(confidenceValue: number): ReviewerDebateOpinion["riskLevel"] {
  if (confidenceValue >= 0.9) return "critical";
  if (confidenceValue >= 0.75) return "high";
  if (confidenceValue >= 0.5) return "medium";
  return "low";
}

function buildOpinionSummary(opinion: ReviewerDebateOpinion): ReviewerDebatePackage["opinionSummaries"][number] {
  return Object.freeze({
    reviewerId: opinion.reviewerId,
    reviewerName: opinion.reviewerName,
    status: opinion.status,
    confidence: opinion.confidence,
    applicable: opinion.applicable,
    suggestedArticles: opinion.suggestedArticles,
    rejectedArticles: opinion.rejectedArticles,
    riskLevel: opinion.riskLevel,
    needsHumanReview: opinion.needsHumanReview,
  });
}

function buildPairwiseAssessment(left: ReviewerDebateOpinion, right: ReviewerDebateOpinion): ReviewerDebatePairwiseAssessment {
  const articleOverlap = setIntersectionSize(left.suggestedArticles.map(String), right.suggestedArticles.map(String));
  const knowledgeOverlap = setIntersectionSize(
    unionStrings(Object.values(left.supportingKnowledge)),
    unionStrings(Object.values(right.supportingKnowledge)),
  );
  const evidenceOverlap = setIntersectionSize(left.supportingEvidence, right.supportingEvidence);
  const sameStatus = left.status === right.status;
  const confidenceDelta = confidence(Math.abs(left.confidence - right.confidence));
  const agreementScore = confidence(sameStatus ? 1 : Math.max(0, 1 - confidenceDelta));
  const disagreementScore = confidence(1 - agreementScore);

  return Object.freeze({
    leftReviewerId: left.reviewerId,
    rightReviewerId: right.reviewerId,
    sameStatus,
    articleOverlap,
    knowledgeOverlap,
    evidenceOverlap,
    confidenceDelta,
    agreementScore,
    disagreementScore,
  });
}

function summarizeRisk(confidenceValue: number, disagreementScore: number): ReviewerDebateOpinion["riskLevel"] {
  if (confidenceValue >= 0.9 && disagreementScore <= 0.1) return "critical";
  if (confidenceValue >= 0.75 || disagreementScore >= 0.35) return "high";
  if (confidenceValue >= 0.5) return "medium";
  return "low";
}

function buildGeneralReviewerOpinion(
  specialistOpinions: readonly ReviewerDebateOpinion[],
  primaryDecision: ReviewerDebatePackage["primaryDecision"],
): ReviewerDebateOpinion {
  const specialistConfidences = specialistOpinions.map((opinion) => opinion.confidence);
  const statusCounts = new Map<ReviewerDebateOpinion["status"], number>();
  for (const opinion of specialistOpinions) {
    statusCounts.set(opinion.status, (statusCounts.get(opinion.status) ?? 0) + 1);
  }
  const majorityStatus = [...statusCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? primaryDecision.status;
  const majorityOpinions = specialistOpinions.filter((opinion) => opinion.status === majorityStatus);
  const minorityOpinions = specialistOpinions.filter((opinion) => opinion.status !== majorityStatus);
  const majorityArticles = uniqueStrings(majorityOpinions.flatMap((opinion) => opinion.suggestedArticles.map(String))).map(Number).filter((value) => Number.isFinite(value));
  const dissentArticles = uniqueStrings(minorityOpinions.flatMap((opinion) => opinion.suggestedArticles.map(String))).map(Number).filter((value) => Number.isFinite(value));
  const supportingEvidence = uniqueStrings(specialistOpinions.flatMap((opinion) => opinion.supportingEvidence));
  const supportingKnowledge = Object.freeze({
    lessons: uniqueStrings(specialistOpinions.flatMap((opinion) => opinion.supportingKnowledge.lessons)),
    blueprints: uniqueStrings(specialistOpinions.flatMap((opinion) => opinion.supportingKnowledge.blueprints)),
    patterns: uniqueStrings(specialistOpinions.flatMap((opinion) => opinion.supportingKnowledge.patterns)),
    relationships: uniqueStrings(specialistOpinions.flatMap((opinion) => opinion.supportingKnowledge.relationships)),
    cases: uniqueStrings(specialistOpinions.flatMap((opinion) => opinion.supportingKnowledge.cases)),
    precedents: uniqueStrings(specialistOpinions.flatMap((opinion) => opinion.supportingKnowledge.precedents)),
  });
  const averageConfidenceValue = average(specialistConfidences);
  const disagreementScore = specialistOpinions.length > 1
    ? average(
        specialistOpinions.flatMap((left, index) =>
          specialistOpinions.slice(index + 1).map((right) => buildPairwiseAssessment(left, right).disagreementScore),
        ),
      )
    : 0;
  const counterargument = minorityOpinions[0]?.reasoning ?? "No stronger counterargument identified.";
  const needsHumanReview = majorityStatus === "needs_review" || disagreementScore >= 0.35 || averageConfidenceValue < 0.65;

  return Object.freeze({
    reviewerId: "general_reviewer",
    reviewerName: "General Reviewer",
    moduleId: "general_reviewer",
    moduleTitle: "General Reviewer",
    applicable: true,
    status: majorityStatus,
    confidence: averageConfidenceValue,
    reasoning: [
      `Consensus status: ${majorityStatus}`,
      `Specialist confidence average: ${averageConfidenceValue.toFixed(6)}`,
      `Specialist disagreement score: ${disagreementScore.toFixed(6)}`,
      `Primary decision: ${primaryDecision.status}`,
      `Primary articles: ${primaryDecision.articleIds.join(", ") || "none"}`,
    ].join(" | "),
    supportingEvidence,
    supportingKnowledge,
    suggestedArticles: Object.freeze(majorityArticles.length > 0 ? majorityArticles : primaryDecision.articleIds),
    rejectedArticles: Object.freeze(dissentArticles),
    counterargument,
    riskLevel: summarizeRisk(averageConfidenceValue, disagreementScore),
    escalationRecommendation: needsHumanReview
      ? "Escalate to human reviewer because specialist disagreement or confidence warrants review."
      : "No escalation required; consensus is stable.",
    needsHumanReview,
    independence: "independent",
    durationMs: 0,
  });
}

function buildOpinion(
  module: LegalModule,
  reviewerReasoningEngine: ReviewerReasoningEnginePayload,
  decision: ReturnType<typeof evaluateWithModule>,
): ReviewerDebateOpinion {
  const reviewerName = pickReviewerName(module);
  const confidenceValue = confidence(decision.confidence);
  const supportingKnowledge = selectKnowledgeSupport(reviewerReasoningEngine, module, reviewerName);
  const supportingEvidence = uniqueStrings(decision.evidence.candidates.map((candidate) => candidate.text));
  const needsHumanReview = decision.status === "needs_review" || confidenceValue < 0.65;
  const riskLevel = opinionConfidenceStatus(confidenceValue);
  const suggestedArticles = Object.freeze([...new Set(decision.articleIds)].sort((left, right) => left - right));

  return Object.freeze({
    reviewerId: module.id,
    reviewerName,
    moduleId: module.id,
    moduleTitle: module.title,
    applicable: decision.applies,
    status: decision.status,
    confidence: confidenceValue,
    reasoning: decision.reason,
    supportingEvidence,
    supportingKnowledge,
    suggestedArticles,
    rejectedArticles: Object.freeze([]),
    counterargument: decision.exceptions.find((exception) => exception.applies)?.reason ?? "No stronger counterargument identified.",
    riskLevel,
    escalationRecommendation: needsHumanReview
      ? "Escalate to human reviewer because confidence or status indicates uncertainty."
      : "No escalation required; specialist opinion is stable.",
    needsHumanReview,
    independence: "independent",
    durationMs: 0,
  });
}

export function buildReviewerDebatePackage(input: ReviewerDebateEngineInput): ReviewerDebatePackage {
  const primaryDecision = Object.freeze({
    moduleId: input.analysisResponse.legalDecision.moduleId,
    moduleTitle: input.analysisResponse.legalDecision.moduleTitle,
    status: input.analysisResponse.legalDecision.status,
    confidence: confidence(input.analysisResponse.legalDecision.confidence),
    articleIds: Object.freeze([...input.analysisResponse.legalDecision.articleIds]),
    reason: input.analysisResponse.legalDecision.reason,
  });

  const specialistOpinionsMutable = input.legalModules.map((module) => {
    const decision = evaluateWithModule(module, {
      moduleId: module.id,
      intelligence: input.analysisResponse.intelligence,
    });
    return buildOpinion(module, input.reviewerReasoningEngine, decision);
  });

  const specialistOpinions = Object.freeze(specialistOpinionsMutable.map((opinion) => Object.freeze({
    ...opinion,
    supportingKnowledge: Object.freeze({
      lessons: Object.freeze([...opinion.supportingKnowledge.lessons]),
      blueprints: Object.freeze([...opinion.supportingKnowledge.blueprints]),
      patterns: Object.freeze([...opinion.supportingKnowledge.patterns]),
      relationships: Object.freeze([...opinion.supportingKnowledge.relationships]),
      cases: Object.freeze([...opinion.supportingKnowledge.cases]),
      precedents: Object.freeze([...opinion.supportingKnowledge.precedents]),
    }),
    supportingEvidence: Object.freeze([...opinion.supportingEvidence]),
    suggestedArticles: Object.freeze([...opinion.suggestedArticles]),
    rejectedArticles: Object.freeze([...opinion.rejectedArticles]),
  })));

  const generalReviewerOpinion = buildGeneralReviewerOpinion(specialistOpinions, primaryDecision);
  const opinions = Object.freeze([...specialistOpinions, generalReviewerOpinion]);
  const executionOrder = Object.freeze([...opinions.map((opinion) => opinion.reviewerName)]);

  const rejectedArticlesByOpinion = new Map<string, readonly number[]>();
  const statusMajority = (() => {
    const counts = new Map<ReviewerDebateOpinion["status"], number>();
    for (const opinion of specialistOpinions) {
      counts.set(opinion.status, (counts.get(opinion.status) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? primaryDecision.status;
  })();

  for (const opinion of opinions) {
    const rejected = opinion === generalReviewerOpinion
      ? specialistOpinions.filter((specialist) => specialist.status !== statusMajority).flatMap((specialist) => specialist.suggestedArticles)
      : opinions
        .filter((other) => other.reviewerId !== opinion.reviewerId && other.status !== opinion.status)
        .flatMap((other) => other.suggestedArticles);
    rejectedArticlesByOpinion.set(opinion.reviewerId, Object.freeze([...new Set(rejected)].sort((left, right) => left - right)));
  }

  const finalizedOpinions = Object.freeze(
    opinions.map((opinion) =>
      Object.freeze({
        ...opinion,
        rejectedArticles: rejectedArticlesByOpinion.get(opinion.reviewerId) ?? Object.freeze([]),
        riskLevel: opinion.reviewerId === "general_reviewer"
          ? opinion.riskLevel
          : summarizeRisk(opinion.confidence, average(
              opinions
                .filter((other) => other.reviewerId !== opinion.reviewerId)
                .map((other) => buildPairwiseAssessment(opinion, other).disagreementScore),
            )),
      }),
    ),
  );

  const pairwiseAssessments = finalizedOpinions.flatMap((left, index) =>
    finalizedOpinions.slice(index + 1).map((right) => buildPairwiseAssessment(left, right)),
  );
  const agreementMatrix = Object.freeze([...pairwiseAssessments].sort((left, right) =>
    left.leftReviewerId.localeCompare(right.leftReviewerId) ||
    left.rightReviewerId.localeCompare(right.rightReviewerId),
  ));
  const disagreementMatrix = Object.freeze(agreementMatrix.filter((entry) => entry.disagreementScore > 0));

  const confidenceValues = finalizedOpinions.map((opinion) => opinion.confidence);
  const highestConfidenceReviewer = finalizedOpinions.slice().sort((left, right) => right.confidence - left.confidence || left.reviewerId.localeCompare(right.reviewerId))[0]?.reviewerName ?? null;
  const lowestConfidenceReviewer = finalizedOpinions.slice().sort((left, right) => left.confidence - right.confidence || left.reviewerId.localeCompare(right.reviewerId))[0]?.reviewerName ?? null;
  const supportingEvidenceOverlap = uniqueStrings(
    (() => {
      const counts = new Map<string, number>();
      for (const opinion of finalizedOpinions) {
        for (const evidence of opinion.supportingEvidence) {
          const normalized = normalizeText(evidence);
          counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
        }
      }
      return [...counts.entries()].filter(([, count]) => count > 1).map(([evidence]) => evidence);
    })(),
  );
  const knowledgeOverlap = uniqueStrings(
    (() => {
      const counts = new Map<string, number>();
      for (const opinion of finalizedOpinions) {
        for (const entry of [
          ...opinion.supportingKnowledge.lessons,
          ...opinion.supportingKnowledge.blueprints,
          ...opinion.supportingKnowledge.patterns,
          ...opinion.supportingKnowledge.relationships,
          ...opinion.supportingKnowledge.cases,
          ...opinion.supportingKnowledge.precedents,
        ]) {
          const normalized = normalizeText(entry);
          counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
        }
      }
      return [...counts.entries()].filter(([, count]) => count > 1).map(([entry]) => entry);
    })(),
  );
  const conflictingArticles = Object.freeze([...new Set(finalizedOpinions.filter((opinion) => opinion.status !== statusMajority).flatMap((opinion) => opinion.suggestedArticles))].sort((left, right) => left - right));
  const consensusCount = finalizedOpinions.filter((opinion) => opinion.status === statusMajority).length;
  const consensusScore = confidence(finalizedOpinions.length > 0 ? consensusCount / finalizedOpinions.length : 0);
  const confidenceDistribution: ReviewerDebateConfidenceDistribution = Object.freeze({
    minimum: finalizedOpinions.length > 0 ? confidenceValues.reduce((min, value) => Math.min(min, value), 1) : 0,
    maximum: finalizedOpinions.length > 0 ? confidenceValues.reduce((max, value) => Math.max(max, value), 0) : 0,
    average: average(confidenceValues),
    median: median(confidenceValues),
    spread: confidenceValues.length > 0 ? confidence(confidenceValues.reduce((max, value) => Math.max(max, value), 0) - confidenceValues.reduce((min, value) => Math.min(min, value), 1)) : 0,
    buckets: Object.freeze({
      low: finalizedOpinions.filter((opinion) => opinion.confidence < 0.5).length,
      medium: finalizedOpinions.filter((opinion) => opinion.confidence >= 0.5 && opinion.confidence < 0.75).length,
      high: finalizedOpinions.filter((opinion) => opinion.confidence >= 0.75 && opinion.confidence < 0.9).length,
      critical: finalizedOpinions.filter((opinion) => opinion.confidence >= 0.9).length,
    }),
  });

  const agreementScore = agreementMatrix.length > 0
    ? average(agreementMatrix.map((entry) => entry.agreementScore))
    : 1;
  const disagreementScore = disagreementMatrix.length > 0
    ? average(disagreementMatrix.map((entry) => entry.disagreementScore))
    : 0;
  const averageConfidenceValue = average(confidenceValues);
  const reviewerParticipation = finalizedOpinions.length > 0 ? 1 : 0;
  const articleOverlap = agreementMatrix.reduce((sum, entry) => sum + entry.articleOverlap, 0);
  const evidenceOverlap = agreementMatrix.reduce((sum, entry) => sum + entry.evidenceOverlap, 0);
  const knowledgeOverlapScore = agreementMatrix.reduce((sum, entry) => sum + entry.knowledgeOverlap, 0);

  const metrics: ReviewerDebateMetrics = Object.freeze({
    agreement: agreementScore,
    disagreement: disagreementScore,
    averageConfidence: averageConfidenceValue,
    participation: reviewerParticipation,
    articleOverlap,
    knowledgeOverlap: knowledgeOverlapScore,
    evidenceOverlap,
    consensusPercentage: consensusScore,
  });

  return Object.freeze({
    sharedPackage: input.reviewerReasoningEngine,
    primaryDecision,
    reviewerCount: finalizedOpinions.length,
    executionOrder,
    reviewerDurations: Object.freeze(finalizedOpinions.map((opinion) => Object.freeze({
      reviewerId: opinion.reviewerId,
      reviewerName: opinion.reviewerName,
      durationMs: opinion.durationMs,
    }))),
    opinions: finalizedOpinions,
    opinionSummaries: Object.freeze(finalizedOpinions.map((opinion) => buildOpinionSummary(opinion))),
    agreementMatrix,
    disagreementMatrix,
    highestConfidenceReviewer,
    lowestConfidenceReviewer,
    conflictingArticles,
    supportingEvidenceOverlap,
    knowledgeOverlap,
    confidenceDistribution,
    consensusScore,
    metrics,
    gptAssistant: input.gptAssistant ?? null,
  });
}
