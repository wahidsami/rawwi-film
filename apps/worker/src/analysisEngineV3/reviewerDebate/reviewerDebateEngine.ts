import { evaluateWithModule } from "../legal/legalEngine.js";
import type { LegalModule } from "../legal/legalModule.js";
import type { ReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import { buildReviewerDecisionContext } from "../legal/reviewerDecisionPreparation.js";
import type { ReviewerDebateConfidenceDistribution, ReviewerDebateConsultationEntry, ReviewerDebateConsultationGraph, ReviewerDebateConsultationOpinion, ReviewerDebateConsultationSummary, ReviewerDebateEngineInput, ReviewerDebateKnowledgeSupport, ReviewerDebateMetrics, ReviewerDebateOpinion, ReviewerDebatePackage, ReviewerDebatePairwiseAssessment, ReviewerSelfCritique } from "./reviewerDebateTypes.js";

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

const CONSULTATION_TARGETS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "religion reviewer": Object.freeze(["History Reviewer", "Politics Reviewer", "Family Values Reviewer", "General Reviewer", "Children Reviewer"]),
  "politics reviewer": Object.freeze(["History Reviewer", "State Leadership Reviewer", "National Security Reviewer", "General Reviewer"]),
  "national security reviewer": Object.freeze(["Politics Reviewer", "Crime Reviewer", "History Reviewer", "General Reviewer"]),
  "society reviewer": Object.freeze(["Politics Reviewer", "Family Values Reviewer", "General Reviewer"]),
  "crime reviewer": Object.freeze(["National Security Reviewer", "Children Reviewer", "General Reviewer"]),
  "children reviewer": Object.freeze(["Crime Reviewer", "Family Values Reviewer", "Profanity Reviewer", "General Reviewer"]),
  "drugs reviewer": Object.freeze(["Crime Reviewer", "Society Reviewer", "Family Values Reviewer", "General Reviewer"]),
  "sexual content reviewer": Object.freeze(["Children Reviewer", "Family Values Reviewer", "General Reviewer"]),
  "profanity reviewer": Object.freeze(["Society Reviewer", "Family Values Reviewer", "Religion Reviewer", "General Reviewer"]),
  "history reviewer": Object.freeze(["Politics Reviewer", "Religion Reviewer", "General Reviewer"]),
  "family values reviewer": Object.freeze(["Children Reviewer", "Society Reviewer", "Religion Reviewer", "General Reviewer"]),
  "state leadership reviewer": Object.freeze(["Politics Reviewer", "National Security Reviewer", "General Reviewer"]),
  "violence reviewer": Object.freeze(["Crime Reviewer", "National Security Reviewer", "Children Reviewer", "General Reviewer"]),
  "travel reviewer": Object.freeze(["Politics Reviewer", "National Security Reviewer", "General Reviewer"]),
  "general reviewer": Object.freeze([
    "Religion Reviewer",
    "Politics Reviewer",
    "National Security Reviewer",
    "Society Reviewer",
    "Crime Reviewer",
    "Children Reviewer",
    "Drugs Reviewer",
    "Sexual Content Reviewer",
    "Profanity Reviewer",
    "History Reviewer",
    "Family Values Reviewer",
    "State Leadership Reviewer",
    "Violence Reviewer",
    "Travel Reviewer",
  ]),
});

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

