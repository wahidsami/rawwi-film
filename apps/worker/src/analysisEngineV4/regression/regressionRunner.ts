import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { AnalysisEngine, AnalysisJobContext, AnalysisResult } from "../../analysisEngine/types.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import { createAnalysisEngineV4Adapter } from "../../analysisEngine/analysisEngineV4Adapter.js";
import { compareRegressionCase } from "./regressionComparator.js";
import { getGoldenRegressionDataset, type RegressionScreenplay } from "./goldenDataset.js";
import { buildRegressionMetrics, createRegressionReport, renderRegressionReportMarkdown, type RegressionCaseResult, type RegressionReport } from "./regressionReport.js";

export type RegressionRunnerOptions = Readonly<{
  engine?: AnalysisEngine;
  markdownPath?: string | null;
  dataset?: readonly RegressionScreenplay[];
}>;

function regressionSignature(cases: readonly RegressionScreenplay[]): string {
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

function buildJobContext(caseItem: RegressionScreenplay, regressionId: string): AnalysisJobContext {
  return Object.freeze({
    request: Object.freeze({
      jobId: `${regressionId}:${caseItem.screenplayId}`,
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

function buildMarkdownPath(pathname: string | null | undefined, content: string): Promise<string | null> {
  if (!pathname) {
    return Promise.resolve(null);
  }
  const resolved = resolve(pathname);
  return mkdir(dirname(resolved), { recursive: true }).then(() => writeFile(resolved, content, "utf8")).then(() => resolved);
}

function buildExecutionSummary(input: Readonly<{
  request: AnalysisJobContext["request"];
  analysisResult: AnalysisResult;
  runtimeMs: number;
  traceDocument: SceneAnalysisTraceDocument | null;
}>): Readonly<{
  promptTokenEstimate: number;
  completionTokenEstimate: number;
  estimatedCostUsd: number;
}> {
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
    promptTokenEstimate,
    completionTokenEstimate,
    estimatedCostUsd,
  });
}

function aggregateScores(cases: readonly RegressionCaseResult[]): Readonly<{
  totalCases: number;
  passedCases: number;
  failedCases: number;
  expectedScore: number;
  actualScore: number;
  scoreDelta: number;
}> {
  const totalCases = cases.length;
  const passedCases = cases.filter((item) => item.passed).length;
  const failedCases = totalCases - passedCases;
  const expectedScore = totalCases === 0 ? 1 : Number((cases.reduce((sum, item) => sum + item.expectedScore, 0) / totalCases).toFixed(6));
  const actualScore = totalCases === 0 ? 1 : Number((cases.reduce((sum, item) => sum + item.actualScore, 0) / totalCases).toFixed(6));
  const scoreDelta = Number((actualScore - expectedScore).toFixed(6));
  return Object.freeze({
    totalCases,
    passedCases,
    failedCases,
    expectedScore,
    actualScore,
    scoreDelta,
  });
}

export async function runRegressionSuite(
  cases: readonly RegressionScreenplay[] = getGoldenRegressionDataset(),
  options: RegressionRunnerOptions = {},
): Promise<RegressionReport> {
  const regressionId = regressionSignature(cases);
  const engine = options.engine ?? createAnalysisEngineV4Adapter();
  const caseResults: RegressionCaseResult[] = [];

  for (const caseItem of cases) {
    const jobContext = buildJobContext(caseItem, regressionId);
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

    caseResults.push(compareRegressionCase({
      caseItem,
      engine: "v4",
      analysisResult,
      traceDocument,
      runtimeMs,
      promptTokenEstimate: execution.promptTokenEstimate,
      completionTokenEstimate: execution.completionTokenEstimate,
      estimatedCostUsd: execution.estimatedCostUsd,
    }));
  }

  const metrics = buildRegressionMetrics({ cases: caseResults });
  const failures = Object.freeze(caseResults.flatMap((item) => item.findingComparisons.flatMap((comparison) => comparison.failures)));
  const report = createRegressionReport({
    regressionId,
    cases: Object.freeze(caseResults),
    failures,
    metrics,
    markdown: "",
  });
  const markdown = renderRegressionReportMarkdown(report);
  const finalReport = createRegressionReport({
    ...report,
    markdown,
  });

  await buildMarkdownPath(options.markdownPath ?? null, markdown);

  return finalReport;
}

