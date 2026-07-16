import type { V3InspectionRecordInput, V3InspectionStageName, V3InspectionStageOrder } from "./inspectionTypes.js";
import type { KnowledgeRegistryReport } from "../reviewerKnowledge/knowledgeRegistry/index.js";
import type { KnowledgeRankingReport } from "../reviewerKnowledge/knowledgeRanking/index.js";
import type { DecisionMemoryRetrievalReport } from "../reviewerKnowledge/decisionMemory/decisionMemoryRetrieval.js";
import type { ReviewerDebatePackage } from "../reviewerDebate/index.js";
import type { ArbitrationDecisionPackage } from "../arbitration/index.js";
import type { ExplanationPackage } from "../explanation/index.js";

type V3InspectionStageBaseInput = Readonly<{
  jobId: string;
  chunkId: string | null;
  findingKey: string;
  createdAt?: string | null;
}>;

function createStageRecord(
  base: V3InspectionStageBaseInput,
  stageOrder: V3InspectionStageOrder,
  stageName: V3InspectionStageName,
  payloadJson: Record<string, unknown>,
): V3InspectionRecordInput {
  return Object.freeze({
    jobId: base.jobId,
    chunkId: base.chunkId,
    findingKey: base.findingKey,
    stageOrder,
    stageName,
    createdAt: base.createdAt ?? null,
    payloadJson,
  });
}

export function buildV3SemanticGenerationInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  provider: string;
  model: string;
  promptHash: string;
  semanticHash: string;
  semanticOutput: Record<string, unknown>;
  semanticConfidence: number;
  concepts: readonly string[];
  entities: readonly unknown[];
  sceneInformation: Record<string, unknown>;
  candidateCount: number;
  candidateIds?: readonly string[];
  candidates: readonly unknown[];
  stageTimings: readonly unknown[];
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 1, "semantic_generation", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    provider: input.provider,
    model: input.model,
    prompt_hash: input.promptHash,
    semantic_hash: input.semanticHash,
    semantic_output: input.semanticOutput,
    semantic_confidence: input.semanticConfidence,
    semantic_candidate_count: input.candidateCount,
    semantic_candidate_ids: [...(input.candidateIds ?? [])],
    semantic_candidates: input.candidates,
    concepts: [...input.concepts],
    entities: [...input.entities],
    scene_information: input.sceneInformation,
    stage_timings: input.stageTimings,
  });
}

