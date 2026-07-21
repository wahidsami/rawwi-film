import type { AnalysisResult } from "../../analysisEngine/types.js";
import type { BenchmarkEngineName, BenchmarkEngineComparison, BenchmarkFindingComparison, BenchmarkStageFailure, BenchmarkScreenplay } from "../benchmark/benchmarkTypes.js";
import { compareBenchmarkEngineResult } from "../benchmark/benchmarkComparator.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import type { RegressionCaseResult } from "./regressionReport.js";
import type { RegressionScreenplay } from "./goldenDataset.js";

export type RegressionComparisonInput = Readonly<{
  caseItem: RegressionScreenplay;
  engine: BenchmarkEngineName;
  analysisResult: AnalysisResult;
  traceDocument: SceneAnalysisTraceDocument | null;
  runtimeMs: number;
  promptTokenEstimate: number | null;
  completionTokenEstimate: number | null;
  estimatedCostUsd: number | null;
}>;

function toFailures(comparisons: readonly BenchmarkFindingComparison[]): readonly BenchmarkStageFailure[] {
  return Object.freeze(comparisons.flatMap((comparison) => comparison.failures));
}

export function compareRegressionCase(input: RegressionComparisonInput): RegressionCaseResult {
  const benchmarkComparison: BenchmarkEngineComparison = compareBenchmarkEngineResult({
    caseItem: input.caseItem as unknown as BenchmarkScreenplay,
    engine: input.engine,
    analysisResult: input.analysisResult,
    traceDocument: input.traceDocument,
    runtimeMs: input.runtimeMs,
    promptTokenEstimate: input.promptTokenEstimate,
    completionTokenEstimate: input.completionTokenEstimate,
    estimatedCostUsd: input.estimatedCostUsd,
  } as unknown as Parameters<typeof compareBenchmarkEngineResult>[0]);
  const actualScore = benchmarkComparison.metrics.overallReviewScore;
  return Object.freeze({
    screenplayId: input.caseItem.screenplayId,
    sceneId: input.caseItem.sceneId,
    sceneSummary: input.caseItem.expectedSceneSummary ?? input.caseItem.sceneText,
    expectedScore: input.caseItem.expectedScore,
    actualScore,
    scoreDelta: Number((actualScore - input.caseItem.expectedScore).toFixed(6)),
    passed: Math.abs(actualScore - input.caseItem.expectedScore) < 0.000001,
    humanFindings: Object.freeze([...input.caseItem.expectedFindings]),
    findingComparisons: benchmarkComparison.findingComparisons,
    actualFindings: benchmarkComparison.actualFindings,
    falsePositives: benchmarkComparison.falsePositives,
    falseNegatives: benchmarkComparison.falseNegatives,
    incorrectEvidence: benchmarkComparison.incorrectEvidence,
    incorrectArticleMappings: benchmarkComparison.incorrectArticleMappings,
    hallucinatedExplanations: benchmarkComparison.hallucinatedExplanations,
    duplicateFindingCount: benchmarkComparison.duplicateFindingCount,
    hallucinationCount: benchmarkComparison.hallucinationCount,
    traceDocument: input.traceDocument,
  });
}

export function collectRegressionFailures(cases: readonly RegressionCaseResult[]): readonly BenchmarkStageFailure[] {
  return Object.freeze(cases.flatMap((item) => toFailures(item.findingComparisons)));
}
