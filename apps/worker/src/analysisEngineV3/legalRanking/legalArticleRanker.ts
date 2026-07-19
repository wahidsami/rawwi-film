import { getPolicyArticle } from "../../policyMap.js";
import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { V3ReasonedDecisionArticleEvaluation, V3ReasonedDecisionResult } from "../provider/providerTypes.js";
import type { ReviewerCanonicalArticleOwnershipMap } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { createDefaultReviewerKnowledgeRegistry, resolveKnowledgeDomainCandidateArticleIds } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { findKnowledgeDocumentByArticleReference } from "../knowledge/knowledgeRegistry.js";
import { buildKnowledgeRankingCorpus, clampScore, scoreTerms, uniqueStrings } from "../reviewerKnowledge/knowledgeRanking/knowledgeRankingUtils.js";

export type LegalArticleRankerInput = Readonly<{
  promptInput: V3PromptBuilderInput;
  intelligence: IntelligenceContext;
  reasonedDecision: V3ReasonedDecisionResult;
  selectedReviewerIds: readonly string[];
  canonicalArticleOwnershipByArticleId: ReviewerCanonicalArticleOwnershipMap;
}>;

export type LegalArticleScore = Readonly<{
  articleId: number;
  knowledgeDomains: readonly string[];
  score: number;
  confidence: number;
  reasons: readonly string[];
  candidate: boolean;
  canonicalOwners: readonly string[];
  titleAr: string | null;
  atomIds: readonly string[];
}>;

export type LegalArticleRankerResult = Readonly<{
  knowledgeDomains: readonly string[];
  candidateArticles: readonly number[];
  primaryArticle: number | null;
  secondaryArticles: readonly number[];
  rejectedArticles: readonly number[];
  rankingReason: string;
  confidence: number;
  articleScores: readonly LegalArticleScore[];
  articleEvaluations: readonly V3ReasonedDecisionArticleEvaluation[];
}>;

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function uniqueNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((left, right) => left - right));
}

function uniqueEvidence(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => normalizeText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)),
  );
}

function collectEvidenceTerms(input: LegalArticleRankerInput): readonly string[] {
  const evidenceTerms = [
    ...input.reasonedDecision.supportingEvidence,
    ...input.reasonedDecision.contradictingEvidence,
    ...input.reasonedDecision.alternativeInterpretations,
    input.reasonedDecision.reasoning,
    input.reasonedDecision.narrativeAnalysis,
    input.reasonedDecision.riskAnalysis,
    input.reasonedDecision.humanLikeExplanation,
    input.reasonedDecision.recommendation,
    input.intelligence.semantic.semanticMeaning,
    input.intelligence.semantic.narrativeIntent,
    input.intelligence.semantic.conversationRole,
    input.intelligence.semantic.sceneRole,
    input.intelligence.semantic.speaker ?? "",
    input.intelligence.semantic.listener ?? "",
    input.intelligence.semantic.target ?? "",
    input.intelligence.semantic.victim ?? "",
    input.intelligence.context.localContext,
    input.intelligence.context.chunkContext,
    input.intelligence.context.narrativeContext,
    input.intelligence.narrative.narrativeIntent,
    input.intelligence.narrative.sceneType,
    input.intelligence.narrative.narrativeVoice,
    input.intelligence.narrative.emotionalTone,
    input.intelligence.evidence.candidates.map((candidate) => candidate.text).join(" "),
    ...(input.promptInput.subjectModule.articleIds ?? []).map((articleId) => String(articleId)),
  ];

  return uniqueEvidence(evidenceTerms.flatMap((value) => value.split(/\s+\|\s+|\n+/g)));
}

function collectKnowledgeDomains(input: LegalArticleRankerInput): readonly string[] {
  const domains = [
    ...(input.reasonedDecision.knowledgeDomains ?? []),
    ...(input.reasonedDecision.candidateArticles ?? []).flatMap((articleId) => {
      const knowledgeDocument = findKnowledgeDocumentByArticleReference(articleId);
      return knowledgeDocument?.metadata.knowledgeDomain ? [knowledgeDocument.metadata.knowledgeDomain] : [];
    }),
    ...(input.promptInput.subjectModule.knowledgeDomain ? [input.promptInput.subjectModule.knowledgeDomain] : []),
  ];

  return uniqueEvidence(domains);
}