export function buildV3KnowledgeMatchingInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  reviewerModule: Record<string, unknown>;
  reviewerDomainsLoaded: readonly string[];
  selectedReviewers?: readonly string[];
  selectedReviewerPackIds?: readonly string[];
  rejectedReviewers?: readonly string[];
  loadedAcademyCount?: number;
  skippedAcademyCount?: number;
  knowledgeReductionPercent?: number;
  routingConfidence?: number;
  routingReason?: string;
  knowledgeAssetsUsed: readonly string[];
  storyMemory?: string | null;
  scriptMemory?: string | null;
  sceneMemory?: string | null;
  lessonsUsed: readonly string[];
  patternLibrariesUsed: readonly string[];
  knowledgePacksUsed: readonly string[];
  reviewQuestions: readonly string[];
  matchedConcepts: readonly string[];
  matchedEvidence: readonly string[];
  knowledgeRetrieval?: Record<string, unknown> | null;
  decisionMemoryRetrieval: DecisionMemoryRetrievalReport;
  evidenceAssessment: Record<string, unknown>;
  context: Record<string, unknown>;
  conceptContext: Record<string, unknown>;
  legalConcepts: readonly unknown[];
  flags: Record<string, unknown>;
  reasoningTrace: Record<string, unknown> | null;
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 2, "knowledge_matching", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    reviewer_module: input.reviewerModule,
    reviewer_domains_loaded: [...input.reviewerDomainsLoaded],
    selected_reviewers: [...(input.selectedReviewers ?? [])],
    selected_reviewer_pack_ids: [...(input.selectedReviewerPackIds ?? [])],
    rejected_reviewers: [...(input.rejectedReviewers ?? [])],
    loaded_academy_count: input.loadedAcademyCount ?? null,
    skipped_academy_count: input.skippedAcademyCount ?? null,
    knowledge_reduction_percent: input.knowledgeReductionPercent ?? null,
    routing_confidence: input.routingConfidence ?? null,
    routing_reason: input.routingReason ?? null,
    knowledge_assets_used: [...input.knowledgeAssetsUsed],
    story_memory: input.storyMemory ?? null,
    script_memory: input.scriptMemory ?? null,
    scene_memory: input.sceneMemory ?? null,
    lessons_used: [...input.lessonsUsed],
    pattern_libraries_used: [...input.patternLibrariesUsed],
    knowledge_packs_used: [...input.knowledgePacksUsed],
    review_questions: [...input.reviewQuestions],
    matched_concepts: [...input.matchedConcepts],
    matched_evidence: [...input.matchedEvidence],
    knowledge_retrieval: input.knowledgeRetrieval ?? null,
    decision_memory_retrieval: {
      query_terms: [...input.decisionMemoryRetrieval.queryTerms],
      retrieved_memories: input.decisionMemoryRetrieval.retrievedMemories.map((memory) => ({
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
      rejected_memories: input.decisionMemoryRetrieval.rejectedMemories.map((memory) => ({
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
      selected_memory_ids: [...input.decisionMemoryRetrieval.selectedMemoryIds],
      memory_score: input.decisionMemoryRetrieval.memoryScore,
      memory_confidence: input.decisionMemoryRetrieval.memoryConfidence,
      memory_source: input.decisionMemoryRetrieval.memorySource,
      top_k: input.decisionMemoryRetrieval.topK,
      cache_key: input.decisionMemoryRetrieval.cacheKey,
      cache_hit: input.decisionMemoryRetrieval.cacheHit,
    },
    evidence_assessment: input.evidenceAssessment,
    context: input.context,
    concept_context: input.conceptContext,
    legal_concepts: [...input.legalConcepts],
    flags: input.flags,
    reasoning_trace: input.reasoningTrace,
  });
}

export function buildV3LegalReviewInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  moduleId: string;
  moduleTitle: string;
  status: string;
  reason: string;
  confidence: number;
  articleIds: readonly number[];
  finding: Record<string, unknown> | null;
  exceptions: readonly unknown[];
  trace: readonly unknown[];
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  needsReviewCount: number;
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 3, "legal_review", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    module_id: input.moduleId,
    module_title: input.moduleTitle,
    status: input.status,
    reason: input.reason,
    confidence: input.confidence,
    article_ids: [...input.articleIds],
    finding: input.finding,
    exceptions: [...input.exceptions],
    trace: [...input.trace],
    candidate_count: input.candidateCount,
    accepted_count: input.acceptedCount,
    rejected_count: input.rejectedCount,
    needs_review_count: input.needsReviewCount,
  });
}

export function buildV3FindingMapperInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  inputDecision: Record<string, unknown>;
  outputFindings: readonly unknown[];
  articleMapping: Record<string, unknown>;
  confidence: number;
  title: string;
  description: string;
  evidenceSnippet: string | null;
  articleIds: readonly number[];
  atomIds: readonly string[];
  legalModule: string;
  legalModuleTitle: string;
  mappedCount: number;
  droppedCount: number;
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 4, "finding_mapper", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    input_decision: input.inputDecision,
    output_findings: [...input.outputFindings],
    article_mapping: input.articleMapping,
    confidence: input.confidence,
    title: input.title,
    description: input.description,
    evidence_snippet: input.evidenceSnippet,
    article_ids: [...input.articleIds],
    atom_ids: [...input.atomIds],
    legal_module: input.legalModule,
    legal_module_title: input.legalModuleTitle,
    mapped_count: input.mappedCount,
    dropped_count: input.droppedCount,
  });
}

