import { buildIntelligenceContext } from "../intelligence/intelligenceBuilder.js";
import { runContextStage } from "../pipeline/contextStage.js";
import { runEvidenceStage } from "../pipeline/evidenceStage.js";
import { runNarrativeStage } from "../pipeline/narrativeStage.js";
import { runSemanticStage } from "../pipeline/semanticStage.js";
import type { V3PipelineChunk } from "../pipeline/pipelineTypes.js";
import { runReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRunner.js";
import { createReviewerKnowledgeRetrievalReport } from "../reviewerKnowledge/reviewerKnowledgeRetrieval.js";
import { createDefaultReviewerKnowledgeRegistry } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import type { BenchmarkActualFinding, BenchmarkCase, BenchmarkCaseMismatch, BenchmarkCaseResult, BenchmarkReport } from "./benchmarkTypes.js";
import { createBenchmarkValidator } from "./benchmarkValidator.js";
import { createBenchmarkReport } from "./benchmarkReport.js";
import { buildBenchmarkScore } from "./benchmarkScore.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left - right));
}

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeLower(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function makeChunk(caseItem: BenchmarkCase): V3PipelineChunk {
  return Object.freeze({
    text: normalizeText(caseItem.scriptSnippet),
    startOffset: 0,
    endOffset: normalizeText(caseItem.scriptSnippet).length,
    chunkIndex: 0,
    storyMemory: caseItem.storyMemory,
    sceneMemory: caseItem.sceneMemory,
    neighboringSentences: caseItem.neighboringSentences,
    metadata: Object.freeze({ benchmarkCaseId: caseItem.id }),
  });
}

function buildBenchmarkPromptInput(caseItem: BenchmarkCase) {
  return Object.freeze({
    reasoningContract: {
      title: "Benchmark Reasoning Contract",
      stages: [],
    },
    decisionGraph: {
      title: "Benchmark Decision Graph",
      nodes: [],
    },
    semanticLayer: {
      title: "Benchmark Semantic Layer",
    },
    storyMemory: caseItem.storyMemory ?? "",
    chunkContext: {
      localChunk: normalizeText(caseItem.scriptSnippet),
      neighboringSentences: caseItem.neighboringSentences,
      sceneMemory: caseItem.sceneMemory,
      metadata: Object.freeze({ benchmarkCaseId: caseItem.id }),
    },
    subjectModule: caseItem.subjectModule,
    glossary: caseItem.glossary,
    outputSchema: {
      title: "Benchmark Output Schema",
      fields: [],
    },
  });
}

function buildDisposition(assessment: ReturnType<typeof runReviewerMethodology>, packIds: readonly string[]): BenchmarkActualFinding["disposition"] {
  if (packIds.length === 0) return "reject";
  if (assessment.exceptionSignals.length > 0) return "reject";
  if (assessment.narrativeIntent === "condemnation") return "reject";
  if (assessment.narrativeIntent === "education") return "reject";
  if (assessment.narrativeIntent === "quotation") return "reject";
  if (assessment.contextClassification === "documentary" || assessment.contextClassification === "quoted" || assessment.contextClassification === "educational" || assessment.contextClassification === "condemnatory" || assessment.contextClassification === "fictional" || assessment.contextClassification === "satirical") {
    return "reject";
  }
  if (assessment.confidence >= 0.7 && assessment.evidenceStrength >= 0.7 && assessment.conceptCount > 0) return "match";
  return "review";
}

function buildFindingSummary(moduleId: string | null, disposition: BenchmarkActualFinding["disposition"], articleIds: readonly number[], conceptIds: readonly string[]): string {
  return [
    `module=${moduleId ?? "none"}`,
    `disposition=${disposition}`,
    `articles=${articleIds.length > 0 ? articleIds.join(",") : "none"}`,
    `concepts=${conceptIds.length > 0 ? conceptIds.join(",") : "none"}`,
  ].join(" | ");
}

function buildExplanation(moduleId: string | null, disposition: BenchmarkActualFinding["disposition"], conceptIds: readonly string[], assessment: ReturnType<typeof runReviewerMethodology>, articleIds: readonly number[]): string {
  return [
    `module=${moduleId ?? "none"}`,
    `concepts=${conceptIds.length > 0 ? conceptIds.join(",") : "none"}`,
    `intent=${assessment.narrativeIntent}`,
    `context=${assessment.contextClassification}`,
    `exceptions=${assessment.exceptionSignals.length > 0 ? assessment.exceptionSignals.join(",") : "none"}`,
    `articles=${articleIds.length > 0 ? articleIds.join(",") : "none"}`,
    `disposition=${disposition}`,
  ].join(" | ");
}

function compareStringSets(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function compareNumberSets(actual: readonly number[], expected: readonly number[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function compareAssessment(actual: ReturnType<typeof runReviewerMethodology>, expected: BenchmarkCase["expectedReviewerAssessment"]): boolean {
  return (
    normalizeLower(actual.narrativeIntent) === normalizeLower(expected.narrativeIntent) &&
    normalizeLower(actual.contextClassification) === normalizeLower(expected.contextClassification) &&
    normalizeLower(actual.literalVsImpliedMeaning) === normalizeLower(expected.literalVsImpliedMeaning) &&
    compareStringSets(uniqueSortedStrings(actual.exceptionSignals), uniqueSortedStrings(expected.exceptionSignals)) &&
    Math.abs(actual.evidenceStrength - expected.evidenceStrength) <= 0.2
  );
}

function confidenceWithinRange(confidence: number, range: BenchmarkCase["expectedConfidenceRange"]): boolean {
  return confidence >= range.min && confidence <= range.max;
}

function evaluateCase(caseItem: BenchmarkCase): BenchmarkCaseResult {
  const chunk = makeChunk(caseItem);
  const narrative = runNarrativeStage(chunk);
  const evidence = runEvidenceStage(chunk);
  const semantic = runSemanticStage(narrative, evidence);
  const context = runContextStage({ chunk, narrative, evidence, semantic });
  const intelligence = buildIntelligenceContext({
    moduleId: caseItem.subjectModule.id,
    storyMemory: caseItem.storyMemory ?? null,
    narrative,
    evidence,
    semantic,
    context,
    glossary: caseItem.glossary,
  });

  const assessment = runReviewerMethodology({
    promptInput: buildBenchmarkPromptInput(caseItem),
    conceptContext: intelligence.conceptContext,
  });

  const registry = createDefaultReviewerKnowledgeRegistry();
  const packs = createReviewerKnowledgeRetrievalReport({
    assessment,
    conceptContext: intelligence.conceptContext,
    subjectModule: caseItem.subjectModule,
    registry,
  }).selectedPacks;
  const selectedPackIds = packs.map((pack) => pack.id);
  const selectedPack = packs.find((pack) => normalizeLower(pack.id) !== "v3_00_universal") ?? packs[0] ?? null;
  const articleIds = uniqueSortedNumbers(packs.flatMap((pack) => pack.article_mapping.map((entry) => entry.article_id)));
  const disposition = buildDisposition(assessment, selectedPackIds);
  const moduleId = selectedPack?.module_id ?? null;
  const summary = buildFindingSummary(moduleId, disposition, articleIds, intelligence.conceptContext.conceptIds);
  const explanation = buildExplanation(moduleId, disposition, intelligence.conceptContext.conceptIds, assessment, articleIds);
  const confidence = Number(assessment.confidence.toFixed(6));
  const actualFinding: BenchmarkActualFinding = Object.freeze({
    moduleId,
    articleIds,
    disposition,
    summary,
    explanation,
    confidence,
  });

  const mismatches: BenchmarkCaseMismatch = Object.freeze({
    concepts: !compareStringSets(uniqueSortedStrings(intelligence.conceptContext.conceptIds), uniqueSortedStrings(caseItem.expectedConcepts)),
    reviewerAssessment: !compareAssessment(assessment, caseItem.expectedReviewerAssessment),
    legalModule: normalizeLower(moduleId ?? "") !== normalizeLower(caseItem.expectedLegalModule),
    articleMapping: !compareNumberSets(articleIds, uniqueSortedNumbers(caseItem.expectedArticleMapping)),
    finding: normalizeLower(summary) !== normalizeLower(caseItem.expectedFinding.summary) || disposition !== caseItem.expectedFinding.disposition,
    explanation: normalizeLower(explanation) !== normalizeLower(caseItem.expectedExplanation),
    confidence: !confidenceWithinRange(confidence, caseItem.expectedConfidenceRange),
  });

  const passed = !Object.values(mismatches).some(Boolean);

  return Object.freeze({
    case: caseItem,
    actualConcepts: intelligence.conceptContext.conceptIds,
    actualReviewerAssessment: assessment,
    actualLegalModule: moduleId,
    actualFinding,
    passed,
    mismatches,
  });
}

export class BenchmarkRunner {
  private readonly validator = createBenchmarkValidator();

  run(cases: readonly BenchmarkCase[]): BenchmarkReport {
    const validation = this.validator.validateCases(cases);
    if (!validation.valid) {
      const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new Error(`Invalid benchmark cases: ${message}`);
    }

    const results = cases.map((caseItem) => evaluateCase(caseItem));
    const score = buildBenchmarkScore(results);
    const report = createBenchmarkReport(results, score);

    const reportValidation = this.validator.validateReport(report);
    if (!reportValidation.valid) {
      const message = reportValidation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new Error(`Invalid benchmark report: ${message}`);
    }

    return report;
  }
}

export function createBenchmarkRunner(): BenchmarkRunner {
  return new BenchmarkRunner();
}