function buildCandidateArticles(input: LegalArticleRankerInput, knowledgeDomains: readonly string[]): readonly number[] {
  const candidateArticles = new Set<number>();
  const registry = createDefaultReviewerKnowledgeRegistry();

  for (const domain of knowledgeDomains) {
    for (const articleId of resolveKnowledgeDomainCandidateArticleIds(registry, domain)) {
      candidateArticles.add(articleId);
    }
  }

  for (const articleId of input.reasonedDecision.candidateArticles ?? []) {
    if (Number.isFinite(articleId) && articleId > 0) {
      candidateArticles.add(articleId);
    }
  }

  for (const articleId of input.reasonedDecision.applicableArticles ?? []) {
    if (Number.isFinite(articleId) && articleId > 0) {
      candidateArticles.add(articleId);
    }
  }

  for (const articleId of input.promptInput.subjectModule.articleIds ?? []) {
    if (Number.isFinite(articleId) && articleId > 0) {
      candidateArticles.add(articleId);
    }
  }

  return uniqueNumbers([...candidateArticles]);
}

function scoreArticle(input: LegalArticleRankerInput, articleId: number, knowledgeDomains: readonly string[]): LegalArticleScore {
  const knowledgeDocument = findKnowledgeDocumentByArticleReference(articleId);
  const policyArticle = getPolicyArticle(articleId);
  const ownershipCandidates = input.canonicalArticleOwnershipByArticleId[String(articleId)] ?? [];
  const canonicalOwners = uniqueStrings(ownershipCandidates.map((owner) => owner.reviewerLabel));
  const ownershipMatches = ownershipCandidates.some((owner) => input.selectedReviewerIds.includes(owner.reviewerId));
  const articleDomains = uniqueEvidence([
    knowledgeDocument?.metadata.knowledgeDomain ?? "",
    policyArticle?.title_ar ?? "",
    knowledgeDocument?.metadata.title ?? "",
    ...(policyArticle?.atoms ?? []).map((atom) => atom.title_ar),
    ...(knowledgeDocument?.content ? [knowledgeDocument.content] : []),
  ]);
  const articleCorpus = buildKnowledgeRankingCorpus([
    policyArticle?.title_ar ?? "",
    knowledgeDocument?.metadata.title ?? "",
    knowledgeDocument?.content ?? "",
    articleDomains,
    [...(policyArticle?.atoms ?? []).map((atom) => atom.title_ar)],
    input.reasonedDecision.reasoning,
    input.reasonedDecision.narrativeAnalysis,
    input.reasonedDecision.humanLikeExplanation,
    input.reasonedDecision.supportingEvidence,
    input.reasonedDecision.contradictingEvidence,
    input.intelligence.semantic.semanticMeaning,
    input.intelligence.semantic.narrativeIntent,
    input.intelligence.context.localContext,
    input.intelligence.context.narrativeContext,
    input.intelligence.context.chunkContext,
  ]);

  const domainMatch = scoreTerms(articleCorpus, knowledgeDomains, 0.18, 0.54);
  const evidenceMatch = scoreTerms(articleCorpus, collectEvidenceTerms(input), 0.08, 0.28);
  const ownershipBoost = ownershipMatches ? 0.22 : canonicalOwners.length > 0 ? 0.08 : 0;
  const subjectBoost = (input.promptInput.subjectModule.articleIds ?? []).includes(articleId) ? 0.08 : 0;
  const policyBoost = policyArticle ? 0.04 : 0;
  const dialogueBoost = input.intelligence.flags.dialogue && knowledgeDocument?.metadata.primaryEvidence === "Dialogue" ? 0.05 : 0;
  const sceneBoost = input.intelligence.flags.narration && knowledgeDocument?.metadata.primaryEvidence === "SceneDescription" ? 0.03 : 0;
  const verificationPenalty = knowledgeDocument?.metadata.reviewType === "Verification"
    ? (input.intelligence.flags.documentary || input.intelligence.flags.news || input.intelligence.flags.quotation || input.intelligence.flags.historical ? 0.03 : -0.14)
    : 0;

  const score = clampScore(
    domainMatch.score +
    evidenceMatch.score +
    ownershipBoost +
    subjectBoost +
    policyBoost +
    dialogueBoost +
    sceneBoost +
    verificationPenalty,
  );

  return Object.freeze({
    articleId,
    knowledgeDomains: Object.freeze(articleDomains),
    score,
    confidence: score,
    reasons: Object.freeze(uniqueStrings([
      ...(domainMatch.matchedTerms.length > 0 ? [`domain:${domainMatch.matchedTerms.join(",")}`] : []),
      ...(evidenceMatch.matchedTerms.length > 0 ? [`evidence:${evidenceMatch.matchedTerms.join(",")}`] : []),
      ...(ownershipMatches ? ["canonical_ownership"] : canonicalOwners.length > 0 ? ["canonical_owner_overlap"] : []),
      ...(subjectBoost > 0 ? ["subject_module"] : []),
      ...(policyBoost > 0 ? ["policy_map"] : []),
      ...(dialogueBoost > 0 ? ["dialogue_primary_evidence"] : []),
      ...(sceneBoost > 0 ? ["scene_description_primary_evidence"] : []),
      ...(verificationPenalty < 0 ? ["verification_penalty"] : verificationPenalty > 0 ? ["verification_context"] : []),
    ])),
    candidate: true,
    canonicalOwners,
    titleAr: policyArticle?.title_ar ?? knowledgeDocument?.metadata.title ?? null,
    atomIds: Object.freeze([...(policyArticle?.atoms ?? []).map((atom) => atom.atomId)]),
  });
}

