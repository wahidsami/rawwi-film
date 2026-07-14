import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadReviewerKnowledgeLessonsFromDirectory } from "../reviewerKnowledge/lessons/lessonLoader.js";
import { loadReviewerAcademyIndex } from "../reviewerKnowledge/academy/reviewerAcademyLoader.js";
import { loadPatternLibraryDocuments } from "../reviewerKnowledge/patternLibraries/patternLibraryLoader.js";
import { createDecisionRecordRegistry } from "../reviewerKnowledge/decisionRecords/decisionRecordRegistry.js";
import type { DecisionRecord } from "../reviewerKnowledge/decisionRecords/decisionRecordTypes.js";
import type { PatternLibraryDocument } from "../reviewerKnowledge/patternLibraries/patternLibraryTypes.js";
import type { ReviewerKnowledgeLesson } from "../reviewerKnowledge/lessons/lessonTypes.js";
import type { ReviewerKnowledgePack } from "../reviewerKnowledge/reviewerKnowledgeTypes.js";
import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3DebugCollection, V3DebugCollectorInput, V3DebugReport, V3DebugBlueprintSummary, V3DebugDecisionRecordSummary, V3DebugIntelligenceSection, V3DebugLegalSection, V3DebugOutputSection, V3DebugReviewerSection, V3DebugAcademySection, V3DebugGeneralSection, V3DebugReasoningTraceSection, V3DebugGcamMappingSection, V3DebugReviewerJudgmentSection, V3DebugReasoningChainSection, V3DebugKnowledgeUsageSection, V3DebugFindingGenerationSection, V3DebugPerformanceSection } from "./debugTypes.js";
import { buildV3DebugSummary } from "./debugSummary.js";
import { buildV3DebugTimeline } from "./debugTimeline.js";
import { buildV3ReasoningTrace } from "./reasoningTrace.js";
import type { V3ReasoningTrace } from "./reasoningTraceTypes.js";

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

function defaultReviewerKnowledgeRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "reviewerKnowledge");
}

function defaultAcademyRoot(): string {
  return join(defaultReviewerKnowledgeRoot(), "academy");
}

function defaultLessonsRoot(): string {
  return join(defaultReviewerKnowledgeRoot(), "lessons");
}

function defaultPatternLibrariesRoot(): string {
  return join(defaultReviewerKnowledgeRoot(), "patternLibraries");
}

function defaultDecisionRecordsRoot(): string {
  return join(defaultReviewerKnowledgeRoot(), "decisionRecords");
}

function defaultBlueprintsRoot(): string {
  return join(defaultReviewerKnowledgeRoot(), "blueprints");
}

function summarizeLesson(lesson: ReviewerKnowledgeLesson): V3DebugCollection["academy"]["loadedLessons"][number] {
  return Object.freeze({
    id: lesson.id,
    title: lesson.title,
    version: `${lesson.version.major}.${lesson.version.minor}.${lesson.version.patch}`,
    summary: lesson.summary,
  });
}

function summarizePack(pack: ReviewerKnowledgePack): V3DebugCollection["academy"]["loadedReviewerPacks"][number] {
  return Object.freeze({
    id: pack.id,
    moduleId: pack.module_id,
    title: pack.title,
    triggerConceptIds: Object.freeze([...pack.trigger_concept_ids].sort((left, right) => left.localeCompare(right))),
    protectedInterests: Object.freeze([...pack.protected_interests].sort((left, right) => left.localeCompare(right))),
    protectedConcepts: Object.freeze([...pack.protected_concepts].sort((left, right) => left.localeCompare(right))),
  });
}

function summarizePatternLibrary(document: PatternLibraryDocument): V3DebugCollection["academy"]["loadedPatternLibraries"][number] {
  return Object.freeze({
    id: document.metadata.id,
    title: document.metadata.title,
    version: `${document.version.major}.${document.version.minor}.${document.version.patch}`,
    entryCount: document.entries.length,
  });
}

function summarizeDecisionRecord(record: DecisionRecord): V3DebugDecisionRecordSummary {
  return Object.freeze({
    id: record.id,
    title: record.title,
    version: record.version,
    findingType: record.findingType,
    confidence: record.confidence,
  });
}

function discoverBlueprintFolders(rootDir: string): readonly V3DebugBlueprintSummary[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);
  const summaries: V3DebugBlueprintSummary[] = [];
  const folders = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const folder of folders) {
    const folderPath = join(rootDir, folder);
    const files = readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
    summaries.push(Object.freeze({
      folder,
      files: Object.freeze([...files]),
      hash: hash({ folder, files }),
    }));
  }

  return Object.freeze(summaries);
}

function normalizedStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return Object.freeze(result);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? Object.freeze(normalizedStrings(value.map((entry) => String(entry)))) : Object.freeze([]);
}

function extractArray(value: unknown, key: string): readonly string[] {
  const record = asRecord(value);
  if (!record) return Object.freeze([]);
  return asStringArray(record[key]);
}

function getTruthLayerMapping(input: V3DebugCollectorInput, fallbackFinding: V3DebugOutputSection["findings"][number] | null): V3DebugGcamMappingSection {
  const mapping = asRecord(input.truthLayerMeta?.gcam_mapping);
  const fallbackArticle = fallbackFinding?.article_id ?? null;
  const fallbackAtom = fallbackFinding?.atom_id ?? null;
  const mappingSource =
    typeof mapping?.matchedRuleId === "string" && mapping.matchedRuleId.trim().length > 0
      ? String(mapping.matchedRuleId)
      : typeof mapping?.matchedArticleMappingId === "string" && mapping.matchedArticleMappingId.trim().length > 0
        ? String(mapping.matchedArticleMappingId)
        : typeof mapping?.matchedAtomMappingId === "string" && mapping.matchedAtomMappingId.trim().length > 0
          ? String(mapping.matchedAtomMappingId)
          : typeof mapping?.source === "string" && mapping.source.trim().length > 0
            ? String(mapping.source)
            : typeof mapping?.status === "string"
              ? String(mapping.status)
              : "derived";
  return Object.freeze({
    article: typeof mapping?.articleId === "number" ? mapping.articleId : fallbackArticle,
    atom: typeof mapping?.atomId === "string" ? mapping.atomId : fallbackAtom,
    mappingConfidence: typeof mapping?.confidence === "number" ? Number(mapping.confidence.toFixed(6)) : fallbackFinding?.confidence ?? null,
    mappingSource,
    knowledgeDebt: Object.freeze([
      ...extractArray(mapping, "mappingDebt"),
      ...(mapping ? [] : ["truthLayerMeta_missing"]),
    ]),
    mappingStatus: typeof mapping?.status === "string" ? String(mapping.status) : (fallbackFinding ? "DERIVED" : "UNMAPPED"),
  });
}

function buildReviewerJudgmentSection(response: AnalysisResponse, input: V3DebugCollectorInput): V3DebugReviewerJudgmentSection {
  const finding = input.findings?.[0] ?? null;
  const evidenceUsed = finding ? [finding.evidence_snippet, response.legalDecision.evidence.candidates[response.legalDecision.evidence.primaryCandidateIndex]?.text ?? ""].filter(Boolean) : response.legalDecision.evidence.candidates.map((candidate) => candidate.text);
  const alternativeDecisions = input.acceptedHypotheses ?? (response.legalDecision.exceptions.length > 0 ? response.legalDecision.exceptions.map((exception) => exception.reason) : []);
  const rejectedInterpretations = input.discardedHypotheses ?? response.legalDecision.exceptions.filter((exception) => exception.disposition === "block" || exception.disposition === "review").map((exception) => exception.reason);
  const decisionRecordsUsed = Object.freeze([
    ...asStringArray(input.knowledgeUsage?.decisionRecordsUsed),
    ...response.legalDecision.trace.filter((entry) => entry.toLowerCase().includes("decision record")),
  ]);

  return Object.freeze({
    primaryDecision: response.legalDecision.status,
    alternativeDecisions: Object.freeze(normalizedStrings(alternativeDecisions)),
    rejectedInterpretations: Object.freeze(normalizedStrings(rejectedInterpretations)),
    confidence: Number(response.legalDecision.confidence.toFixed(6)),
    evidenceUsed: Object.freeze(normalizedStrings(evidenceUsed)),
    decisionRecordsUsed,
  });
}

