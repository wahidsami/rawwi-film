import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import { createCaseLibraryRegistry } from "../reviewerKnowledge/caseLibrary/caseLibrary.js";
import { createDecisionMemoryRegistry } from "../reviewerKnowledge/decisionMemory/decisionMemory.js";
import { createKnowledgeRegistry } from "../reviewerKnowledge/knowledgeRegistry/index.js";
import type { KnowledgeRegistry } from "../reviewerKnowledge/knowledgeRegistry/index.js";
import type { KnowledgeRegistryEntry } from "../reviewerKnowledge/knowledgeRegistry/knowledgeRegistryTypes.js";
import { createDefaultLessonEngine } from "../reviewerKnowledge/lessons/lessonEngine.js";
import type { ReviewerKnowledgeLesson } from "../reviewerKnowledge/lessons/lessonTypes.js";
import { createPrecedentEngineRegistry } from "../reviewerKnowledge/precedentEngine/precedentEngine.js";
import { createReviewerKnowledgeRetrievalReport, type ReviewerKnowledgeRetrievalReport } from "../reviewerKnowledge/reviewerKnowledgeRetrieval.js";
import type { ReviewerKnowledgePack } from "../reviewerKnowledge/reviewerKnowledgeTypes.js";
import type { V3PromptBuilderInput, V3PromptJsonObject, V3PromptSubjectModule } from "./builderTypes.js";
import { buildKnowledgeRankingCorpus, scoreTerms, uniqueStrings } from "../reviewerKnowledge/knowledgeRanking/knowledgeRankingUtils.js";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import { splitSentenceEvidenceCandidates } from "../evidence/evidenceCandidates.js";

type ReasoningEngineEntry = Readonly<{
  id: string;
  title: string;
  kind: string;
  score: number;
  reasons: readonly string[];
  summary: string;
  evidence: readonly string[];
  reasoning: readonly string[];
  decision: string | null;
  relatedIds: readonly string[];
}>;

type ReasoningEngineCase = Readonly<{
  articleId: number | null;
  title: string;
  sourceKind: "gcam_knowledge" | "decision_record";
  primaryCategory: string;
  categories: readonly string[];
  reviewerDecision: string;
  reviewerExplanation: string;
  score: number;
}>;

type ReasoningEnginePrecedent = Readonly<{
  decisionId: string;
  similarity: number;
  reason: string;
  articleIds: readonly number[];
  matchedConcepts: readonly string[];
}>;

export type ReviewerReasoningEnginePayload = V3PromptJsonObject;

