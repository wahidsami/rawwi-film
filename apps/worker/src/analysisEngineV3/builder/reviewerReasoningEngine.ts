import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import { createCaseLibraryRegistry } from "../reviewerKnowledge/caseLibrary/caseLibrary.js";
import { createDecisionMemoryRegistry } from "../reviewerKnowledge/decisionMemory/decisionMemory.js";
import { createKnowledgeRegistry } from "../reviewerKnowledge/knowledgeRegistry/index.js";
import type { KnowledgeRegistryEntry } from "../reviewerKnowledge/knowledgeRegistry/knowledgeRegistryTypes.js";
import { createDefaultLessonEngine } from "../reviewerKnowledge/lessons/lessonEngine.js";
import type { ReviewerKnowledgeLesson } from "../reviewerKnowledge/lessons/lessonTypes.js";
import { createPrecedentEngineRegistry } from "../reviewerKnowledge/precedentEngine/precedentEngine.js";
import type { ReviewerKnowledgePack } from "../reviewerKnowledge/reviewerKnowledgeTypes.js";
import type { V3PromptBuilderInput, V3PromptJsonObject, V3PromptSubjectModule } from "./builderTypes.js";
import { buildKnowledgeRankingCorpus, scoreTerms, uniqueStrings } from "../reviewerKnowledge/knowledgeRanking/knowledgeRankingUtils.js";

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

export function buildReviewerReasoningEnginePayload(
  input: V3PromptBuilderInput,
  conceptContext: ConceptContext,
  assessment: ReviewerAssessment,
  packs: readonly ReviewerKnowledgePack[],
): ReviewerReasoningEnginePayload {
  const knowledgeRegistry = getKnowledgeRegistry();
  const lessonEngine = getLessonEngine();
  const queryTerms = collectQueryTerms(input, conceptContext, assessment, packs);
  const lessonSearchResults = lessonEngine.search({
    concept: assessment.applicableConceptIds[0] ?? input.subjectModule.id,
    keyword: queryTerms.slice(0, 12).join(" "),
    subject: input.subjectModule.scope ?? input.subjectModule.titleAr,
    gcamArticle: input.subjectModule.articleIds?.[0] ?? null,
  }).slice(0, 5);
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
    related_ids: [...entry.relatedIds],
  }));

  const relationships = buildRelationshipSummaries(packs, lessonSearchResults.map((result) => result.lesson));
  const cases = selectCases(queryTerms, input, assessment);
  const precedents = selectPrecedents(queryTerms, input, assessment);
  const selectedPacks = packs.map((pack) => normalizePackView(pack));

  return Object.freeze({
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
    decision_guidance: Object.freeze({
      answer_with: Object.freeze(["why", "evidence", "counterargument", "applicable_articles", "rejected_articles", "confidence"]),
      why: "Explain the reviewer conclusion in plain language.",
      evidence: "Cite the exact supporting chunk, context, and precedent evidence.",
      counterargument: "State the strongest alternative interpretation and why it loses.",
      applicable_articles: "List the article ids that support the final decision.",
      rejected_articles: "List the article ids that were considered and rejected, if any.",
      confidence: "Provide a calibrated confidence value between 0 and 1.",
    }),
  });
}