function buildReasoningChainSection(response: AnalysisResponse, trace: V3ReasoningTrace | null): V3DebugReasoningChainSection {
  const stages = trace?.stages ?? [];
  const stageByName = new Map(stages.map((stage) => [stage.stage, stage.items] as const));
  return Object.freeze({
    narrative: Object.freeze([
      response.narrative.sceneType,
      response.narrative.narrativeVoice,
      response.narrative.storyPosition,
    ].filter((value) => normalizeText(String(value)).length > 0).map((value) => String(value))),
    intent: Object.freeze([
      response.intelligence.narrativeIntent,
      response.semantic.narrativeIntent,
      response.semantic.semanticMeaning,
    ].filter((value) => normalizeText(String(value)).length > 0).map((value) => String(value))),
    relationships: Object.freeze(stageByName.get("detected_targets") ?? []),
    context: Object.freeze([
      response.context.narrativeContext,
      response.context.localContext,
      response.context.sceneMemory ?? "",
      response.context.storyMemory ?? "",
    ].filter((value) => normalizeText(String(value)).length > 0).map((value) => String(value))),
    evidence: Object.freeze(stageByName.get("supporting_evidence") ?? []),
    methodology: Object.freeze(stageByName.get("reviewer_questions") ?? []),
    judgment: Object.freeze([
      response.legalDecision.reason,
      response.legalDecision.status,
      response.legalDecision.finding ? "finding" : "observation",
    ]),
    gcamMapping: Object.freeze(stageByName.get("candidate_gcam_mappings") ?? []),
  });
}

function buildKnowledgeUsageSection(
  input: V3DebugCollectorInput,
  trace: V3ReasoningTrace | null,
): V3DebugKnowledgeUsageSection {
  const stages = trace?.stages ?? [];
  const stageByName = new Map(stages.map((stage) => [stage.stage, stage.items] as const));
  return Object.freeze({
    lessonsUsed: Object.freeze([
      ...asStringArray(input.knowledgeUsage?.lessonsUsed),
      ...(stageByName.get("applicable_lessons") ?? []),
    ]),
    patternsUsed: Object.freeze([
      ...asStringArray(input.knowledgeUsage?.patternsUsed),
      ...(stageByName.get("applicable_pattern_libraries") ?? []),
    ]),
    decisionRecordsUsed: Object.freeze([
      ...asStringArray(input.knowledgeUsage?.decisionRecordsUsed),
    ]),
    benchmarksReferenced: Object.freeze([
      ...asStringArray(input.knowledgeUsage?.benchmarksReferenced),
    ]),
    knowledgeAcquisitionRecords: Object.freeze([
      ...asStringArray(input.knowledgeUsage?.knowledgeAcquisitionRecords),
    ]),
  });
}

function buildFindingGenerationSection(
  response: AnalysisResponse,
  input: V3DebugCollectorInput,
  mapping: V3DebugGcamMappingSection,
): V3DebugFindingGenerationSection {
  const finding = input.findings?.[0] ?? null;
  return Object.freeze({
    findingTitle: finding?.title_ar ?? response.legalDecision.moduleTitle,
    findingCategory: finding?.category ?? response.legalDecision.moduleId,
    mappedArticle: mapping.article,
    mappedAtom: mapping.atom,
    evidence: Object.freeze(
      normalizedStrings(
        finding
          ? [finding.evidence_snippet, response.legalDecision.evidence.candidates[response.legalDecision.evidence.primaryCandidateIndex]?.text ?? ""]
          : response.legalDecision.evidence.candidates.map((candidate) => candidate.text),
      ),
    ),
    confidence: Number((finding?.confidence ?? response.legalDecision.confidence).toFixed(6)),
    decision: finding ? "finding" : "observation",
  });
}

function buildPerformanceSection(
  response: AnalysisResponse,
  input: V3DebugCollectorInput,
): V3DebugPerformanceSection {
  return Object.freeze({
    stageTimings: response.stageTimings,
    knowledgeLoadingTimeMs: input.performance?.knowledgeLoadingTimeMs ?? null,
    reasoningTimeMs: input.performance?.reasoningTimeMs ?? null,
    mappingTimeMs: input.performance?.mappingTimeMs ?? null,
    findingGenerationTimeMs: input.performance?.findingGenerationTimeMs ?? null,
  });
}

function deriveDetectedConcepts(response: AnalysisResponse): readonly string[] {
  return normalizedStrings(response.intelligence.conceptContext.conceptIds);
}

function deriveDetectedEntities(response: AnalysisResponse): readonly string[] {
  return normalizedStrings(response.intelligence.entities.map((entity) => entity.label));
}

function deriveDetectedTargets(response: AnalysisResponse): readonly string[] {
  return normalizedStrings([
    response.intelligence.target ?? "",
    response.intelligence.victim ?? "",
    ...response.intelligence.entities.filter((entity) => entity.role === "target" || entity.role === "victim").map((entity) => entity.label),
  ]);
}

