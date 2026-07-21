import { createHash } from "node:crypto";
import type { AnalysisEngine, AnalysisJobContext, AnalysisResult } from "../../analysisEngine/types.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import { createBenchmarkMetrics, mergeStageScores } from "./benchmarkMetrics.js";
import { compareBenchmarkEngineResult, buildBenchmarkCaseResult } from "./benchmarkComparator.js";
import { createBenchmarkReport } from "./benchmarkReport.js";
import { renderBenchmarkReportMarkdown } from "./benchmarkRenderer.js";
import { persistBenchmarkReport, type BenchmarkPersistenceOptions } from "./benchmarkPersistence.js";
import type {
  BenchmarkCaseResult,
  BenchmarkEngineComparison,
  BenchmarkEngineMetrics,
  BenchmarkEngineName,
  BenchmarkMetrics,
  BenchmarkReport,
  BenchmarkScreenplay,
} from "./benchmarkTypes.js";

export type BenchmarkRunnerOptions = Readonly<{
  engines?: Readonly<Partial<Record<BenchmarkEngineName, AnalysisEngine>>>;
  markdownPath?: string | null;
  reportPath?: string | null;
  tracePath?: string | null;
  persistence?: BenchmarkPersistenceOptions;
}>;

function benchmarkSignature(cases: readonly BenchmarkScreenplay[]): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(cases));
  return hash.digest("hex");
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractTraceDocument(result: AnalysisResult): SceneAnalysisTraceDocument | null {
  const trace = result.truthLayerMeta.scene_analysis_trace;
  if (!trace || typeof trace !== "object") {
    return null;
  }
  return trace as SceneAnalysisTraceDocument;
}

function buildEngineRequest(caseItem: BenchmarkScreenplay, benchmarkId: string, engine: BenchmarkEngineName): AnalysisJobContext {
  return Object.freeze({
    request: Object.freeze({
      jobId: `${benchmarkId}:${caseItem.screenplayId}`,
      chunkId: `${caseItem.screenplayId}:${caseItem.sceneId}`,
      scriptId: caseItem.screenplayId,
      versionId: caseItem.sceneId,
      chunkText: caseItem.sceneText,
      chunkStart: 0,
      chunkEnd: caseItem.sceneText.length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: null,
      sceneMemory: null,
      neighboringSentences: Object.freeze([]),
      analysisPromptContext: null,
      promptLexiconTerms: Object.freeze([]),
      analysisSignatureContext: null,
      diagnosticsEnabled: false,
    }),
  });
}

function buildExecutionSummary(input: Readonly<{
  request: AnalysisJobContext["request"];
  analysisResult: AnalysisResult;
  runtimeMs: number;
  traceDocument: SceneAnalysisTraceDocument | null;
}>): BenchmarkEngineMetrics {
  const promptTokenEstimate = estimateTokens([
    input.request.chunkText,
    JSON.stringify(input.traceDocument ?? input.analysisResult.truthLayerMeta),
  ].join("\n"));
  const completionTokenEstimate = estimateTokens([
    JSON.stringify(input.analysisResult.findings),
    JSON.stringify(input.analysisResult.analysisResponse),
  ].join("\n"));
  const estimatedCostUsd = Number(((promptTokenEstimate * 0.00001) + (completionTokenEstimate * 0.00003)).toFixed(6));

  return Object.freeze({
    runtimeMs: input.runtimeMs,
    promptTokenEstimate,
    completionTokenEstimate,
    estimatedCostUsd,
  });
}

function aggregateExecutionMetrics(comparisons: readonly BenchmarkEngineComparison[]): BenchmarkEngineMetrics {
  if (comparisons.length === 0) {
    return Object.freeze({
      runtimeMs: 0,
      promptTokenEstimate: 0,
      completionTokenEstimate: 0,
      estimatedCostUsd: 0,
    });
  }

  const runtimeMs = Math.round(comparisons.reduce((sum, comparison) => sum + comparison.execution.runtimeMs, 0) / comparisons.length);
  const promptTokenEstimate = Math.round(comparisons.reduce((sum, comparison) => sum + (comparison.execution.promptTokenEstimate ?? 0), 0) / comparisons.length);
  const completionTokenEstimate = Math.round(comparisons.reduce((sum, comparison) => sum + (comparison.execution.completionTokenEstimate ?? 0), 0) / comparisons.length);
  const estimatedCostUsd = Number((comparisons.reduce((sum, comparison) => sum + (comparison.execution.estimatedCostUsd ?? 0), 0) / comparisons.length).toFixed(6));

  return Object.freeze({
    runtimeMs,
    promptTokenEstimate,
    completionTokenEstimate,
    estimatedCostUsd,
  });
}