function buildSelfCritique(
  decision: ReturnType<typeof evaluateWithModule>,
  reviewerName: string,
  confidenceValue: number,
): ReviewerSelfCritique {
  const applicableExceptions = decision.exceptions.filter((exception) => exception.applies);
  const contradictingEvidence = uniqueStrings([
    ...applicableExceptions.map((exception) => exception.reason),
    ...decision.evidence.candidates.slice(1).map((candidate) => candidate.text),
  ]);
  const assumptions = uniqueStrings([
    "I assumed the strongest surfaced evidence is the most representative reading.",
    "I assumed no stronger unseen context overrides the visible evidence.",
  ]);
  const possibleDisagreement = "Another reviewer could prioritize wider scene context, quotation, satire, or historical framing differently.";
  const missedContext = "A broader scene, earlier dialogue, or later payoff could change the conclusion.";
  const confidenceAfter = confidence(
    Math.max(
      0,
      confidenceValue
        - (applicableExceptions.length > 0 ? 0.08 : 0.03)
        - (decision.evidence.candidates.length === 0 ? 0.05 : 0),
    ),
  );
  const confidenceDelta = Number((confidenceAfter - confidenceValue).toFixed(6));
  const reasonChanges = uniqueStrings([
    `Initial reason: ${decision.reason}`,
    `Self-critique: ${reviewerName} noted alternate context and counter-reading risk.`,
    `Confidence adjusted from ${confidenceValue.toFixed(6)} to ${confidenceAfter.toFixed(6)}.`,
  ]);
  const revisionNeeded = applicableExceptions.length > 0 || confidenceAfter < confidenceValue;
  const revision = Object.freeze({
    approved: !revisionNeeded,
    recommendation: revisionNeeded
      ? `Revise recommendation: ${reviewerName} should account for the stronger contextual reading before finalizing.`
      : "Approve the original recommendation.",
    reason: revisionNeeded
      ? uniqueStrings([
          ...applicableExceptions.map((exception) => exception.reason),
          "A stronger contextual reading or lower post-critique confidence warrants a revised recommendation.",
        ]).join(" | ")
      : "No stronger counter-reading was found during self-critique.",
  });

  return Object.freeze({
    whyCouldIBeWrong: applicableExceptions.length > 0
      ? applicableExceptions.map((exception) => exception.reason).join(" | ")
      : "A different reviewer could interpret the same evidence with more contextual caution.",
    contradictingEvidence: Object.freeze(contradictingEvidence),
    assumptions: Object.freeze(assumptions),
    possibleDisagreement,
    missedContext,
    confidenceBefore: confidenceValue,
    confidenceAfter,
    confidenceDelta,
    reasonChanges: Object.freeze(reasonChanges),
    critique: applicableExceptions.length > 0
      ? applicableExceptions.map((exception) => exception.reason).join(" | ")
      : "A different reviewer could interpret the same evidence with more contextual caution.",
    revision,
    finalConfidence: confidenceAfter,
  });
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
  const selfCritique = Object.freeze({
    whyCouldIBeWrong: minorityOpinions.length > 0
      ? `Specialist disagreement exists for ${minorityOpinions[0]?.reviewerName ?? "another reviewer"}; context may support a different reading.`
      : "Consensus can still miss a subtle contextual exception or broader narrative framing.",
    contradictingEvidence: Object.freeze(uniqueStrings([
      ...minorityOpinions.flatMap((opinion) => opinion.supportingEvidence),
    ])),
    assumptions: Object.freeze([
      "I assumed the majority specialist interpretation is the most stable reading.",
      "I assumed no stronger unseen exception overrides the apparent consensus.",
    ]),
    possibleDisagreement: "A specialist reviewer could legitimately prioritize a narrower exception or different context signal.",
    missedContext: "The scene could contain framing, quotation, or narrative context that shifts the committee outcome.",
    confidenceBefore: averageConfidenceValue,
    confidenceAfter: confidence(Math.max(0, averageConfidenceValue - (disagreementScore >= 0.35 ? 0.05 : 0.02))),
    confidenceDelta: Number((confidence(Math.max(0, averageConfidenceValue - (disagreementScore >= 0.35 ? 0.05 : 0.02))) - averageConfidenceValue).toFixed(6)),
    reasonChanges: Object.freeze([
      `Initial committee reason: ${primaryDecision.reason}`,
      "Self-critique: committee consensus may still underweight a minority contextual reading.",
    ]),
    critique: minorityOpinions.length > 0
      ? `Specialist disagreement exists for ${minorityOpinions[0]?.reviewerName ?? "another reviewer"}; context may support a different reading.`
      : "Consensus can still miss a subtle contextual exception or broader narrative framing.",
    revision: Object.freeze({
      approved: minorityOpinions.length === 0 && disagreementScore < 0.35,
      recommendation: minorityOpinions.length > 0 || disagreementScore >= 0.35
        ? "Revise recommendation: committee should account for minority specialist context before finalizing."
        : "Approve the original recommendation.",
      reason: minorityOpinions.length > 0
        ? `Minority opinions identified: ${minorityOpinions.map((opinion) => opinion.reviewerName).join(", ")}.`
        : "Consensus remains stable after self-critique.",
    }),
    finalConfidence: confidence(Math.max(0, averageConfidenceValue - (disagreementScore >= 0.35 ? 0.05 : 0.02))),
  });

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
    selfCritique,
  });
}

