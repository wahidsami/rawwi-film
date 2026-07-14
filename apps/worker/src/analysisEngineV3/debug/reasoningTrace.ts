import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { selectReviewerKnowledgePacks } from "../reviewerKnowledge/reviewerKnowledgeSelector.js";
import { createDefaultReviewerKnowledgeRegistry } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "../reviewerKnowledge/lessons/lessonLoader.js";
import { loadPatternLibraryDocuments } from "../reviewerKnowledge/patternLibraries/patternLibraryLoader.js";
import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3RuntimeFinding } from "../runtime/runtimeTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerKnowledgeLesson } from "../reviewerKnowledge/lessons/lessonTypes.js";
import type { PatternLibraryDocument } from "../reviewerKnowledge/patternLibraries/patternLibraryTypes.js";
import type { ReviewerKnowledgePack } from "../reviewerKnowledge/reviewerKnowledgeTypes.js";
import type { V3ReasoningTrace, V3ReasoningTraceStage } from "./reasoningTraceTypes.js";

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

function unique(values: readonly string[]): readonly string[] {
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

function safeConfidence(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(6)) : fallback;
}

function conceptIdsFromIntelligence(response: AnalysisResponse): readonly string[] {
  return unique(response.intelligence.conceptContext.conceptIds);
}

function buildReviewerAssessment(response: AnalysisResponse): ReviewerAssessment {
  return Object.freeze({
    methodologyId: response.intelligence.conceptContext.primaryConceptId ?? "universal_reviewer_methodology_v1",
    methodologyTitle: "Universal Reviewer Methodology",
    narrativeUnderstanding: response.narrative?.sceneType ?? "unknown",
    speaker: response.intelligence.speaker ?? response.narrative?.speaker ?? null,
    target: response.intelligence.target ?? response.narrative?.target ?? null,
    victim: response.intelligence.victim ?? null,
    narrativeIntent: response.intelligence.narrativeIntent ?? response.narrative?.narrativeIntent ?? "unknown",
    evidenceStrength: safeConfidence(response.evidence?.confidence),
    contextClassification: response.intelligence.dialogueMode ?? "unknown",
    literalVsImpliedMeaning: response.semantic?.semanticMeaning ?? "unknown",
    exceptionSignals: Object.freeze(
      unique([
        ...(response.narrative.condemnation ? ["condemnation"] : []),
        ...(response.narrative.historicalContext ? ["historical"] : []),
        ...(response.narrative.documentary ? ["documentary"] : []),
        ...(response.narrative.satire ? ["satire"] : []),
        ...(response.narrative.dream ? ["dream"] : []),
        ...(response.narrative.flashback ? ["flashback"] : []),
      ]),
    ),
    confidence: safeConfidence(response.legalDecision?.confidence),
    applicableConceptIds: Object.freeze([...response.intelligence.conceptContext.conceptIds]),
    conceptConfidence: response.intelligence.conceptContext.confidence,
    conceptCount: response.intelligence.conceptContext.conceptCount,
    reasoningTrace: Object.freeze([response.semantic.semanticMeaning, response.legalDecision.reason]),
    stageResults: Object.freeze([]),
  });
}

function detectActions(response: AnalysisResponse, finding: V3RuntimeFinding): readonly string[] {
  const signals = new Set<string>();
  const text = normalizeText(finding.evidence_snippet ?? response.legalDecision.evidence.candidates[0]?.text ?? "");
  if (response.intelligence.flags.dialogue || response.narrative?.dialogue) signals.add("dialogue");
  if (response.intelligence.flags.narration || response.narrative?.narration) signals.add("narration");
  if (response.intelligence.flags.instruction || response.narrative?.instruction) signals.add("instruction");
  if (response.intelligence.flags.threat || response.narrative?.threat) signals.add("threat");
  if (response.intelligence.flags.documentary || response.narrative?.documentary) signals.add("documentary");
  if (response.intelligence.flags.educational) signals.add("education");
  if (response.intelligence.flags.satire) signals.add("satire");
  if (response.intelligence.flags.dream) signals.add("dream");
  if (response.intelligence.flags.flashback) signals.add("flashback");
  if (response.intelligence.flags.quotation) signals.add("quotation");
  if (text.length > 0) {
    if (/[!؟]/.test(text)) signals.add("exclamatory");
    if (/[:]/.test(text)) signals.add("reported_speech");
    if (/\b(قال|قالت|يقول|تقول|said|tell|told)\b/i.test(text)) signals.add("speech_act");
  }
  return Object.freeze([...signals].sort((left, right) => left.localeCompare(right)));
}