function deriveDetectedIntents(response: AnalysisResponse): readonly string[] {
  return normalizedStrings([
    response.intelligence.narrativeIntent,
    response.intelligence.interpretationMode,
    response.semantic.narrativeIntent,
    response.semantic.semanticMeaning,
    response.legalDecision.reason,
  ]);
}

function deriveDetectedContexts(response: AnalysisResponse): readonly string[] {
  return normalizedStrings([
    response.intelligence.context.narrativeContext,
    response.intelligence.context.storyMemory ?? "",
    response.intelligence.context.sceneMemory ?? "",
    response.intelligence.context.localContext,
    ...response.intelligence.context.neighboringSentences,
    ...Object.entries(response.intelligence.flags)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => name),
  ]);
}

function buildAcademySection(rootDir: string): V3DebugAcademySection {
  const lessons = loadReviewerKnowledgeLessonsFromDirectory(join(rootDir, "lessons")).map(summarizeLesson);
  const academyIndex = loadReviewerAcademyIndex(join(rootDir, "academy"));
  const patternLibraries = loadPatternLibraryDocuments(join(rootDir, "patternLibraries")).map(summarizePatternLibrary);
  const decisionRecords = createDecisionRecordRegistry(join(rootDir, "decisionRecords", "examples")).list().map(summarizeDecisionRecord);
  const blueprints = discoverBlueprintFolders(join(rootDir, "blueprints"));

  return Object.freeze({
    loadedLessons: Object.freeze(lessons),
    loadedReviewerPacks: Object.freeze(academyIndex.packs.map(summarizePack)),
    loadedPatternLibraries: Object.freeze(patternLibraries),
    loadedDecisionRecords: Object.freeze(decisionRecords),
    loadedBlueprints: blueprints,
  });
}

function buildReviewerSection(
  response: AnalysisResponse,
  input: V3DebugCollectorInput,
): V3DebugReviewerSection {
  const evidenceCollected = input.evidenceCollected ?? response.legalDecision.evidence.candidates.map((candidate) => candidate.text);
  const confidenceEvolution = input.confidenceEvolution ?? [
    { stage: "semantic", confidence: response.semantic.confidence, note: "Semantic confidence" },
    { stage: "legal", confidence: response.legalDecision.confidence, note: "Final legal confidence" },
  ];
  return Object.freeze({
    reviewerQuestionsAsked: Object.freeze([...(input.reviewerQuestionsAsked ?? [])]),
    evidenceCollected: Object.freeze(normalizedStrings(evidenceCollected)),
    confidenceEvolution: Object.freeze(confidenceEvolution.map((entry) => Object.freeze({
      stage: entry.stage,
      confidence: Number(entry.confidence.toFixed(6)),
      note: entry.note ?? null,
    }))),
    discardedHypotheses: Object.freeze(normalizedStrings(input.discardedHypotheses ?? response.legalDecision.exceptions.filter((entry) => entry.disposition === "block").map((entry) => entry.reason))),
    acceptedHypotheses: Object.freeze(normalizedStrings(input.acceptedHypotheses ?? (response.legalDecision.finding ? [response.legalDecision.reason] : []))),
  });
}

function buildLegalSection(response: AnalysisResponse, input: V3DebugCollectorInput): V3DebugLegalSection {
  const candidateGcamArticles = input.candidateGcamArticles ?? response.legalDecision.articleIds;
  const finalArticle = input.finalArticle ?? response.legalDecision.articleIds[0] ?? null;
  return Object.freeze({
    candidateGcamArticles: Object.freeze([...new Set(candidateGcamArticles)].sort((left, right) => left - right)),
    finalArticle,
    reasoningPath: Object.freeze([...response.legalDecision.trace]),
  });
}

function buildOutputSection(response: AnalysisResponse, input: V3DebugCollectorInput): V3DebugOutputSection {
  return Object.freeze({
    findings: Object.freeze([...(input.findings ?? [])]),
    observations: Object.freeze(normalizedStrings(input.observations ?? response.legalDecision.trace)),
    confidence: Number(response.legalDecision.confidence.toFixed(6)),
    diagnosticsHashes: Object.freeze({
      promptHash: response.promptHash,
      semanticHash: response.semanticHash,
      legalHash: response.legalHash,
      rawResponseHash: input.rawResponseHash ?? null,
      executionSignatureHash: input.executionSignatureHash ?? null,
    }),
  });
}