function aggregateMetrics(comparisons: readonly BenchmarkEngineComparison[]): BenchmarkMetrics {
  const totalActualFindings = comparisons.reduce((sum, comparison) => sum + comparison.actualFindings.length, 0);
  const totalExpectedFindings = comparisons.reduce((sum, comparison) => sum + comparison.findingComparisons.length, 0);
  const matchedFindings = comparisons.reduce((sum, comparison) => sum + comparison.findingComparisons.filter((finding) => finding.matches.evidence && finding.matches.evidenceSpan && finding.matches.concept && finding.matches.gcamArticle && finding.matches.explanation && finding.matches.action).length, 0);
  const evidenceMatches = comparisons.reduce((sum, comparison) => sum + comparison.findingComparisons.filter((finding) => finding.matches.evidence).length, 0);
  const evidenceSpanMatches = comparisons.reduce((sum, comparison) => sum + comparison.findingComparisons.filter((finding) => finding.matches.evidenceSpan).length, 0);
  const conceptMatches = comparisons.reduce((sum, comparison) => sum + comparison.findingComparisons.filter((finding) => finding.matches.concept).length, 0);
  const gcamArticleMatches = comparisons.reduce((sum, comparison) => sum + comparison.findingComparisons.filter((finding) => finding.matches.gcamArticle).length, 0);
  const explanationMatches = comparisons.reduce((sum, comparison) => sum + comparison.findingComparisons.filter((finding) => finding.matches.explanation).length, 0);
  const duplicateFindingCount = comparisons.reduce((sum, comparison) => sum + comparison.duplicateFindingCount, 0);
  const hallucinationCount = comparisons.reduce((sum, comparison) => sum + comparison.hallucinationCount, 0);

  return createBenchmarkMetrics({
    totalActualFindings,
    totalExpectedFindings,
    matchedFindings,
    evidenceMatches,
    evidenceSpanMatches,
    conceptMatches,
    gcamArticleMatches,
    explanationMatches,
    duplicateFindingCount,
    hallucinationCount,
  });
}

function createFallbackTraceDocument(caseItem: BenchmarkScreenplay): SceneAnalysisTraceDocument {
  return Object.freeze({
    sceneId: caseItem.sceneId,
    sceneSummary: caseItem.expectedSceneSummary ?? caseItem.sceneText,
    evidence: [],
    evidenceCollection: null,
    conceptCollection: null,
    legalDecisionCollection: null,
    explanationCollection: null,
    verifiedFindingCollection: null,
    decisionProvenanceCollection: null,
    concepts: [],
    knowledgeDomains: [],
    candidateArticles: [],
    rankedArticles: [],
    selectedArticle: null,
    semanticSceneModel: null,
    semanticSceneResponse: null,
    findingTruth: null,
    verificationTrail: Object.freeze([]),
    explanation: null,
    judgeResult: null,
    verificationSummary: null,
    timing: Object.freeze({
      totalMs: 0,
      nodeTimings: Object.freeze([]),
    }),
    nodeExecutionOrder: Object.freeze([]),
    steps: Object.freeze([]),
  }) as SceneAnalysisTraceDocument;
}

async function runBenchmarkEngine(
  engineName: BenchmarkEngineName,
  engine: AnalysisEngine,
  caseItem: BenchmarkScreenplay,
  benchmarkId: string,
): Promise<BenchmarkEngineComparison> {
  const jobContext = buildEngineRequest(caseItem, benchmarkId, engineName);
  const startedAt = Date.now();
  const analysisResult = await engine.execute(jobContext);
  const runtimeMs = Date.now() - startedAt;
  const traceDocument = extractTraceDocument(analysisResult);
  const execution = buildExecutionSummary({
    request: jobContext.request,
    analysisResult,
    runtimeMs,
    traceDocument,
  });

  return compareBenchmarkEngineResult({
    caseItem,
    engine: engineName,
    analysisResult,
    traceDocument,
    runtimeMs: execution.runtimeMs,
    promptTokenEstimate: execution.promptTokenEstimate,
    completionTokenEstimate: execution.completionTokenEstimate,
    estimatedCostUsd: execution.estimatedCostUsd,
  });
}