export function buildV3PersistenceInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  attempted: number;
  inserted: number;
  skipped: number;
  error: { message: string; code?: string | null; details?: string | null; hint?: string | null } | null;
  rows: readonly Record<string, unknown>[];
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 5, "persistence", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    findings_attempted: input.attempted,
    rows_inserted: input.inserted,
    rows_skipped: input.skipped,
    error: input.error,
    rows: [...input.rows],
  });
}

export function buildV3AggregationInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  canonicalFindings: readonly unknown[];
  findingsCount: number;
  reportHintsCount: number;
  severityCounts: Record<string, number>;
  reportOverview: Record<string, unknown> | null;
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 6, "aggregation", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    persisted_findings: input.findingsCount,
    clustered_findings: input.canonicalFindings.length,
    report_findings: input.findingsCount,
    canonical_findings: [...input.canonicalFindings],
    report_hints_count: input.reportHintsCount,
    severity_counts: input.severityCounts,
    report_overview: input.reportOverview,
  });
}

export function buildV3FinalReportInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  finalFindingCount: number;
  observationCount: number;
  reportStatus: string;
  jobStatus: string;
  reportSummary: Record<string, unknown> | null;
  reportHtml: string;
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 7, "final_report", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    final_finding_count: input.finalFindingCount,
    observation_count: input.observationCount,
    report_status: input.reportStatus,
    job_status: input.jobStatus,
    report_summary: input.reportSummary,
    report_html: input.reportHtml,
  });
}

export function buildV3KnowledgeRegistryInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  registry: KnowledgeRegistryReport;
  stageTimings?: readonly unknown[];
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 8, "knowledge_registry", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    registry_root_dir: input.registry.rootDir,
    registry_hash: input.registry.hash,
    registry_total_count: input.registry.statistics.totalCount,
    registry_kind_counts: input.registry.statistics.kindCounts,
    registry_source_counts: input.registry.statistics.sourceCounts,
    registry_domain_counts: input.registry.statistics.domainCounts,
    traceability_coverage: input.registry.statistics.traceabilityCoverage,
    explainability_coverage: input.registry.statistics.explainabilityCoverage,
    duplicate_id_count: input.registry.statistics.duplicateIdCount,
    missing_metadata_count: input.registry.statistics.missingMetadataCount,
    missing_reference_count: input.registry.statistics.missingReferenceCount,
    circular_reference_count: input.registry.statistics.circularReferenceCount,
    orphan_count: input.registry.statistics.orphanCount,
    coverage_percent: input.registry.statistics.coveragePercent,
    production_readiness: input.registry.statistics.productionReadiness,
    validation_valid: input.registry.validation.valid,
    validation_issues: [...input.registry.validation.issues],
    sample_registry_keys: input.registry.list().slice(0, 50).map((entry) => entry.registryKey),
    stage_timings: [...(input.stageTimings ?? [])],
  });
}

export function buildV3KnowledgeRankingInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  ranking: KnowledgeRankingReport;
  stageTimings?: readonly unknown[];
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 9, "knowledge_ranking", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    query_summary: input.ranking.querySummary,
    domain_scores: [...input.ranking.domainScores],
    concept_scores: [...input.ranking.conceptScores],
    lesson_scores: [...input.ranking.lessonScores],
    blueprint_scores: [...input.ranking.blueprintScores],
    pattern_scores: [...input.ranking.patternScores],
    relationship_scores: [...input.ranking.relationshipScores],
    article_scores: [...input.ranking.articleScores],
    selected_registry_keys: [...input.ranking.selectedRegistryKeys],
    knowledge_confidence: input.ranking.knowledgeConfidence,
    retrieval_coverage: input.ranking.retrievalCoverage,
    total_registry_entries: input.ranking.totalRegistryEntries,
    stage_timings: [...(input.stageTimings ?? [])],
  });
}

