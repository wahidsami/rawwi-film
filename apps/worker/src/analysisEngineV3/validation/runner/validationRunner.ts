import { createHash } from "node:crypto";

import { createAnalysisFactory } from "../../engine/analysisFactory.js";
import { buildIntelligenceContext } from "../../intelligence/intelligenceBuilder.js";
import { runContextStage } from "../../pipeline/contextStage.js";
import { runEvidenceStage } from "../../pipeline/evidenceStage.js";
import { runNarrativeStage } from "../../pipeline/narrativeStage.js";
import { runSemanticStage } from "../../pipeline/semanticStage.js";
import { createDefaultReviewerKnowledgeRegistry } from "../../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { selectReviewerKnowledgePacks } from "../../reviewerKnowledge/reviewerKnowledgeSelector.js";
import { runReviewerMethodology } from "../../reviewerMethodology/reviewerMethodologyRunner.js";
import { buildV3ReasoningTrace } from "../../debug/reasoningTrace.js";
import type { V3RuntimeFinding } from "../../runtime/runtimeTypes.js";
import { createGcamMapperRegistry } from "../../reviewerKnowledge/gcamMapper/index.js";
import type { ValidationCase, ValidationCaseResult, ValidationReport } from "../types/validationTypes.js";
import { compareValidationCase } from "../comparators/validationComparator.js";
import { createValidationReport } from "../reports/validationReports.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.map((value) => Number(value.toFixed(6))))].sort((left, right) => left - right));
}

function buildPromptInput(caseItem: ValidationCase) {
  return Object.freeze({
    reasoningContract: {
      title: "Offline Validation Reasoning Contract",
      stages: [],
    },
    decisionGraph: {
      title: "Offline Validation Decision Graph",
      nodes: [],
    },
    semanticLayer: {
      title: "Offline Validation Semantic Layer",
    },
    storyMemory: caseItem.storyMemory ?? "",
    chunkContext: {
      localChunk: caseItem.scriptSnippet,
      neighboringSentences: caseItem.neighboringSentences,
      sceneMemory: caseItem.sceneMemory,
      metadata: Object.freeze({ validationCaseId: caseItem.id }),
    },
    subjectModule: caseItem.subjectModule,
    glossary: caseItem.glossary,
    outputSchema: {
      title: "Offline Validation Output Schema",
      fields: [],
    },
  });
}

function inferDomains(moduleId: string): readonly string[] {
  const normalized = moduleId.toLowerCase();
  if (normalized.includes("profanity")) return Object.freeze(["society"]);
  if (normalized.includes("security")) return Object.freeze(["security"]);
  if (normalized.includes("religion")) return Object.freeze(["religion"]);
  if (normalized.includes("children")) return Object.freeze(["children"]);
  if (normalized.includes("drugs")) return Object.freeze(["drugs"]);
  if (normalized.includes("crime")) return Object.freeze(["crime"]);
  return Object.freeze(["general"]);
}

function buildJudgmentDisposition(status: "accept" | "needs_review" | "reject"): "match" | "review" | "reject" {
  if (status === "accept") return "match";
  if (status === "needs_review") return "review";
  return "reject";
}

function buildFindingSummary(moduleId: string | null, disposition: "match" | "review" | "reject", articleIds: readonly number[], conceptIds: readonly string[]): string {
  return [
    `module=${moduleId ?? "none"}`,
    `disposition=${disposition}`,
    `articles=${articleIds.length > 0 ? articleIds.join(",") : "none"}`,
    `concepts=${conceptIds.length > 0 ? conceptIds.join(",") : "none"}`,
  ].join(" | ");
}

function buildExplanation(
  moduleId: string | null,
  disposition: "match" | "review" | "reject",
  conceptIds: readonly string[],
  intent: string,
  context: string,
  exceptions: readonly string[],
  articleIds: readonly number[],
): string {
  return [
    `module=${moduleId ?? "none"}`,
    `concepts=${conceptIds.length > 0 ? conceptIds.join(",") : "none"}`,
    `intent=${intent}`,
    `context=${context}`,
    `exceptions=${exceptions.length > 0 ? exceptions.join(",") : "none"}`,
    `articles=${articleIds.length > 0 ? articleIds.join(",") : "none"}`,
    `disposition=${disposition}`,
  ].join(" | ");
}