function consultationTargetsFor(reviewerName: string): readonly string[] {
  return CONSULTATION_TARGETS[normalizeText(reviewerName)] ?? Object.freeze(["General Reviewer"]);
}

function buildConsultationOpinionSummary(opinion: ReviewerDebateOpinion): ReviewerDebateConsultationOpinion {
  return Object.freeze({
    reviewerId: opinion.reviewerId,
    reviewerName: opinion.reviewerName,
    status: opinion.status,
    confidence: opinion.confidence,
    reasoning: opinion.reasoning,
    supportingEvidence: [...opinion.supportingEvidence],
    articleIds: [...opinion.suggestedArticles],
  });
}

function buildConsultationSummary(
  consultedOpinions: readonly ReviewerDebateOpinion[],
  sourceOpinion: ReviewerDebateOpinion,
): ReviewerDebateConsultationSummary {
  const supporting = consultedOpinions.filter((opinion) => opinion.status === sourceOpinion.status || opinion.confidence >= sourceOpinion.confidence);
  const opposing = consultedOpinions.filter((opinion) => opinion.status !== sourceOpinion.status && opinion.confidence < sourceOpinion.confidence);
  const consensusScore = confidence(consultedOpinions.length > 0 ? supporting.length / consultedOpinions.length : 1);
  const disagreementScore = confidence(1 - consensusScore);

  return Object.freeze({
    consultedReviewerIds: Object.freeze(consultedOpinions.map((opinion) => opinion.reviewerId)),
    consultedReviewerNames: Object.freeze(consultedOpinions.map((opinion) => opinion.reviewerName)),
    supportingReviewerIds: Object.freeze(supporting.map((opinion) => opinion.reviewerId)),
    supportingReviewerNames: Object.freeze(supporting.map((opinion) => opinion.reviewerName)),
    opposingReviewerIds: Object.freeze(opposing.map((opinion) => opinion.reviewerId)),
    opposingReviewerNames: Object.freeze(opposing.map((opinion) => opinion.reviewerName)),
    consultedEvidence: Object.freeze(uniqueStrings(consultedOpinions.flatMap((opinion) => opinion.supportingEvidence))),
    consensusScore,
    disagreementScore,
  });
}

