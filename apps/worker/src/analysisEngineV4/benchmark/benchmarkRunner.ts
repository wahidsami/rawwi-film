import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createSceneAnalysisEngine, type SceneAnalysisEngine } from "../sceneAnalysisEngine.js";
import type { SceneAnalysisState, SceneAnalysisEvidenceSpan, SceneAnalysisTrace } from "../sceneAnalysisState.js";
import { buildSceneAnalysisTrace, createSceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import { createBenchmarkMetrics, createStageScore, mergeStageScores } from "./benchmarkMetrics.js";
import { createBenchmarkReport } from "./benchmarkReport.js";
import { renderBenchmarkReportMarkdown } from "./benchmarkRenderer.js";
import type {
  BenchmarkActualFinding,
  BenchmarkCaseResult,
  BenchmarkFindingAction,
  BenchmarkFindingComparison,
  BenchmarkGroundTruthFinding,
  BenchmarkMetrics,
  BenchmarkReport,
  BenchmarkScreenplay,
  BenchmarkStageFailure,
  BenchmarkStageName,
  BenchmarkStageScore,
} from "./benchmarkTypes.js";

export type BenchmarkRunnerOptions = Readonly<{
  engine?: SceneAnalysisEngine;
  markdownPath?: string | null;
  traceFilePath?: string | null;
}>;

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeComparable(value: string): string {
  return normalizeText(value).toLowerCase();
}

function benchmarkSignature(cases: readonly BenchmarkScreenplay[]): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(cases));
  return hash.digest("hex");
}

function createEvidenceSnapshot(evidence: SceneAnalysisEvidenceSpan | null): BenchmarkActualFinding["evidence"] {
  return {
    text: evidence?.text ?? "",
    startOffset: evidence?.startOffset ?? null,
    endOffset: evidence?.endOffset ?? null,
    lineId: evidence?.lineId ?? null,
    pageNumber: evidence?.pageReferences[0]?.pageNumber ?? null,
  };
}

function extractActualFinding(state: SceneAnalysisState, screenplayId: string): BenchmarkActualFinding {
  const primaryEvidence = state.evidenceSpans.find((span) => span.spanId === state.primaryEvidenceSpanId) ?? state.evidenceSpans[0] ?? null;
  const primaryConcept = state.conceptCollection?.concepts[0] ?? state.detectedConcepts[0] ?? null;
  const primaryArticle = state.primaryArticle ?? state.legalPrimaryArticle ?? null;

  return Object.freeze({
    findingId: `${screenplayId}:finding-1`,
    evidence: createEvidenceSnapshot(primaryEvidence),
    conceptId: primaryConcept?.conceptId ?? null,
    conceptLabel: primaryConcept?.label ?? null,
    knowledgeDomain: state.knowledgeDomains[0] ?? null,
    gcamArticleId: primaryArticle?.articleId ?? null,
    gcamArticleTitleAr: primaryArticle?.titleAr ?? null,
    explanation: state.explanation?.summary ?? "",
    action: (state.qualityJudgment?.status ?? "reject") === "pass" ? "accept" : "reject",
  });
}

function scoreTextMatch(actual: string, expected: string): boolean {
  return normalizeComparable(actual) === normalizeComparable(expected);
}

function scoreEvidenceSpanMatch(actual: BenchmarkActualFinding["evidence"], expected: BenchmarkGroundTruthFinding["expectedEvidence"]): boolean {
  return actual.startOffset === expected.startOffset
    && actual.endOffset === expected.endOffset
    && actual.lineId === expected.lineId
    && actual.pageNumber === expected.pageNumber;
}