let knowledgeRegistryCache: ReturnType<typeof createKnowledgeRegistry> | null = null;
let lessonEngineCache: ReturnType<typeof createDefaultLessonEngine> | null = null;
let caseLibraryCache: ReturnType<typeof createCaseLibraryRegistry> | null = null;
let decisionMemoryCache: ReturnType<typeof createDecisionMemoryRegistry> | null = null;
let precedentEngineCache: ReturnType<typeof createPrecedentEngineRegistry> | null = null;

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return normalizeText(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function uniqueStringsWithNormalization(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function getKnowledgeRegistry(): ReturnType<typeof createKnowledgeRegistry> {
  knowledgeRegistryCache ??= createKnowledgeRegistry();
  return knowledgeRegistryCache;
}

function getLessonEngine(): ReturnType<typeof createDefaultLessonEngine> {
  lessonEngineCache ??= createDefaultLessonEngine();
  return lessonEngineCache;
}

function getCaseLibraryRegistry(): ReturnType<typeof createCaseLibraryRegistry> {
  caseLibraryCache ??= createCaseLibraryRegistry();
  return caseLibraryCache;
}

function getDecisionMemoryRegistry(): ReturnType<typeof createDecisionMemoryRegistry> {
  decisionMemoryCache ??= createDecisionMemoryRegistry();
  return decisionMemoryCache;
}

function getPrecedentEngineRegistry(): ReturnType<typeof createPrecedentEngineRegistry> {
  precedentEngineCache ??= createPrecedentEngineRegistry(getDecisionMemoryRegistry(), getCaseLibraryRegistry());
  return precedentEngineCache;
}

function collectQueryTerms(
  input: V3PromptBuilderInput,
  conceptContext: ConceptContext,
  assessment: ReviewerAssessment,
  packs: readonly ReviewerKnowledgePack[],
): readonly string[] {
  const storyMemory = typeof input.storyMemory === "string"
    ? input.storyMemory
    : [
        input.storyMemory.summary ?? "",
        ...(input.storyMemory.notes ?? []),
        ...(input.storyMemory.scenes ?? []),
      ].join(" | ");

  return uniqueStringsWithNormalization([
    input.subjectModule.id,
    input.subjectModule.titleAr,
    input.subjectModule.scope ?? "",
    ...(input.subjectModule.rules ?? []),
    ...(input.subjectModule.exclusions ?? []),
    ...(input.subjectModule.requiredEvidence ?? []),
    ...(input.subjectModule.decisionTree ?? []),
    ...(input.subjectModule.examples ?? []),
    ...(input.subjectModule.nonExamples ?? []),
    ...(input.subjectModule.notes ?? []),
    input.chunkContext.localChunk,
    ...(input.chunkContext.neighboringSentences ?? []),
    input.chunkContext.sceneMemory ?? "",
    storyMemory,
    ...(input.glossary.entries.flatMap((entry) => [entry.term, entry.definition ?? "", ...(entry.variants ?? [])])),
    ...conceptContext.conceptIds,
    ...conceptContext.concepts.map((concept) => concept.label),
    assessment.narrativeIntent,
    assessment.contextClassification,
    assessment.literalVsImpliedMeaning,
    ...assessment.exceptionSignals,
    ...assessment.reasoningTrace,
    ...packs.flatMap((pack) => [
      pack.id,
      pack.module_id,
      pack.title,
      pack.purpose,
      ...pack.trigger_concept_ids,
      ...pack.protected_interests,
      ...pack.protected_concepts,
      ...pack.required_evidence,
      ...pack.insufficient_evidence,
      ...pack.reviewer_heuristics,
      ...pack.legal_exceptions,
      ...pack.positive_examples,
      ...pack.negative_examples,
      ...pack.common_false_positives,
      ...pack.reporting_guidance,
      ...pack.glossary_relationships.flatMap((relationship) => [relationship.term, relationship.concept_id ?? "", relationship.relation, relationship.note ?? ""]),
      ...pack.article_mapping.flatMap((mapping) => [String(mapping.article_id), ...mapping.atom_ids, mapping.role, mapping.note ?? ""]),
    ]),
  ]);
}

function scoreRegistryEntries(entries: readonly KnowledgeRegistryEntry[], queryTerms: readonly string[], kinds: readonly string[], limit: number): readonly ReasoningEngineEntry[] {
  const scored = entries
    .filter((entry) => kinds.includes(entry.metadata.kind))
    .map((entry) => {
      const corpus = buildKnowledgeRankingCorpus([
        entry.registryKey,
        entry.metadata.id,
        entry.metadata.title,
        entry.metadata.description,
        entry.metadata.version ?? "",
        entry.metadata.kind,
        entry.metadata.domain ?? "",
        entry.metadata.category ?? "",
        entry.metadata.tags,
        entry.metadata.aliases,
        entry.metadata.relatedIds,
        entry.traceability.source ?? "",
        entry.traceability.sourceKind,
        entry.traceability.sourcePath ?? "",
        entry.traceability.sourceDocumentId ?? "",
        entry.traceability.reviewer ?? "",
        entry.traceability.meeting ?? "",
        entry.traceability.date ?? "",
        entry.explainability.summary,
        entry.explainability.evidence,
        entry.explainability.reasoning,
        entry.explainability.decision ?? "",
        entry.explainability.alternativeInterpretations,
        entry.explainability.rejectedInterpretations,
        entry.payload,
      ]);
      const match = scoreTerms(corpus, queryTerms, 0.06, 0.42);
      return Object.freeze({
        id: entry.metadata.id,
        title: entry.metadata.title,
        kind: entry.metadata.kind,
        score: match.score,
        reasons: match.matchedTerms,
        summary: entry.explainability.summary,
        evidence: entry.explainability.evidence,
        reasoning: entry.explainability.reasoning,
        decision: entry.explainability.decision,
        relatedIds: entry.metadata.relatedIds,
      }) satisfies ReasoningEngineEntry;
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id))
    .slice(0, limit);

  return Object.freeze(scored);
}

function normalizePackView(pack: ReviewerKnowledgePack): V3PromptJsonObject {
  return {
    id: pack.id,
    module_id: pack.module_id,
    title: pack.title,
    purpose: pack.purpose,
    trigger_concept_ids: [...pack.trigger_concept_ids],
    protected_interests: [...pack.protected_interests],
    protected_concepts: [...pack.protected_concepts],
    required_evidence: [...pack.required_evidence],
    insufficient_evidence: [...pack.insufficient_evidence],
    reviewer_heuristics: [...pack.reviewer_heuristics],
    legal_exceptions: [...pack.legal_exceptions],
    positive_examples: [...pack.positive_examples],
    negative_examples: [...pack.negative_examples],
    common_false_positives: [...pack.common_false_positives],
    glossary_relationships: pack.glossary_relationships.map((relationship) => ({ ...relationship })),
    article_mapping: pack.article_mapping.map((mapping) => ({ ...mapping })),
    reporting_guidance: [...pack.reporting_guidance],
    default_question_set_id: pack.default_question_set_id ?? null,
  };
}

function buildRelationshipSummaries(packs: readonly ReviewerKnowledgePack[], lessons: readonly ReviewerKnowledgeLesson[]): readonly V3PromptJsonObject[] {
  const relationships: V3PromptJsonObject[] = [];
  const seen = new Set<string>();

  for (const pack of packs) {
    for (const relationship of pack.glossary_relationships) {
      const key = `pack:${pack.id}:${relationship.term}:${relationship.concept_id ?? ""}:${relationship.relation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relationships.push({
        source: "reviewer_knowledge_pack",
        pack_id: pack.id,
        term: relationship.term,
        concept_id: relationship.concept_id ?? null,
        relation: relationship.relation,
        note: relationship.note ?? null,
      });
    }
  }

  for (const lesson of lessons) {
    for (const relationship of lesson.conceptRelationships) {
      const key = `lesson:${lesson.id}:${relationship.fromConceptId}:${relationship.toConceptId}:${relationship.relation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relationships.push({
        source: "lesson",
        lesson_id: lesson.id,
        from_concept_id: relationship.fromConceptId,
        to_concept_id: relationship.toConceptId,
        relation: relationship.relation,
        note: relationship.note ?? null,
      });
    }
  }

  return Object.freeze(relationships.slice(0, 24).map((relationship) => Object.freeze({ ...relationship } as V3PromptJsonObject)));
}

function selectCases(queryTerms: readonly string[], input: V3PromptBuilderInput, assessment: ReviewerAssessment): readonly ReasoningEngineCase[] {
  if (!config.ENABLE_CASE_SELECTION) {
    return Object.freeze([]);
  }
  const registry = getCaseLibraryRegistry();
  const concept = assessment.applicableConceptIds[0] ?? input.subjectModule.id;
  const keyword = uniqueStringsWithNormalization([
    input.chunkContext.localChunk,
    input.subjectModule.titleAr,
    input.subjectModule.scope ?? "",
    ...input.subjectModule.rules ?? [],
    ...input.subjectModule.requiredEvidence ?? [],
  ]).join(" ");
  const articleId = input.subjectModule.articleIds?.[0] ?? null;
  const results = registry.search({ concept, keyword, articleId, category: "similar" }).slice(0, 5);

  return Object.freeze(results.map((result) => Object.freeze({
    articleId: result.entry.articleId,
    title: result.entry.articleTitle,
    sourceKind: "gcam_knowledge",
    primaryCategory: result.entry.cases[0]?.primaryCategory ?? "similar",
    categories: result.entry.cases.length > 0 ? result.entry.cases[0]?.categories ?? [] : [],
    reviewerDecision: result.entry.cases[0]?.reviewerDecision ?? "unknown",
    reviewerExplanation: result.entry.reviewerExplanation,
    score: result.score,
  })));
}

function selectPrecedents(queryTerms: readonly string[], input: V3PromptBuilderInput, assessment: ReviewerAssessment): readonly ReasoningEnginePrecedent[] {
  if (!config.ENABLE_PRECEDENT_SELECTION) {
    return Object.freeze([]);
  }
  const precedentEngine = getPrecedentEngineRegistry();
  const report = precedentEngine.search({
    articleId: input.subjectModule.articleIds?.[0] ?? null,
    concept: assessment.applicableConceptIds[0] ?? input.subjectModule.id,
    keyword: queryTerms.slice(0, 12).join(" "),
    status: null,
  });

  return Object.freeze(report.matches.slice(0, 5).map((match) => Object.freeze({
    decisionId: match.decision.id,
    similarity: match.similarity,
    reason: match.reason,
    articleIds: [...match.matchedArticleIds],
    matchedConcepts: [...match.matchedConcepts],
  })));
}

function buildPromptReviewerDecisionPipeline(
  input: V3PromptBuilderInput,
  conceptContext: ConceptContext,
  assessment: ReviewerAssessment,
  selectedReviewerKnowledge: readonly ReviewerKnowledgePack[],
  lessons: readonly Record<string, unknown>[],
  precedents: readonly ReasoningEnginePrecedent[],
  decisionRecords: readonly ReasoningEngineEntry[],
  knowledgeRetrieval: ReviewerKnowledgeRetrievalReport,
): V3PromptJsonObject {
  const primaryArticleIds = [...new Set(input.subjectModule.articleIds ?? [])].sort((left, right) => left - right);
  const precedentIds = uniqueStringsWithNormalization(precedents.map((precedent) => precedent.decisionId));
  const evidenceCandidates = splitSentenceEvidenceCandidates(input.chunkContext.localChunk, 0, assessment.evidenceStrength);
  const evidenceSummary = uniqueStringsWithNormalization([
    ...evidenceCandidates.map((candidate) => candidate.text),
    ...(input.chunkContext.neighboringSentences ?? []),
    assessment.reasoningTrace.join(" | "),
  ]);
  const articleEvaluationSummary = primaryArticleIds.length > 0
    ? primaryArticleIds.map((articleId) => `article:${articleId}: PASS/FAIL independently from quote-based evidence only`).join(" | ")
    : "No GCAM articles were preselected.";
  const knowledgeSummary = uniqueStringsWithNormalization([
    ...selectedReviewerKnowledge.map((pack) => pack.id),
    ...knowledgeRetrieval.retrievedPacks.map((pack) => `${pack.id}:${pack.score.toFixed(4)}`),
    ...lessons.map((lesson) => stringValue(lesson.id)),
    ...decisionRecords.map((record) => record.id),
    ...knowledgeRetrieval.decisionMemoryRetrieval.retrievedMemories.map((memory) => `${memory.id}:${memory.similarity.toFixed(4)}`),
  ]);
  const preliminaryStatus = assessment.exceptionSignals.length > 0 || assessment.confidence < 0.55
    ? "needs_review"
    : assessment.conceptCount > 0 && assessment.evidenceStrength >= 0.7
      ? "accept"
      : "reject";
  const preliminaryConfidence = Number(
    Math.min(1, Math.max(0, (assessment.confidence + assessment.evidenceStrength + conceptContext.confidence) / 3)).toFixed(6),
  );

  return Object.freeze({
    evidence_candidates: Object.freeze(evidenceCandidates.map((candidate, index) => Object.freeze({
      index,
      text: candidate.text,
      start_offset: candidate.startOffset,
      end_offset: candidate.endOffset,
      confidence: candidate.confidence,
      source: candidate.source,
      notes: [...(candidate.notes ?? [])],
    }))),
    stages: Object.freeze([
      Object.freeze({
        key: "literal_meaning",
        title: "Literal Meaning",
        summary: evidenceCandidates.map((candidate) => candidate.text).join(" | ") || input.chunkContext.localChunk,
        confidence: assessment.evidenceStrength,
      }),
      Object.freeze({
        key: "implied_meaning",
        title: "Implied Meaning",
        summary: assessment.literalVsImpliedMeaning,
        confidence: assessment.confidence,
      }),
      Object.freeze({
        key: "speaker_analysis",
        title: "Speaker Analysis",
        summary: assessment.speaker ?? "Unknown speaker.",
        confidence: assessment.confidence,
      }),
      Object.freeze({
        key: "target_analysis",
        title: "Target Analysis",
        summary: assessment.target ?? "Unknown target.",
        confidence: assessment.confidence,
      }),
      Object.freeze({
        key: "intent_analysis",
        title: "Intent Analysis",
        summary: assessment.narrativeIntent,
        confidence: assessment.confidence,
      }),
      Object.freeze({
        key: "narrative_purpose",
        title: "Narrative Purpose",
        summary: assessment.narrativeUnderstanding,
        confidence: assessment.confidence,
      }),
      Object.freeze({
        key: "context_positioning",
        title: "Context Positioning",
        summary: assessment.contextClassification,
        confidence: assessment.confidence,
      }),
      Object.freeze({
        key: "knowledge_retrieval",
        title: "Reviewer Knowledge Retrieval",
        summary: knowledgeSummary.join(" | ") || "No reviewer knowledge assets were selected.",
        confidence: conceptContext.confidence,
      }),
      Object.freeze({
        key: "precedent_retrieval",
        title: "Precedent Retrieval",
        summary: precedentIds.length > 0 ? precedentIds.join(" | ") : "No precedents matched.",
        confidence: conceptContext.confidence,
      }),
      Object.freeze({
        key: "gcam_applicability",
        title: "GCAM Applicability",
        summary: primaryArticleIds.length > 0 ? articleEvaluationSummary : "No GCAM articles were preselected.",
        confidence: conceptContext.confidence,
      }),
      Object.freeze({
        key: "reasoning_generation",
        title: "Reasoning Generation",
        summary: [
    `Evidence: ${evidenceSummary.join(" | ") || "none"}`,
    `Reasoning trace: ${assessment.reasoningTrace.join(" | ") || "none"}`,
    `Recommendation: assist the reviewer reasoning only; the legal engine remains authoritative.`,
        ].join(" | "),
        confidence: assessment.confidence,
      }),
      Object.freeze({
        key: "preliminary_decision",
        title: "Preliminary Decision",
        summary: preliminaryStatus,
        confidence: preliminaryConfidence,
      }),
    ]),
    literalMeaning: evidenceCandidates[0]?.text ?? input.chunkContext.localChunk,
    impliedMeaning: assessment.literalVsImpliedMeaning,
    narrativeContext: assessment.narrativeUnderstanding,
    speakerAnalysis: assessment.speaker ?? "Unknown speaker.",
    victimAnalysis: assessment.victim ?? "Unknown victim.",
    socialImpact: uniqueStringsWithNormalization([
      assessment.contextClassification,
      assessment.narrativeIntent,
      ...assessment.exceptionSignals,
    ]).join(" | "),
    articleEvaluations: Object.freeze(primaryArticleIds.map((articleId) => Object.freeze({
      articleId,
      status: "PASS" as const,
      evidence: Object.freeze([] as string[]),
      reason: "Evaluate this article independently with quote-based evidence only. Mark PASS only when the evidence supports it; otherwise mark FAIL.",
      confidence: preliminaryConfidence,
    }))),
    applicableGcamArticles: Object.freeze(primaryArticleIds),
    rejectedGcamArticles: Object.freeze([]),
    supportingEvidence: Object.freeze(evidenceSummary),
    counterEvidence: Object.freeze(uniqueStringsWithNormalization([
      ...assessment.exceptionSignals,
      ...assessment.stageResults.filter((stage) => stage.status !== "complete").map((stage) => stage.summary),
    ])),
    confidenceExplanation: [
      `Assessment confidence ${assessment.confidence.toFixed(6)}.`,
      `Concept confidence ${conceptContext.confidence.toFixed(6)}.`,
      `Evidence strength ${assessment.evidenceStrength.toFixed(6)}.`,
    ].join(" "),
    preliminaryDecision: Object.freeze({
      status: preliminaryStatus,
      reason: assessment.reasoningTrace.join(" | "),
      confidence: preliminaryConfidence,
      applicableArticles: Object.freeze(primaryArticleIds),
      rejectedArticles: Object.freeze([]),
    }),
  });
}

function buildGptReviewerAssistant(
  input: V3PromptBuilderInput,
  conceptContext: ConceptContext,
  assessment: ReviewerAssessment,
  knowledgeRetrieval: ReviewerKnowledgeRetrievalReport,
  lessonSummaries: readonly Record<string, unknown>[],
  precedents: readonly ReasoningEnginePrecedent[],
  decisionRecords: readonly ReasoningEngineEntry[],
  reasoningPipeline: V3PromptJsonObject,
): V3PromptJsonObject {
  const retrievedKnowledge = knowledgeRetrieval.retrievedPacks.map((item) => ({
    id: item.id,
    title: item.title,
    module_id: item.moduleId,
    score: item.score,
    confidence: item.confidence,
    reasons: [...item.reasons],
    source: [...item.source],
    trigger_concept_ids: [...item.triggerConceptIds],
    article_ids: [...item.articleIds],
    selected: item.selected,
  }));
  const lessonPackage = lessonSummaries.map((lesson) => ({
    id: stringValue(lesson.id),
    title: stringValue(lesson.title),
    version: stringValue(lesson.version),
    summary: stringValue(lesson.summary),
    score: Number.isFinite(Number((lesson as Record<string, unknown>).score)) ? Number((lesson as Record<string, unknown>).score) : 0,
  }));
  const lessonIds = lessonPackage.map((lesson) => lesson.id);
  const decisionRecordPackage = decisionRecords.map((record) => ({
    id: stringValue(record.id),
    title: stringValue(record.title),
    kind: stringValue(record.kind),
    summary: stringValue(record.summary),
    score: Number.isFinite(Number(record.score)) ? Number(record.score) : 0,
  }));
  const precedentIds = precedents.map((precedent) => ({
    decision_id: precedent.decisionId,
    similarity: precedent.similarity,
    reason: precedent.reason,
    article_ids: [...precedent.articleIds],
    matched_concepts: [...precedent.matchedConcepts],
  }));
  const promptEvidenceCandidates = splitSentenceEvidenceCandidates(input.chunkContext.localChunk, 0, assessment.evidenceStrength);
  const pipelineEvidenceCandidates = Array.isArray((reasoningPipeline as Record<string, unknown>).evidence_candidates)
    ? (reasoningPipeline as Record<string, unknown>).evidence_candidates as readonly V3PromptJsonObject[]
    : [];

  return Object.freeze({
    role: "GPT Reviewer Assistant",
    authority: "The legal engine remains the final decision maker.",
    reviewer_module: Object.freeze({
      id: input.subjectModule.id,
      title_ar: input.subjectModule.titleAr,
      scope: input.subjectModule.scope ?? null,
      article_ids: [...(input.subjectModule.articleIds ?? [])],
    }),
    semantic_interpretation: Object.freeze({
      concept_ids: [...conceptContext.conceptIds],
      primary_concept_id: conceptContext.primaryConceptId,
      concept_count: conceptContext.conceptCount,
      confidence: conceptContext.confidence,
      narrative_intent: assessment.narrativeIntent,
      context_classification: assessment.contextClassification,
      literal_vs_implied_meaning: assessment.literalVsImpliedMeaning,
      exception_signals: [...assessment.exceptionSignals],
      evidence_strength: assessment.evidenceStrength,
    }),
    evidence: Object.freeze({
      literal_meaning: assessment.reasoningTrace[0] ?? reasoningPipeline.literalMeaning ?? null,
      supporting_evidence: [...assessment.reasoningTrace, ...promptEvidenceCandidates.map((candidate) => candidate.text)],
      evidence_candidates: pipelineEvidenceCandidates,
      confidence: assessment.evidenceStrength,
    }),
    knowledge: Object.freeze({
      retrieved_packs: Object.freeze(retrievedKnowledge),
      lessons: Object.freeze(lessonPackage),
      precedents: Object.freeze(precedentIds),
      decision_records: Object.freeze(decisionRecordPackage),
      decision_memory_retrieval: Object.freeze({
        query_terms: [...knowledgeRetrieval.decisionMemoryRetrieval.queryTerms],
        top_k: knowledgeRetrieval.decisionMemoryRetrieval.topK,
        memory_score: knowledgeRetrieval.decisionMemoryRetrieval.memoryScore,
        memory_confidence: knowledgeRetrieval.decisionMemoryRetrieval.memoryConfidence,
        memory_source: knowledgeRetrieval.decisionMemoryRetrieval.memorySource,
        cache_key: knowledgeRetrieval.decisionMemoryRetrieval.cacheKey,
        cache_hit: knowledgeRetrieval.decisionMemoryRetrieval.cacheHit,
        retrieved_memories: knowledgeRetrieval.decisionMemoryRetrieval.retrievedMemories.map((memory) => ({
          id: memory.id,
          source_id: memory.sourceId,
          title: memory.title,
          summary: memory.summary,
          status: memory.status,
          confidence: memory.confidence,
          confidence_score: memory.confidenceScore,
          similarity: memory.similarity,
          memory_influence: memory.memoryInfluence,
          why: memory.why,
          evidence: [...memory.evidence],
          article_ids: [...memory.articleIds],
          atom_ids: [...memory.atomIds],
          concepts: [...memory.concepts],
          reasoning: [...memory.reasoning],
          benchmark_tags: [...memory.benchmarkTags],
          related_lessons: [...memory.relatedLessons],
          related_patterns: [...memory.relatedPatterns],
          related_blueprint_concepts: [...memory.relatedBlueprintConcepts],
          false_positive_risk: memory.falsePositiveRisk,
          reviewer_decision: memory.reviewerDecision,
          finding_type: memory.findingType,
          reasons: [...memory.reasons],
          selected: memory.selected,
        })),
        rejected_memories: knowledgeRetrieval.decisionMemoryRetrieval.rejectedMemories.map((memory) => ({
          id: memory.id,
          source_id: memory.sourceId,
          title: memory.title,
          summary: memory.summary,
          status: memory.status,
          confidence: memory.confidence,
          confidence_score: memory.confidenceScore,
          similarity: memory.similarity,
          memory_influence: memory.memoryInfluence,
          why: memory.why,
          evidence: [...memory.evidence],
          article_ids: [...memory.articleIds],
          atom_ids: [...memory.atomIds],
          concepts: [...memory.concepts],
          reasoning: [...memory.reasoning],
          benchmark_tags: [...memory.benchmarkTags],
          related_lessons: [...memory.relatedLessons],
          related_patterns: [...memory.relatedPatterns],
          related_blueprint_concepts: [...memory.relatedBlueprintConcepts],
          false_positive_risk: memory.falsePositiveRisk,
          reviewer_decision: memory.reviewerDecision,
          finding_type: memory.findingType,
          reasons: [...memory.reasons],
          selected: memory.selected,
        })),
        selected_memory_ids: [...knowledgeRetrieval.decisionMemoryRetrieval.selectedMemoryIds],
      }),
      reviewer_academy: Object.freeze({
        lesson_ids: Object.freeze(lessonIds),
        lesson_count: lessonIds.length,
      }),
      grounding_policy: Object.freeze({
      evidence_first: "Begin from the exact quoted evidence and the current scene before any interpretation.",
      quote_grounded: "Every claim must stay grounded in the quoted evidence or the current scene. Do not add facts, actors, objects, injuries, or events that are not present there.",
      article_by_article: "Evaluate every GCAM article independently in an article-by-article manner. Do not choose the closest category. Return PASS or FAIL for each article.",
      exhaustive_review: "Your task is to find all policy violations. Do not stop after finding one exception. Analyze every threatening, abusive, violent, sexual, political, religious, criminal, or profane statement independently. Do not suppress a detection because a scene is quoted, condemnatory, educational, historical, satirical, or contextual; those exceptions are decided after generation.",
      policy_separation: "Detection belongs to GPT. Exception handling belongs to the deterministic post-processing policy engine.",
      contradiction_rule: "State the strongest counter-reading before the recommendation.",
    }),
    }),
    decision_template: Object.freeze({
      answer_with: Object.freeze(["reasoning", "article_evaluations", "supporting_evidence", "contradicting_evidence", "applicable_articles", "rejected_articles", "confidence", "recommendation"]),
      reasoning: "Explain why each supplied article passes or fails based only on quote-based evidence candidates. Keep it evidence-first and quote-grounded. Analyze every suspicious sentence independently and do not stop after the first exception. One evidence candidate may support multiple articles.",
      article_evaluations: "For each supplied article return articleId, PASS or FAIL, evidence, reason, and confidence. Do not choose the closest category. Evaluate all suspicious evidence candidates before merging findings. One candidate may produce multiple PASS articles.",
      supporting_evidence: "Cite the exact quote and current-scene context that support the reasoning.",
      contradicting_evidence: "State the strongest counter-reading and why it loses.",
      applicable_articles: "List only the article ids whose evaluations are PASS. Do not suppress a PASS because of quotation, condemnation, education, historical context, satire, or dialogue; those exceptions are handled after generation.",
      rejected_articles: "List the articles that were considered but rejected.",
      confidence: "Provide a calibrated confidence value between 0 and 1.",
      recommendation: "State the reviewer recommendation only as reasoning support for the legal engine. Do not use recommendation to apply exceptions.",
    }),
    reasoning_pipeline: reasoningPipeline,
  });
}

export function buildReviewerReasoningEnginePayload(
  input: V3PromptBuilderInput,
  conceptContext: ConceptContext,
  assessment: ReviewerAssessment,
  selectedReviewerKnowledge: readonly ReviewerKnowledgePack[],
  knowledgeRegistry: KnowledgeRegistry,
  knowledgeRetrieval: ReviewerKnowledgeRetrievalReport,
): ReviewerReasoningEnginePayload {
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: buildReviewerReasoningEnginePayload", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  let stepStartedAt = startedAt;
  const logStep = (step: string, details: Record<string, unknown> = {}): void => {
    const now = Date.now();
    logger.info("V3 instrumentation EXIT: buildReviewerReasoningEnginePayload", {
      step,
      elapsedMs: now - stepStartedAt,
      selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
      ...details,
    });
    stepStartedAt = now;
  };

  logger.info("V3 instrumentation ENTER: lesson engine search", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const lessonEngine = getLessonEngine();
  const queryTerms = knowledgeRetrieval.queryTerms;
  const lessonSearchResults = lessonEngine.search({
    concept: assessment.applicableConceptIds[0] ?? input.subjectModule.id,
    keyword: queryTerms.slice(0, 12).join(" "),
    subject: input.subjectModule.scope ?? input.subjectModule.titleAr,
    gcamArticle: input.subjectModule.articleIds?.[0] ?? null,
  }).slice(0, 5);
  logStep("lesson_engine_search", {
    candidateLessonCount: lessonSearchResults.length,
  });

  logger.info("V3 instrumentation ENTER: lesson summaries", {
    lessonCount: lessonSearchResults.length,
  });
  const lessonSummaries = lessonSearchResults.map((result) => ({
    id: result.lesson.id,
    title: result.lesson.title,
    version: `${result.lesson.version.major}.${result.lesson.version.minor}.${result.lesson.version.patch}`,
    summary: result.lesson.summary,
    learning_objectives: [...result.lesson.learningObjectives],
    reviewer_questions: result.lesson.reviewerQuestions.map((question) => ({
      id: question.id,
      purpose: question.purpose,
      expected_answer_format: question.expectedAnswerFormat,
      reasoning_guidance: question.reasoningGuidance,
      evidence_requirements: [...question.evidenceRequirements],
    })),
    examples: [...result.lesson.examples],
    counter_examples: [...result.lesson.counterExamples],
    exceptions: [...result.lesson.exceptions],
    evidence_rules: {
      minimum: [...result.lesson.evidenceRules.minimum],
      strong: [...result.lesson.evidenceRules.strong],
      weak: [...result.lesson.evidenceRules.weak],
      insufficient: [...result.lesson.evidenceRules.insufficient],
      confidence_guidance: [...result.lesson.evidenceRules.confidenceGuidance],
    },
    concept_relationships: result.lesson.conceptRelationships.map((relationship) => ({ ...relationship })),
    gcam_mappings: result.lesson.gcamMappings.map((mapping) => ({ ...mapping })),
    report_templates: result.lesson.reportTemplates.map((template) => ({ ...template })),
    benchmark_references: [...result.lesson.benchmarkReferences],
    related_lessons: [...result.lesson.relatedLessons],
    score: result.score,
    reasons: [...result.reasons],
  }));
  logStep("lesson_summaries", {
    summaryCount: lessonSummaries.length,
    summaryCharacters: JSON.stringify(lessonSummaries).length,
  });

  logger.info("V3 instrumentation ENTER: blueprint scoring", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const blueprints = scoreRegistryEntries(knowledgeRegistry.entries, queryTerms, ["blueprint_document", "blueprint_entry"], 6).map((entry) => ({
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    summary: entry.summary,
    evidence: [...entry.evidence],
    reasoning: [...entry.reasoning],
    decision: entry.decision,
    score: entry.score,
    reasons: [...entry.reasons],
    related_ids: [...entry.relatedIds],
  }));
  logStep("blueprint_scoring", {
    blueprintCount: blueprints.length,
  });

  logger.info("V3 instrumentation ENTER: pattern scoring", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const patterns = scoreRegistryEntries(knowledgeRegistry.entries, queryTerms, ["pattern_document", "pattern_entry"], 6).map((entry) => ({
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    summary: entry.summary,
    evidence: [...entry.evidence],
    reasoning: [...entry.reasoning],
    decision: entry.decision,
    score: entry.score,
    reasons: [...entry.reasons],
    related_ids: [...entry.relatedIds],
  }));
  logStep("pattern_scoring", {
    patternCount: patterns.length,
  });

  logger.info("V3 instrumentation ENTER: decision record scoring", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const decisionRecords = scoreRegistryEntries(knowledgeRegistry.entries, queryTerms, ["decision_record"], 6).map((entry) => ({
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    summary: entry.summary,
    evidence: [...entry.evidence],
    reasoning: [...entry.reasoning],
    decision: entry.decision,
    score: entry.score,
    reasons: [...entry.reasons],
    relatedIds: [...entry.relatedIds],
  }));
  logStep("decision_record_scoring", {
    decisionRecordCount: decisionRecords.length,
  });

  logger.info("V3 instrumentation ENTER: selected pack normalization", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const selectedPacks = selectedReviewerKnowledge.map((pack) => normalizePackView(pack));
  logStep("selected_pack_normalization", {
    normalizedPackCount: selectedPacks.length,
  });

  logger.info("V3 instrumentation ENTER: relationship summaries", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const relationships = buildRelationshipSummaries(selectedReviewerKnowledge, lessonSearchResults.map((result) => result.lesson));
  logStep("relationship_summaries", {
    relationshipCount: relationships.length,
  });

  logger.info("V3 instrumentation ENTER: case selection", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const cases = selectCases(queryTerms, input, assessment);
  logStep("case_selection", {
    selectedCaseCount: cases.length,
  });

  logger.info("V3 instrumentation ENTER: precedent selection", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const precedents = selectPrecedents(queryTerms, input, assessment);
  logStep("precedent_selection", {
    selectedPrecedentCount: precedents.length,
  });

  logger.info("V3 instrumentation ENTER: reasoning pipeline build", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const reasoningPipeline = buildPromptReviewerDecisionPipeline(
    input,
    conceptContext,
    assessment,
    selectedReviewerKnowledge,
    lessonSummaries,
    precedents,
    decisionRecords,
    knowledgeRetrieval,
  );
  logStep("reasoning_pipeline_build", {
    stageCount: Array.isArray((reasoningPipeline as Record<string, unknown>).stages)
      ? ((reasoningPipeline as Record<string, readonly unknown[]>).stages ?? []).length
      : 0,
  });

  logger.info("V3 instrumentation ENTER: GPT reviewer assistant build", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const gptReviewerAssistant = buildGptReviewerAssistant(
    input,
    conceptContext,
    assessment,
    knowledgeRetrieval,
    lessonSummaries,
    precedents,
    decisionRecords,
    reasoningPipeline,
  );
  const gptReviewerAssistantJson = JSON.stringify(gptReviewerAssistant);
  logStep("gpt_reviewer_assistant_build", {
    reviewerCount: gptReviewerAssistant.reviewerCount ?? null,
    promptLengthChars: gptReviewerAssistantJson.length,
    estimatedPromptTokens: Math.ceil(gptReviewerAssistantJson.length / 4),
  });

  logger.info("V3 instrumentation ENTER: payload construction", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
  });
  const payload = Object.freeze({
    semantic: Object.freeze({
      concept_ids: [...conceptContext.conceptIds],
      primary_concept_id: conceptContext.primaryConceptId,
      concept_count: conceptContext.conceptCount,
      confidence: conceptContext.confidence,
      narrative_intent: assessment.narrativeIntent,
      context_classification: assessment.contextClassification,
      literal_vs_implied_meaning: assessment.literalVsImpliedMeaning,
      exception_signals: [...assessment.exceptionSignals],
      evidence_strength: assessment.evidenceStrength,
      reasoning_trace: [...assessment.reasoningTrace],
    }),
    knowledge: Object.freeze({
      selected_packs: Object.freeze(selectedPacks),
      pack_ids: Object.freeze(selectedPacks.map((pack) => String(pack.id))),
      pack_count: selectedPacks.length,
        knowledge_retrieval: Object.freeze({
          query_terms: [...knowledgeRetrieval.queryTerms],
          top_k: knowledgeRetrieval.topK,
          knowledge_score: knowledgeRetrieval.knowledgeScore,
          knowledge_confidence: knowledgeRetrieval.knowledgeConfidence,
        knowledge_source: knowledgeRetrieval.knowledgeSource,
        cache_key: knowledgeRetrieval.cacheKey,
        cache_hit: false,
        retrieved_packs: Object.freeze(knowledgeRetrieval.retrievedPacks.map((item) => Object.freeze({
          id: item.id,
          title: item.title,
          module_id: item.moduleId,
          score: item.score,
          confidence: item.confidence,
          reasons: [...item.reasons],
          source: [...item.source],
          trigger_concept_ids: [...item.triggerConceptIds],
          article_ids: [...item.articleIds],
          selected: item.selected,
        }))),
          rejected_packs: Object.freeze(knowledgeRetrieval.rejectedPacks.map((item) => Object.freeze({
            id: item.id,
            title: item.title,
            module_id: item.moduleId,
            score: item.score,
          confidence: item.confidence,
          reasons: [...item.reasons],
          source: [...item.source],
          trigger_concept_ids: [...item.triggerConceptIds],
            article_ids: [...item.articleIds],
            selected: item.selected,
          }))),
        }),
        decision_memory_retrieval: Object.freeze({
          query_terms: [...knowledgeRetrieval.decisionMemoryRetrieval.queryTerms],
          top_k: knowledgeRetrieval.decisionMemoryRetrieval.topK,
          memory_score: knowledgeRetrieval.decisionMemoryRetrieval.memoryScore,
          memory_confidence: knowledgeRetrieval.decisionMemoryRetrieval.memoryConfidence,
          memory_source: knowledgeRetrieval.decisionMemoryRetrieval.memorySource,
          cache_key: knowledgeRetrieval.decisionMemoryRetrieval.cacheKey,
          cache_hit: false,
          retrieved_memories: knowledgeRetrieval.decisionMemoryRetrieval.retrievedMemories.map((memory) => Object.freeze({
            id: memory.id,
            source_id: memory.sourceId,
            title: memory.title,
            summary: memory.summary,
            status: memory.status,
            confidence: memory.confidence,
            confidence_score: memory.confidenceScore,
            similarity: memory.similarity,
            memory_influence: memory.memoryInfluence,
            why: memory.why,
            evidence: [...memory.evidence],
            article_ids: [...memory.articleIds],
            atom_ids: [...memory.atomIds],
            concepts: [...memory.concepts],
            reasoning: [...memory.reasoning],
            benchmark_tags: [...memory.benchmarkTags],
            related_lessons: [...memory.relatedLessons],
            related_patterns: [...memory.relatedPatterns],
            related_blueprint_concepts: [...memory.relatedBlueprintConcepts],
            false_positive_risk: memory.falsePositiveRisk,
            reviewer_decision: memory.reviewerDecision,
            finding_type: memory.findingType,
            reasons: [...memory.reasons],
            selected: memory.selected,
          })),
          rejected_memories: knowledgeRetrieval.decisionMemoryRetrieval.rejectedMemories.map((memory) => Object.freeze({
            id: memory.id,
            source_id: memory.sourceId,
            title: memory.title,
            summary: memory.summary,
            status: memory.status,
            confidence: memory.confidence,
            confidence_score: memory.confidenceScore,
            similarity: memory.similarity,
            memory_influence: memory.memoryInfluence,
            why: memory.why,
            evidence: [...memory.evidence],
            article_ids: [...memory.articleIds],
            atom_ids: [...memory.atomIds],
            concepts: [...memory.concepts],
            reasoning: [...memory.reasoning],
            benchmark_tags: [...memory.benchmarkTags],
            related_lessons: [...memory.relatedLessons],
            related_patterns: [...memory.relatedPatterns],
            related_blueprint_concepts: [...memory.relatedBlueprintConcepts],
            false_positive_risk: memory.falsePositiveRisk,
            reviewer_decision: memory.reviewerDecision,
            finding_type: memory.findingType,
            reasons: [...memory.reasons],
            selected: memory.selected,
          })),
          selected_memory_ids: [...knowledgeRetrieval.decisionMemoryRetrieval.selectedMemoryIds],
        }),
      }),
    lessons: Object.freeze(lessonSummaries),
    blueprints: Object.freeze(blueprints),
    patterns: Object.freeze(patterns),
    relationships,
    cases,
    precedents: Object.freeze({
      best_match: precedents[0] ?? null,
      top_matches: Object.freeze(precedents),
      total_matches: precedents.length,
    }),
    decision_records: Object.freeze(decisionRecords),
    gpt_reviewer_assistant: gptReviewerAssistant,
    reasoning_pipeline: reasoningPipeline,
    decision_guidance: Object.freeze({
      answer_with: Object.freeze(["reasoning", "supporting_evidence", "contradicting_evidence", "applicable_articles", "rejected_articles", "confidence", "recommendation"]),
      reasoning: "Explain the reviewer conclusion in plain language.",
      supporting_evidence: "Cite the exact supporting chunk, context, and precedent evidence.",
      contradicting_evidence: "State the strongest alternative interpretation and why it loses.",
      applicable_articles: "List the article ids that support the final decision.",
      rejected_articles: "List the article ids that were considered and rejected, if any.",
      confidence: "Provide a calibrated confidence value between 0 and 1.",
      recommendation: "State the reviewer recommendation only as reasoning support for the legal engine.",
    }),
  });
  logStep("payload_construction", {
    selectedPackCount: selectedPacks.length,
    blueprintCount: blueprints.length,
    patternCount: patterns.length,
    decisionRecordCount: decisionRecords.length,
    payloadSizeChars: JSON.stringify(payload).length,
  });
  logger.info("V3 instrumentation EXIT: buildReviewerReasoningEnginePayload", {
    selectedReviewerKnowledgeCount: selectedReviewerKnowledge.length,
    durationMs: Date.now() - startedAt,
  });
  return payload;
}