export function buildV3ReviewerDebateInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  debate: ReviewerDebatePackage;
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 10, "reviewer_debate", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    consultation_graph: input.debate.consultationGraph ?? null,
    consultation_supporting_reviewers: [...(input.debate.consultationGraph?.supportingReviewers ?? [])],
    consultation_opposing_reviewers: [...(input.debate.consultationGraph?.opposingReviewers ?? [])],
    consultation_consensus_score: input.debate.consultationGraph?.consensusScore ?? null,
    consultation_disagreement_score: input.debate.consultationGraph?.disagreementScore ?? null,
    consultation_consulted_reviewer_count: input.debate.consultationGraph?.consultedReviewerCount ?? 0,
    consultation_triggered_reviewer_count: input.debate.consultationGraph?.triggeredReviewerCount ?? 0,
    gpt_assistant: input.debate.gptAssistant,
    gpt_prompt_hash: input.debate.gptAssistant?.promptHash ?? null,
    gpt_response_hash: input.debate.gptAssistant?.responseHash ?? null,
    gpt_latency_ms: input.debate.gptAssistant?.latencyMs ?? null,
    gpt_reasoning_confidence: input.debate.gptAssistant?.confidence ?? null,
    gpt_reasoning: input.debate.gptAssistant?.reasoning ?? null,
    gpt_alternative_interpretations: [...(input.debate.gptAssistant?.alternativeInterpretations ?? [])],
    gpt_supporting_evidence: [...(input.debate.gptAssistant?.supportingEvidence ?? [])],
    gpt_contradicting_evidence: [...(input.debate.gptAssistant?.contradictingEvidence ?? [])],
    gpt_applicable_articles: [...(input.debate.gptAssistant?.applicableArticles ?? [])],
    gpt_rejected_articles: [...(input.debate.gptAssistant?.rejectedArticles ?? [])],
    gpt_risk_analysis: input.debate.gptAssistant?.riskAnalysis ?? null,
    gpt_narrative_analysis: input.debate.gptAssistant?.narrativeAnalysis ?? null,
    gpt_human_like_explanation: input.debate.gptAssistant?.humanLikeExplanation ?? null,
    self_critique: input.debate.opinions.map((opinion) => ({
      reviewer_id: opinion.reviewerId,
      reviewer_name: opinion.reviewerName,
      why_could_i_be_wrong: opinion.selfCritique?.whyCouldIBeWrong ?? null,
      critique: opinion.selfCritique?.critique ?? opinion.selfCritique?.whyCouldIBeWrong ?? null,
      contradicting_evidence: [...(opinion.selfCritique?.contradictingEvidence ?? [])],
      assumptions: [...(opinion.selfCritique?.assumptions ?? [])],
      possible_disagreement: opinion.selfCritique?.possibleDisagreement ?? null,
      missed_context: opinion.selfCritique?.missedContext ?? null,
      confidence_before: opinion.selfCritique?.confidenceBefore ?? null,
      confidence_after: opinion.selfCritique?.confidenceAfter ?? null,
      confidence_delta: opinion.selfCritique?.confidenceDelta ?? null,
      reason_changes: [...(opinion.selfCritique?.reasonChanges ?? [])],
      revision: opinion.selfCritique?.revision ?? null,
      final_confidence: opinion.selfCritique?.finalConfidence ?? opinion.selfCritique?.confidenceAfter ?? null,
    })),
    reviewer_count: input.debate.reviewerCount,
    execution_order: [...input.debate.executionOrder],
    reviewer_durations: [...input.debate.reviewerDurations],
    opinions: [...input.debate.opinions],
    opinion_summaries: [...input.debate.opinionSummaries],
    agreement_matrix: [...input.debate.agreementMatrix],
    disagreement_matrix: [...input.debate.disagreementMatrix],
    highest_confidence_reviewer: input.debate.highestConfidenceReviewer,
    lowest_confidence_reviewer: input.debate.lowestConfidenceReviewer,
    conflicting_articles: [...input.debate.conflictingArticles],
    supporting_evidence_overlap: [...input.debate.supportingEvidenceOverlap],
    knowledge_overlap: [...input.debate.knowledgeOverlap],
    confidence_distribution: input.debate.confidenceDistribution,
    consensus_score: input.debate.consensusScore,
    metrics: input.debate.metrics,
    shared_package: input.debate.sharedPackage,
    primary_decision: input.debate.primaryDecision,
  });
}