function toRuntimeFinding(
  caseItem: ValidationCase,
  actual: Readonly<{
    moduleId: string | null;
    articleIds: readonly number[];
    atomId: string | null;
    disposition: "match" | "review" | "reject";
    summary: string;
    explanation: string;
    confidence: number;
  }>,
  response: Awaited<ReturnType<ReturnType<typeof createAnalysisFactory>["analyze"]>>,
): V3RuntimeFinding {
  const primaryIndex = response.evidence.primaryCandidateIndex;
  const candidate = primaryIndex === null
    ? response.evidence.candidates[0]
    : response.evidence.candidates[primaryIndex] ?? response.evidence.candidates[0];
  const endOffset = candidate?.endOffset ?? caseItem.scriptSnippet.length;
  return Object.freeze({
    source: "ai",
    article_id: actual.articleIds[0] ?? 0,
    atom_id: actual.atomId,
    severity: actual.disposition === "match" ? "medium" : "low",
    confidence: actual.confidence,
    title_ar: actual.moduleId ?? caseItem.subjectModule.titleAr,
    description_ar: actual.summary,
    evidence_snippet: candidate?.text ?? caseItem.scriptSnippet,
    rationale_ar: actual.explanation,
    final_ruling: actual.disposition === "match" ? "violation" : "needs_review",
    detection_pass: actual.moduleId ?? caseItem.subjectModule.id,
    location: {
      start_offset: candidate?.startOffset ?? 0,
      end_offset: endOffset,
      start_line: null,
      end_line: null,
      v3: {},
    },
    start_offset_global: candidate?.startOffset ?? 0,
    end_offset_global: endOffset,
    canonical_atom: actual.atomId,
    lineage_id: null,
    parent_lineage_id: null,
    evidence_hash: null,
    canonical_hash: null,
    is_interpretive: actual.disposition !== "match",
    depiction_type: "unknown",
    speaker_role: response.intelligence.speaker ?? "unknown",
    narrative_consequence: response.semantic.riskContext ?? "unknown",
    context_window_id: null,
    context_confidence: response.context.confidence,
    lexical_confidence: response.evidence.confidence,
    policy_confidence: response.semantic.confidence,
    canonical_finding_id: `${caseItem.id}-validation`,
    category: actual.moduleId ?? caseItem.subjectModule.id,
    related_article_ids: Object.freeze([...actual.articleIds]),
  } as V3RuntimeFinding);
}

function evaluateCase(caseItem: ValidationCase): ValidationCaseResult {
  const factory = createAnalysisFactory();
  const response = factory.analyze({
    chunk: {
      text: caseItem.scriptSnippet,
      startOffset: 0,
      endOffset: caseItem.scriptSnippet.length,
      chunkIndex: 0,
    },
    storyMemory: caseItem.storyMemory,
    sceneMemory: caseItem.sceneMemory,
    neighboringSentences: caseItem.neighboringSentences,
    glossary: caseItem.glossary,
    subjectModule: caseItem.subjectModule,
    outputSchema: {
      title: "Offline Validation Output Schema",
      fields: [],
    },
  });

  const chunk = {
    text: caseItem.scriptSnippet,
    startOffset: 0,
    endOffset: caseItem.scriptSnippet.length,
    chunkIndex: 0,
    storyMemory: caseItem.storyMemory,
    sceneMemory: caseItem.sceneMemory,
    neighboringSentences: caseItem.neighboringSentences,
    metadata: null,
  } as const;
  const narrative = runNarrativeStage(chunk);
  const evidence = runEvidenceStage(chunk);
  const semantic = runSemanticStage(narrative, evidence);
  const context = runContextStage({ chunk, narrative, evidence, semantic });
  const intelligence = buildIntelligenceContext({
    moduleId: caseItem.subjectModule.id,
    storyMemory: caseItem.storyMemory,
    narrative,
    evidence,
    semantic,
    context,
    glossary: caseItem.glossary,
  });
  const assessment = runReviewerMethodology({
    promptInput: buildPromptInput(caseItem),
    conceptContext: intelligence.conceptContext,
  });

  const registry = createDefaultReviewerKnowledgeRegistry();
  const selectedPacks = selectReviewerKnowledgePacks(assessment, intelligence.conceptContext, registry);
  const actualArticleMapping = uniqueSortedNumbers(selectedPacks.flatMap((pack) => pack.article_mapping.map((entry) => entry.article_id)));
  const actualLegalModule = selectedPacks.find((pack) => pack.id !== "v3_00_universal")?.module_id ?? null;
  const actualAtomId = selectedPacks.find((pack) => pack.id !== "v3_00_universal")?.article_mapping.find((entry) => entry.article_id === actualArticleMapping[0])?.atom_ids[0] ?? null;
  const actualJudgment = buildJudgmentDisposition(response.legalDecision.status);
  const actualFinding = Object.freeze({
    moduleId: actualLegalModule,
    articleIds: actualArticleMapping,
    atomId: actualAtomId,
    disposition: actualJudgment,
    summary: buildFindingSummary(actualLegalModule, actualJudgment, actualArticleMapping, intelligence.conceptContext.conceptIds),
    explanation: buildExplanation(
      actualLegalModule,
      actualJudgment,
      intelligence.conceptContext.conceptIds,
      assessment.narrativeIntent,
      assessment.contextClassification,
      assessment.exceptionSignals,
      actualArticleMapping,
    ),
    confidence: Number(assessment.confidence.toFixed(6)),
  });

  const runtimeFinding = toRuntimeFinding(caseItem, actualFinding, response);
  const reasoningTrace = buildV3ReasoningTrace({ analysisResponse: response, findings: [runtimeFinding] })[0] ?? null;

  const comparison = compareValidationCase(caseItem, {
    concepts: intelligence.conceptContext.conceptIds,
    intent: assessment.narrativeIntent,
    context: assessment.contextClassification,
    evidence: intelligence.evidenceAssessment.primaryText,
    judgment: actualJudgment,
    articleIds: actualArticleMapping,
    atomId: actualAtomId,
    finding: actualFinding,
    legalModule: actualLegalModule,
    confidence: assessment.confidence,
  });

  return Object.freeze({
    ...comparison,
    reasoningTrace,
  });
}

export class ValidationRunner {
  run(cases: readonly ValidationCase[]): ValidationReport {
    const results = cases.map((caseItem) => evaluateCase(caseItem));
    return createValidationReport(results);
  }
}

export function createValidationRunner(): ValidationRunner {
  return new ValidationRunner();
}