function buildGeneralSection(response: AnalysisResponse, input: V3DebugCollectorInput): V3DebugGeneralSection {
  const runtimeHashSource = {
    engineVersion: input.engineVersion ?? "v3",
    provider: input.provider ?? "unknown",
    model: input.model ?? "unknown",
    executionTimeMs: input.executionTimeMs ?? null,
    totalPromptSize: input.totalPromptSize ?? null,
    totalCompletionSize: input.totalCompletionSize ?? null,
    promptHash: response.promptHash,
    semanticHash: response.semanticHash,
    legalHash: response.legalHash,
    rawResponseHash: input.rawResponseHash ?? null,
    executionSignatureHash: input.executionSignatureHash ?? null,
    stageHashes: response.stageHashes,
    stageTimings: response.stageTimings,
  };
  return Object.freeze(runtimeHashSource);
}

function hashCollection(collection: V3DebugCollection): string {
  return hash({
    general: collection.general,
    academy: collection.academy,
    intelligence: collection.intelligence,
    reviewer: collection.reviewer,
    legal: collection.legal,
    reasoningTrace: collection.reasoningTrace,
    output: collection.output,
    timeline: collection.timeline,
    summary: collection.summary,
  });
}

export function collectV3DebugReport(input: V3DebugCollectorInput): V3DebugReport {
  const response = input.analysisResponse;
  const rootDir = input.academyRootDir ?? defaultReviewerKnowledgeRoot();
  const academy = buildAcademySection(rootDir);
  const intelligence: V3DebugIntelligenceSection = Object.freeze({
    detectedConcepts: deriveDetectedConcepts(response),
    detectedEntities: deriveDetectedEntities(response),
    detectedTargets: deriveDetectedTargets(response),
    detectedIntents: deriveDetectedIntents(response),
    detectedContexts: deriveDetectedContexts(response),
  });
  const reviewer = buildReviewerSection(response, input);
  const legal = buildLegalSection(response, input);
  const reasoningTrace: V3DebugReasoningTraceSection = Object.freeze({
    traces: buildV3ReasoningTrace({
      analysisResponse: response,
      findings: input.findings ?? [],
      academyRootDir: rootDir,
    }),
  });
  const primaryTrace = reasoningTrace.traces[0] ?? null;
  const gcamMapping = getTruthLayerMapping(input, input.findings?.[0] ?? null);
  const reviewerJudgment = buildReviewerJudgmentSection(response, input);
  const reasoningChain = buildReasoningChainSection(response, primaryTrace);
  const knowledgeUsage = buildKnowledgeUsageSection(input, primaryTrace);
  const findingGeneration = buildFindingGenerationSection(response, input, gcamMapping);
  const performance = buildPerformanceSection(response, input);
  const output = buildOutputSection(response, input);
  const general = buildGeneralSection(response, input);
  const timeline = buildV3DebugTimeline(response.stageTimings, response.stageHashes);
  const provisional: V3DebugCollection = {
    general,
    academy,
    intelligence,
    reviewer,
    legal,
    gcamMapping,
    reviewerJudgment,
    reasoningChain,
    knowledgeUsage,
    findingGeneration,
    performance,
    reasoningTrace,
    output,
    timeline,
    summary: Object.freeze({
      headline: "",
      counts: Object.freeze({
        lessons: 0,
        reviewerPacks: 0,
        patternLibraries: 0,
        decisionRecords: 0,
        blueprints: 0,
        concepts: 0,
        entities: 0,
        targets: 0,
        intents: 0,
        contexts: 0,
        evidenceItems: 0,
        findings: 0,
        observations: 0,
      }),
      confidenceLabel: "very low",
      keyTakeaways: Object.freeze([]),
    }),
    hash: "",
  };
  const summary = buildV3DebugSummary(provisional);
  const collection: V3DebugCollection = Object.freeze({
    ...provisional,
    summary,
    hash: "",
  });
  const hashValue = hashCollection(collection);
  return Object.freeze({
    ...collection,
    hash: hashValue,
  });
}

export function resolveV3DebugRoots(): Readonly<{
  reviewerKnowledgeRoot: string;
  academyRoot: string;
  lessonsRoot: string;
  patternLibrariesRoot: string;
  decisionRecordsRoot: string;
  blueprintsRoot: string;
}> {
  const reviewerKnowledgeRoot = defaultReviewerKnowledgeRoot();
  return Object.freeze({
    reviewerKnowledgeRoot,
    academyRoot: defaultAcademyRoot(),
    lessonsRoot: defaultLessonsRoot(),
    patternLibrariesRoot: defaultPatternLibrariesRoot(),
    decisionRecordsRoot: defaultDecisionRecordsRoot(),
    blueprintsRoot: defaultBlueprintsRoot(),
  });
}
