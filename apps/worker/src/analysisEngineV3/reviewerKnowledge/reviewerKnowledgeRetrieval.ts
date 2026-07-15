import { createHash } from "node:crypto";

import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { V3PromptSubjectModule } from "../builder/builderTypes.js";
import { createDefaultReviewerKnowledgeRegistry, type ReviewerKnowledgeRegistry } from "./reviewerKnowledgeRegistry.js";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { createDecisionMemoryRetrievalReport, type DecisionMemoryRetrievalReport } from "./decisionMemory/decisionMemoryRetrieval.js";
import {
  buildKnowledgeRankingCorpus,
  clampScore,
  hashKnowledgeRankingValue,
  scoreOverlap,
  scoreTerms,
  uniqueNumbers,
} from "./knowledgeRanking/knowledgeRankingUtils.js";

type ReviewerKnowledgeRetrievalSource = "concept_context" | "assessment" | "subject_module" | "pack_trigger" | "pack_corpus" | "pack_articles";

export type ReviewerKnowledgeRetrievalItem = Readonly<{
  id: string;
  title: string;
  moduleId: string;
  score: number;
  confidence: number;
  reasons: readonly string[];
  source: readonly string[];
  triggerConceptIds: readonly string[];
  articleIds: readonly number[];
  selected: boolean;
}>;

export type ReviewerKnowledgeRetrievalReport = Readonly<{
  queryTerms: readonly string[];
  selectedPacks: readonly ReviewerKnowledgePack[];
  selectedPackIds: readonly string[];
  retrievedPacks: readonly ReviewerKnowledgeRetrievalItem[];
  rejectedPacks: readonly ReviewerKnowledgeRetrievalItem[];
  knowledgeScore: number;
  knowledgeConfidence: number;
  knowledgeSource: string;
  topK: number;
  cacheKey: string;
  cacheHit: boolean;
  decisionMemoryRetrieval: DecisionMemoryRetrievalReport;
}>;

export type ReviewerKnowledgeRetrievalInput = Readonly<{
  assessment: ReviewerAssessment;
  conceptContext: ConceptContext;
  subjectModule?: V3PromptSubjectModule | null;
  registry?: ReviewerKnowledgeRegistry;
  topK?: number;
}>;