function compareActualToExpected(
  actual: BenchmarkActualFinding,
  expected: BenchmarkGroundTruthFinding,
): Readonly<{
  score: number;
  matches: Readonly<{
    evidence: boolean;
    evidenceSpan: boolean;
    concept: boolean;
    gcamArticle: boolean;
    explanation: boolean;
    action: boolean;
  }>;
  failures: readonly BenchmarkStageFailure[];
}> {
  const evidence = scoreTextMatch(actual.evidence.text, expected.expectedEvidence.text);
  const evidenceSpan = scoreEvidenceSpanMatch(actual.evidence, expected.expectedEvidence);
  const concept = actual.conceptId === expected.expectedConceptId;
  const gcamArticle = actual.gcamArticleId === expected.expectedGcamArticleId;
  const explanation = normalizeComparable(actual.explanation) === normalizeComparable(expected.expectedExplanation);
  const action = actual.action === expected.expectedAction;

  const failures: BenchmarkStageFailure[] = [];
  if (!evidence) {
    failures.push(Object.freeze({
      stage: "evidence_extraction",
      findingId: expected.findingId,
      code: "evidence_text_mismatch",
      message: "Evidence text does not match the ground truth.",
      expected: expected.expectedEvidence.text,
      actual: actual.evidence.text,
    }));
  }
  if (!evidenceSpan) {
    failures.push(Object.freeze({
      stage: "evidence_extraction",
      findingId: expected.findingId,
      code: "evidence_span_mismatch",
      message: "Evidence span offsets do not match the ground truth.",
      expected: `${expected.expectedEvidence.startOffset ?? "n/a"}..${expected.expectedEvidence.endOffset ?? "n/a"} @ ${expected.expectedEvidence.lineId ?? "n/a"}`,
      actual: `${actual.evidence.startOffset ?? "n/a"}..${actual.evidence.endOffset ?? "n/a"} @ ${actual.evidence.lineId ?? "n/a"}`,
    }));
  }
  if (!concept) {
    failures.push(Object.freeze({
      stage: "concept_classification",
      findingId: expected.findingId,
      code: "concept_mismatch",
      message: "Detected concept does not match the ground truth.",
      expected: expected.expectedConceptId,
      actual: actual.conceptId ?? "n/a",
    }));
  }
  if (!gcamArticle) {
    failures.push(Object.freeze({
      stage: "legal_mapping",
      findingId: expected.findingId,
      code: "article_mismatch",
      message: "Selected GCAM article does not match the ground truth.",
      expected: String(expected.expectedGcamArticleId),
      actual: actual.gcamArticleId == null ? "n/a" : String(actual.gcamArticleId),
    }));
  }
  if (!explanation) {
    failures.push(Object.freeze({
      stage: "explanation",
      findingId: expected.findingId,
      code: "explanation_mismatch",
      message: "Explanation does not match the ground truth.",
      expected: expected.expectedExplanation,
      actual: actual.explanation,
    }));
  }
  if (!action) {
    failures.push(Object.freeze({
      stage: "judge",
      findingId: expected.findingId,
      code: "action_mismatch",
      message: "Judge action does not match the ground truth.",
      expected: expected.expectedAction,
      actual: actual.action,
    }));
  }

  const stageScore = evidence && evidenceSpan && concept && gcamArticle && explanation && action ? 1 : 0;
  return Object.freeze({
    score: stageScore,
    matches: Object.freeze({
      evidence,
      evidenceSpan,
      concept,
      gcamArticle,
      explanation,
      action,
    }),
    failures: Object.freeze(failures),
  });
}

function pickBestMatch(
  actualFindings: readonly BenchmarkActualFinding[],
  expected: BenchmarkGroundTruthFinding,
  usedActualIndexes: Set<number>,
): Readonly<{
  actualIndex: number | null;
  comparison: BenchmarkFindingComparison;
}> {
  let bestIndex: number | null = null;
  let bestScore = -1;
  let bestComparison: BenchmarkFindingComparison | null = null;

  for (const [index, actual] of actualFindings.entries()) {
    if (usedActualIndexes.has(index)) {
      continue;
    }
    const comparison = compareActualToExpected(actual, expected);
    if (comparison.score > bestScore) {
      bestScore = comparison.score;
      bestIndex = index;
      bestComparison = Object.freeze({
        findingId: expected.findingId,
        expected,
        actual,
        matches: comparison.matches,
        failures: comparison.failures,
      });
    }
  }

  if (bestIndex === null || !bestComparison) {
    return Object.freeze({
      actualIndex: null,
      comparison: Object.freeze({
        findingId: expected.findingId,
        expected,
        actual: null,
        matches: Object.freeze({
          evidence: false,
          evidenceSpan: false,
          concept: false,
          gcamArticle: false,
          explanation: false,
          action: false,
        }),
        failures: Object.freeze([Object.freeze({
          stage: "evidence_extraction",
          findingId: expected.findingId,
          code: "missing_actual_finding",
          message: "No actual finding was produced for this ground truth finding.",
          expected: expected.expectedEvidence.text,
          actual: "n/a",
        })]),
      }),
    });
  }

  return Object.freeze({
    actualIndex: bestIndex,
    comparison: bestComparison,
  });
}

function buildCaseStageScore(stage: BenchmarkStageName, comparisons: readonly BenchmarkFindingComparison[], predicate: (comparison: BenchmarkFindingComparison) => boolean): BenchmarkStageScore {
  const total = comparisons.length;
  const passed = comparisons.filter(predicate).length;
  return createStageScore(stage, passed, total);
}

function buildSceneUnderstandingScore(caseItem: BenchmarkScreenplay, state: SceneAnalysisState): BenchmarkStageScore {
  const actualSummary = state.sceneModel?.summary ?? state.normalizedSceneText ?? "";
  const expectedSummary = caseItem.expectedSceneSummary ?? null;
  const passed = expectedSummary == null
    ? Number(actualSummary.length > 0)
    : Number(scoreTextMatch(actualSummary, expectedSummary));
  return createStageScore("scene_understanding", passed, 1);
}