function detectContext(response: AnalysisResponse): readonly string[] {
  return unique([
    response.intelligence.context.narrativeContext,
    response.intelligence.context.storyMemory ?? "",
    response.intelligence.context.sceneMemory ?? "",
    response.intelligence.context.localContext,
    ...response.intelligence.context.neighboringSentences,
    response.intelligence.dialogueMode,
    response.intelligence.interpretationMode,
    response.narrative?.sceneType ?? "",
    response.narrative?.narrativeIntent ?? "",
  ]);
}

function detectIntent(response: AnalysisResponse, finding: V3RuntimeFinding): readonly string[] {
  return unique([
    response.intelligence.narrativeIntent,
    response.semantic?.narrativeIntent ?? "",
    response.semantic?.semanticMeaning ?? "",
    response.semantic?.riskContext ?? "",
    response.narrative?.narrativeIntent ?? "",
    finding.title_ar ?? "",
    finding.severity ?? "",
  ]);
}

function detectTargets(response: AnalysisResponse): readonly string[] {
  return unique([
    response.intelligence.target ?? "",
    response.intelligence.victim ?? "",
    response.semantic.target ?? "",
    response.semantic.victim ?? "",
    ...response.intelligence.entities.filter((entity) => entity.role === "target" || entity.role === "victim").map((entity) => entity.label),
  ]);
}

function detectSupportingEvidence(response: AnalysisResponse, finding: V3RuntimeFinding): readonly string[] {
  const candidateEvidence = response.legalDecision.evidence.candidates.map((candidate) => candidate.text);
  return unique([
    ...(finding.evidence_snippet ? [finding.evidence_snippet] : []),
    ...candidateEvidence,
    ...(response.legalDecision.finding ? [response.legalDecision.finding.reason] : []),
  ]);
}

function detectContradictingEvidence(response: AnalysisResponse): readonly string[] {
  return unique([
    ...response.legalDecision.exceptions.filter((exception) => exception.applies && exception.disposition !== "allow").map((exception) => exception.reason),
    ...(response.legalDecision.status === "reject" ? ["final_status_reject"] : []),
  ]);
}

function gatherReviewerQuestions(response: AnalysisResponse): readonly string[] {
  const baseQuestions = [
    "Who is speaking?",
    "Who is the target?",
    "What is the intent?",
    "What context changes the meaning?",
    "What evidence supports the candidate?",
    "What evidence contradicts the candidate?",
    "Which reviewer question set was rendered?",
    "Does the candidate warrant the current confidence?",
  ];
  return unique([
    ...baseQuestions,
    ...(response.intelligence.context.neighboringSentences.length > 0 ? ["Do neighboring sentences change the interpretation?"] : []),
  ]);
}

function confidenceEvolution(response: AnalysisResponse, finding: V3RuntimeFinding): readonly Readonly<{ stage: string; confidence: number; note: string | null }>[] {
  return Object.freeze([
    Object.freeze({ stage: "semantic", confidence: safeConfidence(response.semantic?.confidence), note: "Semantic confidence" }),
    Object.freeze({ stage: "narrative", confidence: safeConfidence(response.narrative?.confidence), note: "Narrative confidence" }),
    Object.freeze({ stage: "evidence", confidence: safeConfidence(response.evidence?.confidence), note: "Evidence confidence" }),
    Object.freeze({ stage: "context", confidence: safeConfidence(response.context?.confidence), note: "Context confidence" }),
    Object.freeze({ stage: "legal", confidence: safeConfidence(response.legalDecision?.confidence), note: safeConfidence(finding.confidence).toFixed(6) }),
  ]);
}