export function rankLegalArticles(input: LegalArticleRankerInput): LegalArticleRankerResult {
  const knowledgeDomains = collectKnowledgeDomains(input);
  const candidateArticles = buildCandidateArticles(input, knowledgeDomains);
  const articleScores = candidateArticles
    .map((articleId) => scoreArticle(input, articleId, knowledgeDomains))
    .sort((left, right) => right.score - left.score || left.articleId - right.articleId);

  const primaryArticle = articleScores[0]?.articleId ?? null;
  const secondaryArticles = uniqueNumbers(
    articleScores
      .slice(1)
      .filter((score) => score.score > 0)
      .slice(0, 2)
      .map((score) => score.articleId),
  );
  const rankedCandidateArticles = uniqueNumbers([
    ...(primaryArticle !== null ? [primaryArticle] : []),
    ...secondaryArticles,
  ]);
  const rejectedArticles = uniqueNumbers(articleScores.filter((score) => !rankedCandidateArticles.includes(score.articleId)).map((score) => score.articleId));
  const primaryScore = articleScores[0]?.score ?? 0;
  const confidence = clampScore(primaryScore);
  const primaryReasons = articleScores[0]?.reasons ?? [];
  const rankingReason = primaryArticle === null
    ? "No deterministic GCAM article could be ranked from the supplied knowledge domains."
    : `Primary article ${primaryArticle} selected from ${knowledgeDomains.length > 0 ? knowledgeDomains.join(", ") : "fallback signals"}; reasons: ${primaryReasons.slice(0, 5).join(" | ") || "deterministic ownership bridge"}.`;

  const articleEvaluations: readonly V3ReasonedDecisionArticleEvaluation[] = primaryArticle === null
    ? Object.freeze([])
    : Object.freeze([
        Object.freeze({
          articleId: primaryArticle,
          status: "PASS" as const,
          evidence: Object.freeze(uniqueEvidence([
            ...input.reasonedDecision.supportingEvidence,
            input.intelligence.evidence.candidates[input.intelligence.evidence.primaryCandidateIndex ?? 0]?.text ?? "",
          ])),
          reason: rankingReason,
          confidence,
        }),
      ]);

  return Object.freeze({
    knowledgeDomains,
    candidateArticles: rankedCandidateArticles,
    primaryArticle,
    secondaryArticles,
    rejectedArticles,
    rankingReason,
    confidence,
    articleScores,
    articleEvaluations,
  });
}

export function applyLegalArticleRanking(
  reasonedDecision: V3ReasonedDecisionResult,
  ranking: LegalArticleRankerResult,
): V3ReasonedDecisionResult {
  const candidateArticles = ranking.candidateArticles.length > 0
    ? ranking.candidateArticles
    : reasonedDecision.candidateArticles ?? [];
  const primaryArticle = ranking.primaryArticle ?? reasonedDecision.primaryArticle ?? null;
  const secondaryArticles = ranking.secondaryArticles.length > 0
    ? ranking.secondaryArticles
    : reasonedDecision.secondaryArticles ?? [];
  const articleEvaluations = reasonedDecision.articleEvaluations.length > 0
    ? reasonedDecision.articleEvaluations
    : ranking.articleEvaluations;

  const applicableArticles = articleEvaluations
    .filter((evaluation) => evaluation.status === "PASS")
    .map((evaluation) => evaluation.articleId);
  const rejectedArticles = uniqueNumbers([
    ...(reasonedDecision.rejectedArticles ?? []),
    ...ranking.rejectedArticles,
  ]);

  return Object.freeze({
    ...reasonedDecision,
    knowledgeDomains: ranking.knowledgeDomains.length > 0 ? ranking.knowledgeDomains : reasonedDecision.knowledgeDomains ?? [],
    candidateArticles,
    primaryArticle,
    secondaryArticles,
    articleEvaluations,
    applicableArticles,
    rejectedArticles,
    recommendation: reasonedDecision.recommendation || ranking.rankingReason,
    reasoning: reasonedDecision.reasoning || ranking.rankingReason,
  });
}