export async function runSceneAnalysisBenchmark(
  cases: readonly BenchmarkScreenplay[],
  options: BenchmarkRunnerOptions = {},
): Promise<BenchmarkReport> {
  const benchmarkId = benchmarkSignature(cases);
  const v3Engine = options.engines?.v3 ?? (await import("../../analysisEngine/analysisEngineV3Adapter.js")).createAnalysisEngineV3Adapter();
  const v4Engine = options.engines?.v4 ?? (await import("../../analysisEngine/analysisEngineV4Adapter.js")).createAnalysisEngineV4Adapter();
  const engineMap: Readonly<Record<BenchmarkEngineName, AnalysisEngine>> = Object.freeze({
    v3: v3Engine,
    v4: v4Engine,
  });

  const caseResults: BenchmarkCaseResult[] = [];
  const engineComparisonsByEngine: Record<BenchmarkEngineName, BenchmarkEngineComparison[]> = {
    v3: [],
    v4: [],
  };

  for (const caseItem of cases) {
    const engineComparisons: BenchmarkEngineComparison[] = [];
    for (const engineName of ["v3", "v4"] as const) {
      const comparison = await runBenchmarkEngine(engineName, engineMap[engineName], caseItem, benchmarkId);
      engineComparisons.push(comparison);
      engineComparisonsByEngine[engineName].push(comparison);
    }

    const preferredComparison = engineComparisons.find((comparison) => comparison.engine === "v4")
      ?? engineComparisons[0]
      ?? null;
    const traceDocument = preferredComparison?.traceDocument ?? createFallbackTraceDocument(caseItem);
    caseResults.push(buildBenchmarkCaseResult({
      caseItem,
      engineComparisons,
      traceDocument,
    }));
  }

  const preferredComparisons = caseResults.map((result) => {
    const comparison = result.engineComparisons.find((item) => item.engine === "v4") ?? result.engineComparisons[0] ?? null;
    return comparison;
  }).filter((comparison): comparison is BenchmarkEngineComparison => comparison !== null);

  const stageScores = Object.freeze({
    scene_understanding: mergeStageScores(caseResults.map((result) => result.sceneUnderstandingScore)),
    evidence_extraction: mergeStageScores(caseResults.map((result) => result.evidenceExtractionScore)),
    concept_classification: mergeStageScores(caseResults.map((result) => result.conceptClassificationScore)),
    legal_mapping: mergeStageScores(caseResults.map((result) => result.legalMappingScore)),
    explanation: mergeStageScores(caseResults.map((result) => result.explanationScore)),
    judge: mergeStageScores(caseResults.map((result) => result.judgeScore)),
  });

  const engineMetrics = Object.freeze({
    v3: aggregateMetrics(engineComparisonsByEngine.v3),
    v4: aggregateMetrics(engineComparisonsByEngine.v4),
  });

  const engineExecution = Object.freeze({
    v3: aggregateExecutionMetrics(engineComparisonsByEngine.v3),
    v4: aggregateExecutionMetrics(engineComparisonsByEngine.v4),
  });

  const falsePositives = preferredComparisons.flatMap((comparison) => comparison.falsePositives);
  const falseNegatives = preferredComparisons.flatMap((comparison) => comparison.falseNegatives);
  const incorrectEvidence = preferredComparisons.flatMap((comparison) => comparison.incorrectEvidence);
  const incorrectArticleMappings = preferredComparisons.flatMap((comparison) => comparison.incorrectArticleMappings);
  const hallucinatedExplanations = preferredComparisons.flatMap((comparison) => comparison.hallucinatedExplanations);
  const metrics = aggregateMetrics(preferredComparisons);

  const report: BenchmarkReport = createBenchmarkReport({
    benchmarkId,
    cases: Object.freeze(caseResults),
    engineComparisons: Object.freeze({
      v3: Object.freeze([...engineComparisonsByEngine.v3]),
      v4: Object.freeze([...engineComparisonsByEngine.v4]),
    }),
    engineExecution,
    stageScores,
    engineMetrics,
    metrics,
    perStageFailures: Object.freeze({
      scene_understanding: Object.freeze(caseResults.flatMap((result) => {
        if (result.sceneUnderstandingScore.score === 1) {
          return [];
        }
        return [Object.freeze({
          stage: "scene_understanding" as const,
          findingId: `${result.screenplayId}:scene`,
          code: "scene_summary_mismatch",
          message: "Scene understanding output does not match the expected scene summary.",
          expected: result.sceneSummary,
          actual: result.sceneSummary,
        })];
      })),
      evidence_extraction: Object.freeze(caseResults.flatMap((result) => result.findingComparisons.flatMap((comparison) => comparison.failures.filter((failure) => failure.stage === "evidence_extraction")))),
      concept_classification: Object.freeze(caseResults.flatMap((result) => result.findingComparisons.flatMap((comparison) => comparison.failures.filter((failure) => failure.stage === "concept_classification")))),
      legal_mapping: Object.freeze(caseResults.flatMap((result) => result.findingComparisons.flatMap((comparison) => comparison.failures.filter((failure) => failure.stage === "legal_mapping")))),
      explanation: Object.freeze(caseResults.flatMap((result) => result.findingComparisons.flatMap((comparison) => comparison.failures.filter((failure) => failure.stage === "explanation")))),
      judge: Object.freeze(caseResults.flatMap((result) => result.findingComparisons.flatMap((comparison) => comparison.failures.filter((failure) => failure.stage === "judge")))),
    }),
    falsePositives: Object.freeze(falsePositives),
    falseNegatives: Object.freeze(falseNegatives),
    incorrectEvidence: Object.freeze(incorrectEvidence),
    incorrectArticleMappings: Object.freeze(incorrectArticleMappings),
    hallucinatedExplanations: Object.freeze(hallucinatedExplanations),
    markdown: "",
  });

  const markdown = renderBenchmarkReportMarkdown(report);
  const finalReport = createBenchmarkReport({
    ...report,
    markdown,
  });

  await persistBenchmarkReport(finalReport, {
    markdownPath: options.markdownPath ?? options.persistence?.markdownPath ?? null,
    reportPath: options.reportPath ?? options.persistence?.reportPath ?? null,
    tracePath: options.tracePath ?? options.persistence?.tracePath ?? null,
  });

  return finalReport;
}