function gatherCandidateArticles(response: AnalysisResponse, finding: V3RuntimeFinding): readonly number[] {
  return unique([
    ...response.legalDecision.articleIds.map((article) => String(article)),
    String(finding.article_id),
    ...(finding.related_article_ids ?? []).map((article) => String(article)),
  ]).map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function gatherApplicableLessons(response: AnalysisResponse, selectedPacks: readonly ReviewerKnowledgePack[], lessons: readonly ReviewerKnowledgeLesson[]): readonly string[] {
  const conceptIds = new Set(conceptIdsFromIntelligence(response).map((value) => value.toLowerCase()));
  const articleIds = new Set(response.legalDecision.articleIds.map((value) => String(value)));
  const lessonIds = new Set<string>();

  for (const lesson of lessons) {
    const lessonConceptIds = new Set(lesson.concepts.flatMap((concept) => [concept.id, ...concept.tags]).map((value) => value.toLowerCase()));
    const lessonArticleIds = new Set(lesson.gcamMappings.map((mapping) => String(mapping.articleId)));
    if ([...lessonConceptIds].some((id) => conceptIds.has(id)) || [...lessonArticleIds].some((id) => articleIds.has(id))) {
      lessonIds.add(lesson.id);
    }
    if (lesson.benchmarkReferences.some((reference) => reference.toLowerCase().includes("cross_sentence")) && response.intelligence.context.neighboringSentences.length > 0) {
      lessonIds.add(lesson.id);
    }
  }

  for (const pack of selectedPacks) {
    for (const trigger of pack.trigger_concept_ids) {
      if (conceptIds.has(trigger.toLowerCase())) {
        lessonIds.add(`pack:${pack.id}`);
      }
    }
  }

  return Object.freeze([...lessonIds].sort((left, right) => left.localeCompare(right)));
}

function gatherApplicablePatterns(response: AnalysisResponse, patterns: readonly PatternLibraryDocument[]): readonly string[] {
  const conceptIds = new Set(conceptIdsFromIntelligence(response).map((value) => value.toLowerCase()));
  const articleIds = new Set(response.legalDecision.articleIds.map((value) => String(value)));
  const ids = new Set<string>();
  for (const document of patterns) {
    for (const entry of document.entries) {
      if (entry.primary_concept_id && conceptIds.has(entry.primary_concept_id.toLowerCase())) {
        ids.add(entry.id);
        continue;
      }
      if (entry.related_concept_ids.some((conceptId) => conceptIds.has(conceptId.toLowerCase()))) {
        ids.add(entry.id);
        continue;
      }
      if (entry.gcam_mappings.some((mapping) => articleIds.has(String(mapping.article_id)))) {
        ids.add(entry.id);
      }
    }
  }
  return Object.freeze([...ids].sort((left, right) => left.localeCompare(right)));
}

function gatherApplicableKnowledgePacks(response: AnalysisResponse, packs: readonly ReviewerKnowledgePack[]): readonly string[] {
  const conceptIds = new Set(conceptIdsFromIntelligence(response).map((value) => value.toLowerCase()));
  return Object.freeze(
    packs
      .filter((pack) => pack.trigger_concept_ids.some((conceptId) => conceptIds.has(conceptId.toLowerCase())))
      .map((pack) => pack.id)
      .sort((left, right) => left.localeCompare(right)),
  );
}

function buildTraceStages(
  response: AnalysisResponse,
  finding: V3RuntimeFinding,
  selectedPacks: readonly ReviewerKnowledgePack[],
  lessons: readonly ReviewerKnowledgeLesson[],
  patterns: readonly PatternLibraryDocument[],
): readonly V3ReasoningTraceStage[] {
  const confidenceEvolutionEntries = confidenceEvolution(response, finding);
  const candidateArticles = gatherCandidateArticles(response, finding);
  return Object.freeze([
    Object.freeze({
      stage: "detected_concepts",
      title: "Detected Concepts",
      items: conceptIdsFromIntelligence(response),
      confidence: Number(response.intelligence.conceptContext.confidence.toFixed(6)),
    }),
    Object.freeze({
      stage: "detected_targets",
      title: "Detected Targets",
      items: detectTargets(response),
      confidence: safeConfidence(response.intelligence.context.confidence),
    }),
    Object.freeze({
      stage: "detected_actions",
      title: "Detected Actions",
      items: detectActions(response, finding),
      confidence: safeConfidence(response.semantic.confidence),
    }),
    Object.freeze({
      stage: "detected_context",
      title: "Detected Context",
      items: detectContext(response),
      confidence: safeConfidence(response.context.confidence),
    }),
    Object.freeze({
      stage: "detected_intent",
      title: "Detected Intent",
      items: detectIntent(response, finding),
      confidence: safeConfidence(response.semantic.confidence),
    }),
    Object.freeze({
      stage: "supporting_evidence",
      title: "Supporting Evidence",
      items: detectSupportingEvidence(response, finding),
      confidence: safeConfidence(response.evidence.confidence),
    }),
    Object.freeze({
      stage: "contradicting_evidence",
      title: "Contradicting Evidence",
      items: detectContradictingEvidence(response),
      confidence: safeConfidence(response.legalDecision.confidence),
    }),
    Object.freeze({
      stage: "reviewer_questions",
      title: "Reviewer Questions Evaluated",
      items: gatherReviewerQuestions(response),
      confidence: safeConfidence(response.context.confidence),
    }),
    Object.freeze({
      stage: "confidence_evolution",
      title: "Confidence Evolution",
      items: confidenceEvolutionEntries.map((entry) => `${entry.stage}:${entry.confidence.toFixed(6)}`),
      confidence: confidenceEvolutionEntries[confidenceEvolutionEntries.length - 1]?.confidence ?? 0,
    }),
    Object.freeze({
      stage: "applicable_pattern_libraries",
      title: "Applicable Pattern Libraries",
      items: gatherApplicablePatterns(response, patterns),
      confidence: safeConfidence(response.semantic.confidence),
    }),
    Object.freeze({
      stage: "applicable_lessons",
      title: "Applicable Lessons",
      items: gatherApplicableLessons(response, selectedPacks, lessons),
      confidence: safeConfidence(response.intelligence.conceptContext.confidence),
    }),
    Object.freeze({
      stage: "applicable_knowledge_packs",
      title: "Applicable Knowledge Packs",
      items: gatherApplicableKnowledgePacks(response, selectedPacks),
      confidence: safeConfidence(response.intelligence.conceptContext.confidence),
    }),
    Object.freeze({
      stage: "candidate_gcam_mappings",
      title: "Candidate GCAM Mappings",
      items: candidateArticles.map((articleId) => `article:${articleId}`),
      confidence: safeConfidence(response.legalDecision.confidence),
    }),
    Object.freeze({
      stage: "final_reviewer_decision",
      title: "Final Reviewer Decision",
      items: [response.legalDecision.status, finding.category ?? "unknown", `confidence:${finding.confidence.toFixed(6)}`],
      confidence: safeConfidence(response.legalDecision.confidence),
    }),
  ]);
}

export function buildV3ReasoningTrace(input: {
  analysisResponse: AnalysisResponse;
  findings: readonly V3RuntimeFinding[];
  academyRootDir?: string;
}): readonly V3ReasoningTrace[] {
  const response = input.analysisResponse;
  const reviewerKnowledgeRoot = input.academyRootDir ?? defaultReviewerKnowledgeRoot();
  const lessons = loadReviewerKnowledgeLessonsFromDirectory(join(reviewerKnowledgeRoot, "lessons"));
  const patterns = loadPatternLibraryDocuments(join(reviewerKnowledgeRoot, "patternLibraries"));
  const selectedPacks = selectReviewerKnowledgePacks(
    buildReviewerAssessment(response),
    response.intelligence.conceptContext as ConceptContext,
    createDefaultReviewerKnowledgeRegistry(),
  );

  const candidateFindings = input.findings.length > 0 ? input.findings : (response.legalDecision.finding ? [{
    source: "ai",
    article_id: response.legalDecision.articleIds[0] ?? 0,
    atom_id: null,
    severity: response.legalDecision.status === "reject" ? "low" : "medium",
    confidence: response.legalDecision.confidence,
    title_ar: response.legalDecision.moduleTitle,
    description_ar: response.legalDecision.reason,
    evidence_snippet: response.legalDecision.evidence.primaryCandidateIndex === null
      ? ""
      : response.legalDecision.evidence.candidates[response.legalDecision.evidence.primaryCandidateIndex]?.text ?? "",
    rationale_ar: response.legalDecision.reason,
    final_ruling: response.legalDecision.status,
    detection_pass: response.legalDecision.moduleId,
    location: {
      start_offset: response.legalDecision.evidence.primaryCandidateIndex === null
        ? 0
        : response.legalDecision.evidence.candidates[response.legalDecision.evidence.primaryCandidateIndex]?.startOffset ?? 0,
      end_offset: response.legalDecision.evidence.primaryCandidateIndex === null
        ? 0
        : response.legalDecision.evidence.candidates[response.legalDecision.evidence.primaryCandidateIndex]?.endOffset ?? 0,
      start_line: null,
      end_line: null,
      v3: {},
    },
    start_offset_global: response.legalDecision.evidence.primaryCandidateIndex === null
      ? 0
      : response.legalDecision.evidence.candidates[response.legalDecision.evidence.primaryCandidateIndex]?.startOffset ?? 0,
    end_offset_global: response.legalDecision.evidence.primaryCandidateIndex === null
      ? 0
      : response.legalDecision.evidence.candidates[response.legalDecision.evidence.primaryCandidateIndex]?.endOffset ?? 0,
    canonical_atom: null,
    lineage_id: null,
    parent_lineage_id: null,
    evidence_hash: null,
    canonical_hash: null,
    is_interpretive: response.legalDecision.status === "needs_review",
    depiction_type: "unknown",
    speaker_role: "unknown",
    narrative_consequence: "unknown",
    context_window_id: null,
    context_confidence: response.context.confidence,
    lexical_confidence: response.evidence.confidence,
    policy_confidence: response.semantic.confidence,
  } as V3RuntimeFinding] : []);

  const traces = candidateFindings.map((finding, index) => {
    const stages = buildTraceStages(response, finding, selectedPacks, lessons, patterns);
    const trace: V3ReasoningTrace = Object.freeze({
      findingIndex: index,
      findingId: finding.canonical_finding_id ?? `candidate-${index + 1}`,
      articleId: finding.article_id,
      atomId: finding.atom_id ?? null,
      category: finding.category ?? "unknown",
      stages,
      hash: hash({
        findingId: finding.canonical_finding_id ?? `candidate-${index + 1}`,
        stages,
      }),
    });
    return trace;
  });

  return Object.freeze(traces);
}