function buildConsultationGraph(opinions: readonly ReviewerDebateOpinion[]): ReviewerDebateConsultationGraph {
  const opinionsByName = new Map(opinions.map((opinion) => [opinion.reviewerName, opinion] as const));
  const opinionById = new Map(opinions.map((opinion) => [opinion.reviewerId, opinion] as const));
  const entries: ReviewerDebateConsultationEntry[] = [];
  const supportingReviewers = new Set<string>();
  const opposingReviewers = new Set<string>();

  for (const opinion of opinions) {
    const requestedReviewerNames = uniqueStrings(
      consultationTargetsFor(opinion.reviewerName).filter((reviewerName) => reviewerName !== opinion.reviewerName && opinionsByName.has(reviewerName)),
    );
    const requestedReviewerIds = requestedReviewerNames.map((reviewerName) => opinionsByName.get(reviewerName)!.reviewerId);
    const consultedOpinions = requestedReviewerIds.map((reviewerId) => opinionById.get(reviewerId)!).filter(Boolean);
    const primaryOpinion = buildConsultationOpinionSummary(opinion);
    const secondaryOpinions = consultedOpinions.map((consultedOpinion) => buildConsultationOpinionSummary(consultedOpinion));
    const supportingOpinionNames = uniqueStrings(
      consultedOpinions
        .filter((consultedOpinion) => consultedOpinion.status === opinion.status || consultedOpinion.confidence >= opinion.confidence)
        .map((consultedOpinion) => consultedOpinion.reviewerName),
    );
    const opposingOpinionNames = uniqueStrings(
      consultedOpinions
        .filter((consultedOpinion) => consultedOpinion.status !== opinion.status && consultedOpinion.confidence < opinion.confidence)
        .map((consultedOpinion) => consultedOpinion.reviewerName),
    );

    supportingOpinionNames.forEach((name) => supportingReviewers.add(name));
    opposingOpinionNames.forEach((name) => opposingReviewers.add(name));

    const consultationSummary = buildConsultationSummary(consultedOpinions, opinion);
    entries.push(Object.freeze({
      reviewerId: opinion.reviewerId,
      reviewerName: opinion.reviewerName,
      moduleId: opinion.moduleId,
      moduleTitle: opinion.moduleTitle,
      difficultCandidate: opinion.needsHumanReview || opinion.status !== "accept" || opinion.confidence < 0.85,
      consultationReason: requestedReviewerNames.length > 0
        ? "Deterministic peer consultation for specialist calibration."
        : "No consultation targets configured.",
      requestedReviewerIds: Object.freeze(requestedReviewerIds),
      requestedReviewerNames: Object.freeze(requestedReviewerNames),
      primaryOpinion,
      secondaryOpinions: Object.freeze(secondaryOpinions),
      supportingReviewerIds: Object.freeze(supportingOpinionNames.map((name) => opinionsByName.get(name)?.reviewerId ?? name)),
      supportingReviewerNames: Object.freeze(supportingOpinionNames),
      opposingReviewerIds: Object.freeze(opposingOpinionNames.map((name) => opinionsByName.get(name)?.reviewerId ?? name)),
      opposingReviewerNames: Object.freeze(opposingOpinionNames),
      consensusScore: consultationSummary.consensusScore,
      disagreementScore: consultationSummary.disagreementScore,
      supportingEvidence: consultationSummary.consultedEvidence,
    }));
  }

  const consensusScore = average(entries.map((entry) => entry.consensusScore));
  const disagreementScore = average(entries.map((entry) => entry.disagreementScore));

  return Object.freeze({
    entries: Object.freeze([...entries].sort((left, right) => left.reviewerName.localeCompare(right.reviewerName))),
    supportingReviewers: Object.freeze([...supportingReviewers].sort((left, right) => left.localeCompare(right))),
    opposingReviewers: Object.freeze([...opposingReviewers].sort((left, right) => left.localeCompare(right))),
    consensusScore,
    disagreementScore,
    consultedReviewerCount: new Set(entries.flatMap((entry) => entry.requestedReviewerNames)).size,
    triggeredReviewerCount: entries.filter((entry) => entry.difficultCandidate || entry.requestedReviewerNames.length > 0).length,
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
  const selfCritique = buildSelfCritique(decision, reviewerName, confidenceValue);

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
    selfCritique,
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
  const reviewerDecision = buildReviewerDecisionContext({
    intelligence: input.analysisResponse.intelligence,
    reviewerReasoningEngine: input.reviewerReasoningEngine,
    subjectModuleArticleIds: input.analysisResponse.legalDecision.articleIds,
  });

  const specialistOpinionsMutable = input.legalModules.map((module) => {
    const decision = evaluateWithModule(module, {
      moduleId: module.id,
      intelligence: input.analysisResponse.intelligence,
      reviewerDecision,
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
  const consultationGraph = buildConsultationGraph(opinions);
  const consultationSummaryByReviewerId = new Map(
    consultationGraph.entries.map((entry) => [
      entry.reviewerId,
      Object.freeze({
        consultedReviewerIds: [...entry.requestedReviewerIds],
        consultedReviewerNames: [...entry.requestedReviewerNames],
        supportingReviewerIds: [...entry.supportingReviewerIds],
        supportingReviewerNames: [...entry.supportingReviewerNames],
        opposingReviewerIds: [...entry.opposingReviewerIds],
        opposingReviewerNames: [...entry.opposingReviewerNames],
        consultedEvidence: [...entry.supportingEvidence],
        consensusScore: entry.consensusScore,
        disagreementScore: entry.disagreementScore,
      }) satisfies ReviewerDebateConsultationSummary,
    ] as const),
  );

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
        consultation: consultationSummaryByReviewerId.get(opinion.reviewerId) ?? null,
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
    consultationGraph,
    gptAssistant: input.gptAssistant ?? null,
  });
}