export function buildV3ArbitrationInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  arbitration: ArbitrationDecisionPackage;
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 11, "arbitration", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    reviewer_count: input.arbitration.debate.reviewerCount,
    execution_order: [...input.arbitration.debate.executionOrder],
    reviewer_durations: [...input.arbitration.debate.reviewerDurations],
    opinion_summaries: [...input.arbitration.debate.opinionSummaries],
    agreement_matrix: [...input.arbitration.agreementMatrix],
    disagreement_matrix: [...input.arbitration.disagreementMatrix],
    confidence_distribution: input.arbitration.confidenceDistribution,
    consensus_score: input.arbitration.consensusScore,
    metrics: input.arbitration.metrics,
    winning_reviewer_name: input.arbitration.winningReviewer.reviewerName,
    winning_reviewer: input.arbitration.winningReviewer,
    winning_opinion_index: input.arbitration.winningOpinionIndex,
    winning_reason: input.arbitration.winningReason,
    winning_evidence: [...input.arbitration.winningEvidence],
    winning_knowledge: input.arbitration.winningKnowledge,
    winning_lessons: [...input.arbitration.winningLessons],
    winning_blueprints: [...input.arbitration.winningBlueprints],
    winning_patterns: [...input.arbitration.winningPatterns],
    winning_precedents: [...input.arbitration.winningPrecedents],
    winning_cases: [...input.arbitration.winningCases],
    winning_relationships: [...input.arbitration.winningRelationships],
    winning_article: input.arbitration.winningArticle,
    final_article: input.arbitration.finalArticle,
    rejected_reviewers: [...input.arbitration.rejectedReviewers],
    rejected_reasons: [...input.arbitration.rejectedReasons],
    confidence: input.arbitration.confidence,
    confidence_adjustment: input.arbitration.confidenceAdjustment,
    conflicts: [...input.arbitration.conflicts],
    needs_human_review: input.arbitration.needsHumanReview,
    escalation_recommendation: input.arbitration.escalationRecommendation,
    decision_explanation: input.arbitration.decisionExplanation,
    decision_duration_ms: input.arbitration.decisionDurationMs,
    final_decision_status: input.arbitration.finalDecisionStatus,
    final_decision_package: input.arbitration,
  });
}

export function buildV3ExplanationInspectionRecord(input: Readonly<{
  base: V3InspectionStageBaseInput;
  analysisEngine: string;
  pipelineVersion: string;
  explanation: ExplanationPackage;
}>): V3InspectionRecordInput {
  return createStageRecord(input.base, 12, "explanation", {
    analysis_engine: input.analysisEngine,
    pipeline_version: input.pipelineVersion,
    finding_count: input.explanation.findingCount,
    winning_reviewer: input.explanation.winningReviewer,
    rejected_reviewers: [...input.explanation.rejectedReviewers],
    findings: [...input.explanation.findings],
    summary: input.explanation.summary,
    metrics: input.explanation.metrics,
    inspection_references: [...input.explanation.inspectionReferences],
    explanation_completeness: input.explanation.summary.explanationCompleteness,
    reference_completeness: input.explanation.summary.referenceCompleteness,
    knowledge_completeness: input.explanation.summary.knowledgeCompleteness,
    evidence_completeness: input.explanation.summary.evidenceCompleteness,
    reasoning_completeness: input.explanation.summary.reasoningCompleteness,
    diagnostics: input.explanation.diagnostics,
  });
}