const DEFAULT_TOP_K = 5;
const retrievalCache = new Map<string, ReviewerKnowledgeRetrievalReport>();

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function uniqueNonEmpty(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function collectAssessmentTerms(assessment: ReviewerAssessment): readonly string[] {
  return uniqueNonEmpty([
    assessment.methodologyId,
    assessment.methodologyTitle,
    assessment.narrativeUnderstanding,
    assessment.speaker ?? "",
    assessment.target ?? "",
    assessment.victim ?? "",
    assessment.narrativeIntent,
    assessment.contextClassification,
    assessment.literalVsImpliedMeaning,
    ...(assessment.exceptionSignals ?? []),
    ...(assessment.reasoningTrace ?? []),
    ...(assessment.stageResults ?? []).map((stage) => stage.summary),
    ...(assessment.applicableConceptIds ?? []),
    `confidence:${assessment.confidence.toFixed(6)}`,
    `evidence:${assessment.evidenceStrength.toFixed(6)}`,
  ]);
}

function collectConceptTerms(conceptContext: ConceptContext): readonly string[] {
  return uniqueNonEmpty([
    ...(conceptContext.conceptIds ?? []),
    conceptContext.primaryConceptId ?? "",
    ...(conceptContext.concepts ?? []).flatMap((concept) => [
      concept.id,
      concept.label,
      ...(concept.originatingSentences ?? []),
      ...(concept.entityReferences ?? []),
      ...(concept.glossaryReferences ?? []),
      ...(concept.evidenceSources ?? []).flatMap((source) => [
        source.sourceText,
        source.originatingSentence ?? "",
        source.glossaryTerm ?? "",
        source.entityId ?? "",
      ]),
    ]),
  ]);
}

function collectSubjectTerms(subjectModule: V3PromptSubjectModule | null | undefined): readonly string[] {
  if (!subjectModule) return Object.freeze([]);
  return uniqueNonEmpty([
    subjectModule.id,
    subjectModule.titleAr,
    subjectModule.scope ?? "",
    ...(subjectModule.rules ?? []),
    ...(subjectModule.exclusions ?? []),
    ...(subjectModule.requiredEvidence ?? []),
    ...(subjectModule.decisionTree ?? []),
    ...(subjectModule.examples ?? []),
    ...(subjectModule.nonExamples ?? []),
    ...(subjectModule.notes ?? []),
    ...((subjectModule.articleIds ?? []).map((articleId) => String(articleId))),
  ]);
}

function buildPackCorpus(pack: ReviewerKnowledgePack): string {
  return buildKnowledgeRankingCorpus([
    pack.id,
    pack.module_id,
    pack.title,
    pack.purpose,
    pack.default_question_set_id ?? "",
    pack.trigger_concept_ids,
    pack.protected_interests,
    pack.protected_concepts,
    pack.required_evidence,
    pack.insufficient_evidence,
    pack.reviewer_heuristics,
    pack.legal_exceptions,
    pack.positive_examples,
    pack.negative_examples,
    pack.common_false_positives,
    pack.reporting_guidance,
    pack.glossary_relationships.map((relationship) => [
      relationship.term,
      relationship.concept_id ?? "",
      relationship.relation,
      relationship.note ?? "",
    ]),
    pack.article_mapping.map((mapping) => [
      mapping.article_id,
      mapping.atom_ids,
      mapping.role,
      mapping.note ?? "",
    ]),
  ]);
}

function scorePack(
  pack: ReviewerKnowledgePack,
  queryTerms: readonly string[],
  conceptTerms: readonly string[],
  subjectTerms: readonly string[],
  subjectArticleIds: readonly number[],
): ReviewerKnowledgeRetrievalItem {
  const corpus = buildPackCorpus(pack);
  const sources = new Set<ReviewerKnowledgeRetrievalSource>();
  const reasons = new Set<string>();
  const triggerConceptIds = uniqueNonEmpty(pack.trigger_concept_ids);
  const articleIds = uniqueNumbers(pack.article_mapping.map((mapping) => mapping.article_id));

  const subjectMatch = scoreTerms(corpus, subjectTerms, 0.05, 0.24);
  if (subjectMatch.score > 0) {
    sources.add("assessment");
    reasons.add("assessment");
  }

  const conceptMatch = scoreTerms(corpus, conceptTerms, 0.07, 0.28);
  if (conceptMatch.score > 0) {
    sources.add("concept_context");
    reasons.add("concept");
  }

  const triggerMatch = scoreTerms(corpus, triggerConceptIds, 0.12, 0.4);
  if (triggerMatch.score > 0) {
    sources.add("pack_trigger");
    reasons.add("trigger_concepts");
  }

  const packCorpusMatch = scoreTerms(corpus, queryTerms, 0.03, 0.18);
  if (packCorpusMatch.score > 0) {
    sources.add("pack_corpus");
    reasons.add("pack_corpus");
  }

  const articleMatch = subjectArticleIds.length > 0
    ? scoreOverlap(articleIds, subjectArticleIds, 0.14, 0.42)
    : { score: 0, matched: Object.freeze([] as number[]) };
  if (articleMatch.score > 0) {
    sources.add("pack_articles");
    reasons.add("pack_articles");
  }

  const score = clampScore(subjectMatch.score + conceptMatch.score + triggerMatch.score + packCorpusMatch.score + articleMatch.score);

  return Object.freeze({
    id: pack.id,
    title: pack.title,
    moduleId: pack.module_id,
    score,
    confidence: score,
    reasons: Object.freeze([...reasons].sort((left, right) => left.localeCompare(right))),
    source: Object.freeze([...sources].sort((left, right) => left.localeCompare(right))),
    triggerConceptIds: Object.freeze([...triggerConceptIds].sort((left, right) => left.localeCompare(right))),
    articleIds: Object.freeze([...articleIds].sort((left, right) => left - right)),
    selected: false,
  });
}

function hashCacheKey(
  input: ReviewerKnowledgeRetrievalInput,
  registry: ReviewerKnowledgeRegistry,
  queryTerms: readonly string[],
  decisionMemoryCacheKey: string,
): string {
  return createHash("sha256").update(hashKnowledgeRankingValue({
    assessment: input.assessment,
    conceptContext: input.conceptContext,
    subjectModule: input.subjectModule ?? null,
    queryTerms,
    decisionMemoryCacheKey,
    registry: registry.list().map((pack) => ({
      id: pack.id,
      moduleId: pack.module_id,
      title: pack.title,
      triggerConceptIds: [...pack.trigger_concept_ids],
      articleIds: pack.article_mapping.map((mapping) => mapping.article_id),
    })),
    topK: input.topK ?? DEFAULT_TOP_K,
  }), "utf8").digest("hex");
}

function computeKnowledgeConfidence(items: readonly ReviewerKnowledgeRetrievalItem[]): number {
  const scores = items.filter((item) => item.score > 0).slice(0, 5).map((item) => item.score);
  if (scores.length === 0) return 0;
  const average = scores.reduce((total, value) => total + value, 0) / scores.length;
  return clampScore(average);
}

function buildQueryTerms(input: ReviewerKnowledgeRetrievalInput): readonly string[] {
  const assessmentTerms = collectAssessmentTerms(input.assessment);
  const conceptTerms = collectConceptTerms(input.conceptContext);
  const subjectTerms = collectSubjectTerms(input.subjectModule);
  return uniqueNonEmpty([
    ...assessmentTerms,
    ...conceptTerms,
    ...subjectTerms,
  ]);
}

function buildSubjectArticleIds(subjectModule: V3PromptSubjectModule | null | undefined): readonly number[] {
  return Object.freeze([...new Set((subjectModule?.articleIds ?? []).filter((value) => Number.isFinite(value)))].sort((left, right) => left - right));
}

export function createReviewerKnowledgeRetrievalReport(input: ReviewerKnowledgeRetrievalInput): ReviewerKnowledgeRetrievalReport {
  const registry = input.registry ?? createDefaultReviewerKnowledgeRegistry();
  const topK = Math.max(1, input.topK ?? DEFAULT_TOP_K);
  const queryTerms = buildQueryTerms(input);
  const subjectTerms = collectSubjectTerms(input.subjectModule);
  const conceptTerms = collectConceptTerms(input.conceptContext);
  const subjectArticleIds = buildSubjectArticleIds(input.subjectModule);
  const decisionMemoryRetrieval = createDecisionMemoryRetrievalReport({
    assessment: input.assessment,
    conceptContext: input.conceptContext,
    subjectModule: input.subjectModule ?? null,
    topK,
  });
  const cacheKey = hashCacheKey(input, registry, queryTerms, decisionMemoryRetrieval.cacheKey);
  const cached = retrievalCache.get(cacheKey);
  if (cached) {
    return Object.freeze({
      ...cached,
      cacheHit: true,
    });
  }

  const universalPack = registry.load("v3_00_universal");
  const scored = registry.list()
    .filter((pack) => normalizeText(pack.id) !== "v3_00_universal")
    .map((pack) => scorePack(pack, queryTerms, conceptTerms, subjectTerms, subjectArticleIds))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const selected = new Map<string, ReviewerKnowledgeRetrievalItem>();
  if (universalPack) {
    selected.set(universalPack.id, Object.freeze({
      id: universalPack.id,
      title: universalPack.title,
      moduleId: universalPack.module_id,
      score: 0.25,
      confidence: 0.25,
      reasons: Object.freeze(["universal"]),
      source: Object.freeze(["assessment", "concept_context"]),
      triggerConceptIds: Object.freeze([...universalPack.trigger_concept_ids].sort((left, right) => left.localeCompare(right))),
      articleIds: Object.freeze([...new Set(universalPack.article_mapping.map((mapping) => mapping.article_id))].sort((left, right) => left - right)),
      selected: true,
    }));
  }

  for (const item of scored) {
    if (selected.size >= topK) break;
    selected.set(item.id, Object.freeze({ ...item, selected: true }));
  }

  const selectedIds = new Set([...selected.keys()]);
  const retrievedPacks = Object.freeze([
    ...(universalPack ? [selected.get(universalPack.id)!] : []),
    ...scored.filter((item) => selectedIds.has(item.id)),
  ]);
  const rejectedPacks = Object.freeze(scored.filter((item) => !selectedIds.has(item.id)));
  const selectedPacks = Object.freeze([...selected.values()].map((item) => registry.load(item.id)).filter((pack): pack is ReviewerKnowledgePack => pack !== null).sort((left, right) => {
    if (normalizeText(left.id) === "v3_00_universal") return -1;
    if (normalizeText(right.id) === "v3_00_universal") return 1;
    const leftSelected = selected.get(left.id);
    const rightSelected = selected.get(right.id);
    const leftScore = leftSelected?.score ?? 0;
    const rightScore = rightSelected?.score ?? 0;
    return rightScore - leftScore || left.id.localeCompare(right.id);
  }));

  const knowledgeConfidence = computeKnowledgeConfidence([...selected.values()].filter((item) => normalizeText(item.id) !== "v3_00_universal"));
  const knowledgeScore = selected.size > 0
    ? clampScore([...selected.values()].reduce((max, item) => Math.max(max, item.score), 0))
    : 0;

  const report = Object.freeze({
    queryTerms,
    selectedPacks,
    selectedPackIds: Object.freeze(selectedPacks.map((pack) => pack.id)),
    retrievedPacks,
    rejectedPacks,
    knowledgeScore,
    knowledgeConfidence,
    knowledgeSource: "ranked_retrieval",
    topK,
    cacheKey,
    cacheHit: false,
    decisionMemoryRetrieval,
  });
  retrievalCache.set(cacheKey, report);
  return report;
}
