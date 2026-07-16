import type { ConceptContext } from "../../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../../reviewerMethodology/reviewerMethodologyTypes.js";
import type { V3PromptSubjectModule } from "../../builder/builderTypes.js";
import { config } from "../../../config.js";
import { createDefaultDecisionMemoryRegistry } from "./decisionMemory.js";
import type { DecisionMemoryRegistry, DecisionMemorySearchResult } from "./decisionMemoryTypes.js";
import { hashDecisionMemoryValue } from "./decisionMemoryUtils.js";

export type DecisionMemoryRetrievalItem = Readonly<{
  id: string;
  sourceId: string;
  title: string;
  summary: string;
  status: string;
  confidence: string;
  confidenceScore: number;
  similarity: number;
  memoryInfluence: number;
  why: string;
  evidence: readonly string[];
  articleIds: readonly number[];
  atomIds: readonly string[];
  concepts: readonly string[];
  reasoning: readonly string[];
  benchmarkTags: readonly string[];
  relatedLessons: readonly string[];
  relatedPatterns: readonly string[];
  relatedBlueprintConcepts: readonly string[];
  falsePositiveRisk: string;
  reviewerDecision: string;
  findingType: string;
  selected: boolean;
  reasons: readonly string[];
}>;

export type DecisionMemoryRetrievalReport = Readonly<{
  queryTerms: readonly string[];
  retrievedMemories: readonly DecisionMemoryRetrievalItem[];
  rejectedMemories: readonly DecisionMemoryRetrievalItem[];
  selectedMemoryIds: readonly string[];
  memoryScore: number;
  memoryConfidence: number;
  memorySource: string;
  topK: number;
  cacheKey: string;
  cacheHit: boolean;
}>;

export type DecisionMemoryRetrievalInput = Readonly<{
  assessment: ReviewerAssessment;
  conceptContext: ConceptContext;
  subjectModule?: V3PromptSubjectModule | null;
  registry?: DecisionMemoryRegistry;
  topK?: number;
}>;

const DEFAULT_TOP_K = 5;
const retrievalCache = new Map<string, DecisionMemoryRetrievalReport>();

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

function buildQueryTerms(input: DecisionMemoryRetrievalInput): readonly string[] {
  return uniqueNonEmpty([
    ...collectAssessmentTerms(input.assessment),
    ...collectConceptTerms(input.conceptContext),
    ...collectSubjectTerms(input.subjectModule),
  ]);
}

function buildSubjectArticleIds(subjectModule: V3PromptSubjectModule | null | undefined): readonly number[] {
  return Object.freeze([...new Set((subjectModule?.articleIds ?? []).filter((value) => Number.isFinite(value)))].sort((left, right) => left - right));
}

function scoreToSimilarity(score: number): number {
  return Number(Math.max(0, Math.min(1, score / 18)).toFixed(6));
}

function buildCacheKey(input: DecisionMemoryRetrievalInput, registry: DecisionMemoryRegistry, queryTerms: readonly string[]): string {
  return hashDecisionMemoryValue({
    assessment: input.assessment,
    conceptContext: input.conceptContext,
    subjectModule: input.subjectModule ?? null,
    queryTerms,
    registry: registry.list().map((entry) => ({
      id: entry.id,
      status: entry.status,
      articleIds: [...entry.articleIds],
      concepts: [...entry.concepts],
      confidence: entry.confidence,
    })),
    topK: input.topK ?? DEFAULT_TOP_K,
  });
}

function buildDisabledReport(
  input: DecisionMemoryRetrievalInput,
  queryTerms: readonly string[],
  topK: number,
): DecisionMemoryRetrievalReport {
  const cacheKey = hashDecisionMemoryValue({
    disabled: true,
    queryTerms,
    subjectModule: input.subjectModule ?? null,
    topK,
  });
  const report = Object.freeze({
    queryTerms,
    retrievedMemories: Object.freeze([] as readonly DecisionMemoryRetrievalItem[]),
    rejectedMemories: Object.freeze([] as readonly DecisionMemoryRetrievalItem[]),
    selectedMemoryIds: Object.freeze([] as readonly string[]),
    memoryScore: 0,
    memoryConfidence: 0,
    memorySource: "disabled",
    topK,
    cacheKey,
    cacheHit: false,
  });
  retrievalCache.set(cacheKey, report);
  return report;
}

