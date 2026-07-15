import type { V3InspectionRecordInput, V3InspectionStageName, V3InspectionStageOrder } from "./inspectionTypes.js";
import type { KnowledgeRegistryReport } from "../reviewerKnowledge/knowledgeRegistry/index.js";

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
