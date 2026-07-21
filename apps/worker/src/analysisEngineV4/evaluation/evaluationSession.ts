import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { AnalysisEngine, AnalysisJobContext, AnalysisResult } from "../../analysisEngine/types.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import { compareBenchmarkEngineResult } from "../benchmark/benchmarkComparator.js";
import type { BenchmarkEngineComparison, BenchmarkScreenplay } from "../benchmark/benchmarkTypes.js";
import { scoreReview, averageReviewScore, type ReviewScore } from "./reviewScoring.js";
import { computeCohenKappa, averageKappa } from "./interRaterAgreement.js";
import { createEvaluationReport, renderEvaluationReportMarkdown, type BlindAssignment, type EvaluationCaseResult, type EvaluationReport, type EvaluationParticipantRole } from "./evaluationReport.js";

export type HumanEvaluationSessionOptions = Readonly<{
  engines?: Readonly<Partial<Record<"v3" | "v4", AnalysisEngine>>>;
  markdownPath?: string | null;
}>;

function fingerprint(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractTraceDocument(result: AnalysisResult): SceneAnalysisTraceDocument | null {
  const trace = result.truthLayerMeta.scene_analysis_trace;
  if (!trace || typeof trace !== "object") return null;
  return trace as SceneAnalysisTraceDocument;
}

function buildJobContext(caseItem: BenchmarkScreenplay, sessionId: string): AnalysisJobContext {
  return Object.freeze({
    request: Object.freeze({
      jobId: `${sessionId}:${caseItem.screenplayId}`,
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

function createBlindLabels(sessionId: string, screenplayId: string): BlindAssignment {
  const candidates = ["Sample A", "Sample B", "Sample C"] as const;
  const roles: readonly EvaluationParticipantRole[] = ["human", "v3", "v4"];
  const ordering = [...roles].sort((left, right) => {
    const leftScore = fingerprint({ sessionId, screenplayId, role: left });
    const rightScore = fingerprint({ sessionId, screenplayId, role: right });
    return leftScore.localeCompare(rightScore);
  });
  const assignment: Partial<Record<EvaluationParticipantRole, string>> = {};
  for (const [index, role] of ordering.entries()) {
    assignment[role] = candidates[index] ?? `Sample ${String.fromCharCode(65 + index)}`;
  }
  return Object.freeze({
    human: assignment.human ?? "Sample A",
    v3: assignment.v3 ?? "Sample B",
    v4: assignment.v4 ?? "Sample C",
  });
}

function projectFinding(finding: BenchmarkScreenplay["expectedFindings"][number]) {
  return {
    findingId: finding.findingId,
    evidence: {
      text: finding.expectedEvidence.text,
      startOffset: finding.expectedEvidence.startOffset,
      endOffset: finding.expectedEvidence.endOffset,
      lineId: finding.expectedEvidence.lineId,
      pageNumber: finding.expectedEvidence.pageNumber,
    },
    conceptId: finding.expectedConceptId,
    conceptLabel: finding.expectedConceptId,
    knowledgeDomain: finding.expectedConceptId,
    gcamArticleId: finding.expectedGcamArticleId,
    gcamArticleTitleAr: "",
    explanation: finding.expectedExplanation,
    action: finding.expectedAction,
  };
}

function buildExecutionSummary(request: AnalysisJobContext["request"], analysisResult: AnalysisResult, traceDocument: SceneAnalysisTraceDocument | null): Readonly<{
  runtimeMs: number;
  promptTokenEstimate: number;
  completionTokenEstimate: number;
  estimatedCostUsd: number;
}> {
  const promptTokenEstimate = estimateTokens([
    request.chunkText,
    JSON.stringify(traceDocument ?? analysisResult.truthLayerMeta),
  ].join("\n"));
  const completionTokenEstimate = estimateTokens([
    JSON.stringify(analysisResult.findings),
    JSON.stringify(analysisResult.analysisResponse),
  ].join("\n"));
  const estimatedCostUsd = Number(((promptTokenEstimate * 0.00001) + (completionTokenEstimate * 0.00003)).toFixed(6));
  return Object.freeze({
    runtimeMs: 0,
    promptTokenEstimate,
    completionTokenEstimate,
    estimatedCostUsd,
  });
}

async function writeMarkdown(pathname: string | null | undefined, content: string): Promise<string | null> {
  if (!pathname) return null;
  const resolved = resolve(pathname);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, "utf8");
  return resolved;
}

function buildComparison(
  caseItem: BenchmarkScreenplay,
  engine: "v3" | "v4",
  analysisResult: AnalysisResult,
  traceDocument: SceneAnalysisTraceDocument | null,
  runtimeMs: number,
  promptTokenEstimate: number,
  completionTokenEstimate: number,
  estimatedCostUsd: number,
): BenchmarkEngineComparison {
  return compareBenchmarkEngineResult({
    caseItem,
    engine,
    analysisResult,
    traceDocument,
    runtimeMs,
    promptTokenEstimate,
    completionTokenEstimate,
    estimatedCostUsd,
  });
}

export async function runHumanEvaluationSession(
  cases: readonly BenchmarkScreenplay[],
  options: HumanEvaluationSessionOptions = {},
): Promise<EvaluationReport> {
  const sessionId = fingerprint(cases);
  const v3Engine = options.engines?.v3 ?? (await import("../../analysisEngine/analysisEngineV3Adapter.js")).createAnalysisEngineV3Adapter();
  const v4Engine = options.engines?.v4 ?? (await import("../../analysisEngine/analysisEngineV4Adapter.js")).createAnalysisEngineV4Adapter();
  const caseResults: EvaluationCaseResult[] = [];
  const participantScores: ReviewScore[] = [];
  const v3Scores: ReviewScore[] = [];
  const v4Scores: ReviewScore[] = [];
  const humanKappas = [];

  for (const caseItem of cases) {
    const blindAssignment = createBlindLabels(sessionId, caseItem.screenplayId);
    const jobContext = buildJobContext(caseItem, sessionId);

    const v3Result = await v3Engine.execute(jobContext);
    const v3TraceDocument = extractTraceDocument(v3Result);
    const v3Execution = buildExecutionSummary(jobContext.request, v3Result, v3TraceDocument);
    const v3Comparison = buildComparison(caseItem, "v3", v3Result, v3TraceDocument, 0, v3Execution.promptTokenEstimate, v3Execution.completionTokenEstimate, v3Execution.estimatedCostUsd);

    const v4Result = await v4Engine.execute(jobContext);
    const v4TraceDocument = extractTraceDocument(v4Result);
    const v4Execution = buildExecutionSummary(jobContext.request, v4Result, v4TraceDocument);
    const v4Comparison = buildComparison(caseItem, "v4", v4Result, v4TraceDocument, 0, v4Execution.promptTokenEstimate, v4Execution.completionTokenEstimate, v4Execution.estimatedCostUsd);

    const humanScore = scoreReview(caseItem.expectedFindings, caseItem.expectedFindings.map((finding) => projectFinding(finding)));
    const v3Score = scoreReview(caseItem.expectedFindings, v3Comparison.actualFindings);
    const v4Score = scoreReview(caseItem.expectedFindings, v4Comparison.actualFindings);
    const humanVsV3 = computeCohenKappa(caseItem.expectedFindings, v3Comparison.actualFindings);
    const humanVsV4 = computeCohenKappa(caseItem.expectedFindings, v4Comparison.actualFindings);
    const v3VsV4 = computeCohenKappa(
      v3Comparison.actualFindings.map((finding) => ({
        findingId: finding.findingId,
        expectedEvidence: {
          text: finding.evidence.text,
          startOffset: finding.evidence.startOffset,
          endOffset: finding.evidence.endOffset,
          lineId: finding.evidence.lineId,
          pageNumber: finding.evidence.pageNumber,
        },
        expectedConceptId: finding.conceptId ?? "",
        expectedGcamArticleId: finding.gcamArticleId ?? -1,
        expectedExplanation: finding.explanation,
        expectedAction: finding.action,
      })),
      v4Comparison.actualFindings,
    );

    participantScores.push(humanScore);
    v3Scores.push(v3Score);
    v4Scores.push(v4Score);
    humanKappas.push(humanVsV3, humanVsV4, v3VsV4);

    caseResults.push(Object.freeze({
      screenplayId: caseItem.screenplayId,
      sceneId: caseItem.sceneId,
      sceneSummary: caseItem.expectedSceneSummary ?? caseItem.sceneText,
      blindAssignment,
      humanFindings: Object.freeze([...caseItem.expectedFindings]),
      humanScore,
      v3Comparison,
      v4Comparison,
      v3Score,
      v4Score,
      pairwiseAgreement: Object.freeze({
        humanVsV3,
        humanVsV4,
        v3VsV4,
      }),
    }));
  }

  const participantScoresByRole = Object.freeze({
    human: averageReviewScore(participantScores),
    v3: averageReviewScore(v3Scores),
    v4: averageReviewScore(v4Scores),
  });
  const pairwiseAgreement = Object.freeze({
    humanVsV3: humanKappas[0] ?? { observedAgreement: 1, expectedAgreement: 1, kappa: 1, totalItems: 0, positiveAgreementCount: 0, negativeAgreementCount: 0, disagreementCount: 0 },
    humanVsV4: humanKappas[1] ?? { observedAgreement: 1, expectedAgreement: 1, kappa: 1, totalItems: 0, positiveAgreementCount: 0, negativeAgreementCount: 0, disagreementCount: 0 },
    v3VsV4: humanKappas[2] ?? { observedAgreement: 1, expectedAgreement: 1, kappa: 1, totalItems: 0, positiveAgreementCount: 0, negativeAgreementCount: 0, disagreementCount: 0 },
  });
  const metrics = Object.freeze({
    precision: Number(((participantScoresByRole.v3.precision + participantScoresByRole.v4.precision) / 2).toFixed(6)),
    recall: Number(((participantScoresByRole.v3.recall + participantScoresByRole.v4.recall) / 2).toFixed(6)),
    f1: Number(((participantScoresByRole.v3.f1 + participantScoresByRole.v4.f1) / 2).toFixed(6)),
    cohenKappa: averageKappa([pairwiseAgreement.humanVsV3, pairwiseAgreement.humanVsV4, pairwiseAgreement.v3VsV4]),
    falsePositiveCount: Math.round((participantScoresByRole.v3.falsePositiveCount + participantScoresByRole.v4.falsePositiveCount) / 2),
    falseNegativeCount: Math.round((participantScoresByRole.v3.falseNegativeCount + participantScoresByRole.v4.falseNegativeCount) / 2),
  });

  const report = createEvaluationReport({
    sessionId,
    blindLabels: Object.freeze(["Sample A", "Sample B", "Sample C"]),
    cases: Object.freeze(caseResults),
    participantScores: participantScoresByRole,
    pairwiseAgreement,
    metrics,
    markdown: "",
  });
  const markdown = renderEvaluationReportMarkdown(report);
  const finalReport = createEvaluationReport({
    ...report,
    markdown,
  });

  await writeMarkdown(options.markdownPath ?? null, markdown);

  return finalReport;
}