function selectTopMemories(results: readonly DecisionMemorySearchResult[], topK: number): readonly DecisionMemoryRetrievalItem[] {
  return Object.freeze(
    results.slice(0, topK).map((result) => {
      const similarity = scoreToSimilarity(result.score);
      const memoryInfluence = Number(Math.max(0, Math.min(1, similarity * result.entry.confidenceScore)).toFixed(6));
      return Object.freeze({
        id: result.entry.id,
        sourceId: result.entry.sourceId,
        title: result.entry.title,
        summary: result.entry.summary,
        status: result.entry.status,
        confidence: result.entry.confidence,
        confidenceScore: result.entry.confidenceScore,
        similarity,
        memoryInfluence,
        why: result.entry.why,
        evidence: [...result.entry.evidence],
        articleIds: [...result.entry.articleIds],
        atomIds: [...result.entry.atomIds],
        concepts: [...result.entry.concepts],
        reasoning: [...result.entry.reasoning],
        benchmarkTags: [...result.entry.benchmarkTags],
        relatedLessons: [...result.entry.relatedLessons],
        relatedPatterns: [...result.entry.relatedPatterns],
        relatedBlueprintConcepts: [...result.entry.relatedBlueprintConcepts],
        falsePositiveRisk: result.entry.falsePositiveRisk,
        reviewerDecision: result.entry.reviewerDecision,
        findingType: result.entry.findingType,
        selected: true,
        reasons: [...result.reasons],
      });
    }),
  );
}

export function createDecisionMemoryRetrievalReport(input: DecisionMemoryRetrievalInput): DecisionMemoryRetrievalReport {
  const topK = Math.max(1, input.topK ?? DEFAULT_TOP_K);
  const queryTerms = buildQueryTerms(input);
  if (!config.ENABLE_DECISION_MEMORY) {
    return buildDisabledReport(input, queryTerms, topK);
  }
  const registry = input.registry ?? createDefaultDecisionMemoryRegistry();
  const subjectArticleIds = buildSubjectArticleIds(input.subjectModule);
  const cacheKey = buildCacheKey(input, registry, queryTerms);
  const cached = retrievalCache.get(cacheKey);
  if (cached) {
    return Object.freeze({
      ...cached,
      cacheHit: true,
    });
  }

  const searched = registry.search({
    articleId: subjectArticleIds[0] ?? null,
    concept: input.conceptContext.primaryConceptId ?? input.subjectModule?.id ?? null,
    keyword: queryTerms.slice(0, 18).join(" "),
    status: null,
    benchmarkTag: null,
  });

  const selected = selectTopMemories(searched, topK);
  const selectedIds = new Set(selected.map((item) => item.id));
  const rejectedMemories = Object.freeze(
    searched
      .filter((result) => !selectedIds.has(result.entry.id))
      .map((result) => {
        const similarity = scoreToSimilarity(result.score);
        const memoryInfluence = Number(Math.max(0, Math.min(1, similarity * result.entry.confidenceScore)).toFixed(6));
        return Object.freeze({
          id: result.entry.id,
          sourceId: result.entry.sourceId,
          title: result.entry.title,
          summary: result.entry.summary,
          status: result.entry.status,
          confidence: result.entry.confidence,
          confidenceScore: result.entry.confidenceScore,
          similarity,
          memoryInfluence,
          why: result.entry.why,
          evidence: [...result.entry.evidence],
          articleIds: [...result.entry.articleIds],
          atomIds: [...result.entry.atomIds],
          concepts: [...result.entry.concepts],
          reasoning: [...result.entry.reasoning],
          benchmarkTags: [...result.entry.benchmarkTags],
          relatedLessons: [...result.entry.relatedLessons],
          relatedPatterns: [...result.entry.relatedPatterns],
          relatedBlueprintConcepts: [...result.entry.relatedBlueprintConcepts],
          falsePositiveRisk: result.entry.falsePositiveRisk,
          reviewerDecision: result.entry.reviewerDecision,
          findingType: result.entry.findingType,
          selected: false,
          reasons: [...result.reasons],
        });
      }),
  );
  const memoryScore = selected.length > 0 ? Number(Math.max(...selected.map((item) => item.similarity)).toFixed(6)) : 0;
  const memoryConfidence = selected.length > 0 ? Number(Math.max(0, Math.min(1, selected.reduce((sum, item) => sum + item.memoryInfluence, 0) / selected.length)).toFixed(6)) : 0;

  const report = Object.freeze({
    queryTerms,
    retrievedMemories: selected,
    rejectedMemories,
    selectedMemoryIds: Object.freeze(selected.map((item) => item.id)),
    memoryScore,
    memoryConfidence,
    memorySource: "decision_memory_registry",
    topK,
    cacheKey,
    cacheHit: false,
  });
  retrievalCache.set(cacheKey, report);
  return report;
}