function buildActualFindings(state: SceneAnalysisState, caseItem: BenchmarkScreenplay): readonly BenchmarkActualFinding[] {
  return Object.freeze([extractActualFinding(state, caseItem.screenplayId)]);
}

function buildStageFailures(
  comparisons: readonly BenchmarkFindingComparison[],
  stage: BenchmarkStageName,
  selector: (comparison: BenchmarkFindingComparison) => boolean,
  code: string,
  message: string,
  expected: (comparison: BenchmarkFindingComparison) => string,
  actual: (comparison: BenchmarkFindingComparison) => string,
): readonly BenchmarkStageFailure[] {
  return Object.freeze(
    comparisons
      .filter((comparison) => !selector(comparison))
      .map((comparison) => Object.freeze({
        stage,
        findingId: comparison.findingId,
        code,
        message,
        expected: expected(comparison),
        actual: actual(comparison),
      })),
  );
}

function createMarkdownPath(markdownPath: string): string {
  return resolve(markdownPath);
}

async function persistMarkdown(markdownPath: string, markdown: string): Promise<string> {
  const resolved = createMarkdownPath(markdownPath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, markdown, "utf8");
  return resolved;
}

export async function runSceneAnalysisBenchmark(
  cases: readonly BenchmarkScreenplay[],
  options: BenchmarkRunnerOptions = {},
): Promise<BenchmarkReport> {
  const engine = options.engine ?? createSceneAnalysisEngine();
  const caseResults: BenchmarkCaseResult[] = [];
  const allStageScores = {
    scene_understanding: [] as BenchmarkStageScore[],
    evidence_extraction: [] as BenchmarkStageScore[],
    concept_classification: [] as BenchmarkStageScore[],
    legal_mapping: [] as BenchmarkStageScore[],
    explanation: [] as BenchmarkStageScore[],
    judge: [] as BenchmarkStageScore[],
  };

  for (const caseItem of cases) {
    const state = await engine.run(caseItem.sceneId, caseItem.sceneText);
    const trace = buildSceneAnalysisTrace(state);
    const traceDocument = createSceneAnalysisTraceDocument(trace);
    const actualFindings = buildActualFindings(state, caseItem);
    const usedActualIndexes = new Set<number>();
    const findingComparisons: BenchmarkFindingComparison[] = [];

    for (const expectedFinding of caseItem.expectedFindings) {
      const match = pickBestMatch(actualFindings, expectedFinding, usedActualIndexes);
      if (match.actualIndex !== null) {
        usedActualIndexes.add(match.actualIndex);
      }
      findingComparisons.push(match.comparison);
    }

    const falsePositives = actualFindings.filter((_, index) => !usedActualIndexes.has(index));
    const falseNegatives = caseItem.expectedFindings.filter((expectedFinding) => !findingComparisons.some((comparison) => comparison.findingId === expectedFinding.findingId && comparison.actual !== null));
    const duplicateFindingCount = Math.max(0, actualFindings.length - new Set(actualFindings.map((finding) => `${normalizeComparable(finding.evidence.text)}|${finding.gcamArticleId ?? "n/a"}|${finding.conceptId ?? "n/a"}`)).size);
    const hallucinatedCount = Math.max(0, actualFindings.length - usedActualIndexes.size);

    const sceneUnderstandingScore = buildSceneUnderstandingScore(caseItem, state);
    const evidenceExtractionScore = createStageScore("evidence_extraction", findingComparisons.filter((comparison) => comparison.matches.evidence && comparison.matches.evidenceSpan).length, Math.max(1, caseItem.expectedFindings.length));
    const conceptClassificationScore = createStageScore("concept_classification", findingComparisons.filter((comparison) => comparison.matches.concept).length, Math.max(1, caseItem.expectedFindings.length));
    const legalMappingScore = createStageScore("legal_mapping", findingComparisons.filter((comparison) => comparison.matches.gcamArticle).length, Math.max(1, caseItem.expectedFindings.length));
    const explanationScore = createStageScore("explanation", findingComparisons.filter((comparison) => comparison.matches.explanation).length, Math.max(1, caseItem.expectedFindings.length));
    const judgeScore = createStageScore("judge", findingComparisons.filter((comparison) => comparison.matches.action).length, Math.max(1, caseItem.expectedFindings.length));

    allStageScores.scene_understanding.push(sceneUnderstandingScore);
    allStageScores.evidence_extraction.push(evidenceExtractionScore);
    allStageScores.concept_classification.push(conceptClassificationScore);
    allStageScores.legal_mapping.push(legalMappingScore);
    allStageScores.explanation.push(explanationScore);
    allStageScores.judge.push(judgeScore);

    const incorrectEvidence = findingComparisons.filter((comparison) => !comparison.matches.evidence || !comparison.matches.evidenceSpan);
    const incorrectArticleMappings = findingComparisons.filter((comparison) => !comparison.matches.gcamArticle);
    const hallucinatedExplanations = findingComparisons.filter((comparison) => !comparison.matches.explanation || !comparison.matches.action);

    caseResults.push(Object.freeze({
      screenplayId: caseItem.screenplayId,
      sceneId: caseItem.sceneId,
      sceneSummary: state.sceneModel?.summary ?? state.normalizedSceneText ?? "",
      sceneUnderstandingScore,
      evidenceExtractionScore,
      conceptClassificationScore,
      legalMappingScore,
      explanationScore,
      judgeScore,
      findingComparisons: Object.freeze(findingComparisons),
      actualFindings,
      falsePositives: Object.freeze(falsePositives),
      falseNegatives: Object.freeze(falseNegatives),
      incorrectEvidence: Object.freeze(incorrectEvidence),
      incorrectArticleMappings: Object.freeze(incorrectArticleMappings),
      hallucinatedExplanations: Object.freeze(hallucinatedExplanations),
      duplicateFindingCount,
      hallucinationCount: hallucinatedCount,
      traceDocument,
    }));
  }

  const stageScores = Object.freeze({
    scene_understanding: mergeStageScores(allStageScores.scene_understanding),
    evidence_extraction: mergeStageScores(allStageScores.evidence_extraction),
    concept_classification: mergeStageScores(allStageScores.concept_classification),
    legal_mapping: mergeStageScores(allStageScores.legal_mapping),
    explanation: mergeStageScores(allStageScores.explanation),
    judge: mergeStageScores(allStageScores.judge),
  });

  const falsePositives = caseResults.flatMap((result) => result.falsePositives);
  const falseNegatives = caseResults.flatMap((result) => result.falseNegatives);
  const incorrectEvidence = caseResults.flatMap((result) => result.incorrectEvidence);
  const incorrectArticleMappings = caseResults.flatMap((result) => result.incorrectArticleMappings);
  const hallucinatedExplanations = caseResults.flatMap((result) => result.hallucinatedExplanations);
  const totalActualFindings = caseResults.reduce((sum, result) => sum + result.actualFindings.length, 0);
  const totalExpectedFindings = caseResults.reduce((sum, result) => sum + result.findingComparisons.length, 0);
  const matchedFindings = caseResults.reduce((sum, result) => sum + result.findingComparisons.filter((comparison) => comparison.matches.evidence && comparison.matches.evidenceSpan && comparison.matches.concept && comparison.matches.gcamArticle && comparison.matches.explanation && comparison.matches.action).length, 0);
  const evidenceMatches = caseResults.reduce((sum, result) => sum + result.findingComparisons.filter((comparison) => comparison.matches.evidence).length, 0);
  const evidenceSpanMatches = caseResults.reduce((sum, result) => sum + result.findingComparisons.filter((comparison) => comparison.matches.evidenceSpan).length, 0);
  const conceptMatches = caseResults.reduce((sum, result) => sum + result.findingComparisons.filter((comparison) => comparison.matches.concept).length, 0);
  const gcamArticleMatches = caseResults.reduce((sum, result) => sum + result.findingComparisons.filter((comparison) => comparison.matches.gcamArticle).length, 0);
  const explanationMatches = caseResults.reduce((sum, result) => sum + result.findingComparisons.filter((comparison) => comparison.matches.explanation).length, 0);
  const duplicateFindingCount = caseResults.reduce((sum, result) => sum + result.duplicateFindingCount, 0);
  const hallucinationCount = caseResults.reduce((sum, result) => sum + result.hallucinationCount, 0);

  const metrics: BenchmarkMetrics = createBenchmarkMetrics({
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

  const reportId = benchmarkSignature(cases);
  const report: BenchmarkReport = createBenchmarkReport({
    benchmarkId: reportId,
    cases: Object.freeze(caseResults),
    stageScores,
    metrics,
    perStageFailures: Object.freeze({
      scene_understanding: Object.freeze(caseResults.flatMap((result) => {
        const expected = result.sceneUnderstandingScore.total > 0 ? result.sceneUnderstandingScore : null;
        if (expected && expected.score === 1) {
          return [];
        }
        return [Object.freeze({
          stage: "scene_understanding" as const,
          findingId: `${result.screenplayId}:scene`,
          code: "scene_summary_mismatch",
          message: "Scene understanding output does not match the expected scene summary.",
          expected: "scene summary matched",
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

  if (options.markdownPath) {
    const resolved = resolve(options.markdownPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, markdown, "utf8");
  }

  if (options.traceFilePath) {
    const resolved = resolve(options.traceFilePath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, JSON.stringify(finalReport, null, 2), "utf8");
  }

  return finalReport;
}
