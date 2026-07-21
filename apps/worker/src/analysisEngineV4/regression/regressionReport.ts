import type { BenchmarkActualFinding, BenchmarkFindingComparison, BenchmarkGroundTruthFinding, BenchmarkStageFailure } from "../benchmark/benchmarkTypes.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";

export type RegressionMetrics = Readonly<{
  totalCases: number;
  passedCases: number;
  failedCases: number;
  expectedScore: number;
  actualScore: number;
  scoreDelta: number;
  findingPrecision: number;
  findingRecall: number;
  evidenceAccuracy: number;
  evidenceSpanAccuracy: number;
  conceptAccuracy: number;
  gcamArticleAccuracy: number;
  explanationAccuracy: number;
  duplicateFindingRate: number;
  hallucinationRate: number;
}>;

export type RegressionCaseResult = Readonly<{
  screenplayId: string;
  sceneId: string;
  sceneSummary: string;
  expectedScore: number;
  actualScore: number;
  scoreDelta: number;
  passed: boolean;
  humanFindings: readonly BenchmarkGroundTruthFinding[];
  findingComparisons: readonly BenchmarkFindingComparison[];
  actualFindings: readonly BenchmarkActualFinding[];
  falsePositives: readonly BenchmarkActualFinding[];
  falseNegatives: readonly BenchmarkGroundTruthFinding[];
  incorrectEvidence: readonly BenchmarkFindingComparison[];
  incorrectArticleMappings: readonly BenchmarkFindingComparison[];
  hallucinatedExplanations: readonly BenchmarkFindingComparison[];
  duplicateFindingCount: number;
  hallucinationCount: number;
  traceDocument: SceneAnalysisTraceDocument | null;
}>;

export type RegressionReport = Readonly<{
  regressionId: string;
  cases: readonly RegressionCaseResult[];
  failures: readonly BenchmarkStageFailure[];
  metrics: RegressionMetrics;
  markdown: string;
}>;

function ratio(passed: number, total: number): number {
  if (total <= 0) return 1;
  return Number((passed / total).toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 1;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function freezeCases(cases: readonly RegressionCaseResult[]): readonly RegressionCaseResult[] {
  return Object.freeze([...cases]);
}

function freezeFailures(failures: readonly BenchmarkStageFailure[]): readonly BenchmarkStageFailure[] {
  return Object.freeze([...failures]);
}

export function createRegressionReport(report: RegressionReport): RegressionReport {
  return Object.freeze({
    ...report,
    cases: freezeCases(report.cases),
    failures: freezeFailures(report.failures),
    metrics: Object.freeze({
      ...report.metrics,
    }),
  });
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function formatScore(value: number): string {
  return formatNumber(Number(value.toFixed(6)));
}

function renderCaseMarkdown(caseResult: RegressionCaseResult): string {
  const lines: string[] = [];
  lines.push(`### ${caseResult.screenplayId}`);
  lines.push(`- Scene: ${caseResult.sceneId}`);
  lines.push(`- Expected score: ${formatScore(caseResult.expectedScore)}`);
  lines.push(`- Actual score: ${formatScore(caseResult.actualScore)}`);
  lines.push(`- Passed: ${caseResult.passed ? "yes" : "no"}`);
  lines.push(`- Findings: ${caseResult.humanFindings.length} expected / ${caseResult.actualFindings.length} actual`);
  lines.push("");
  lines.push("| Finding | Evidence | Concept | Article | Explanation | Action | Match |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");

  for (const comparison of caseResult.findingComparisons) {
    const actual = comparison.actual;
    lines.push(`| ${comparison.findingId.replace(/\|/g, "\\|")} | ${comparison.expected.expectedEvidence.text.replace(/\|/g, "\\|")} | ${comparison.expected.expectedConceptId.replace(/\|/g, "\\|")} | ${String(comparison.expected.expectedGcamArticleId)} | ${comparison.expected.expectedExplanation.replace(/\|/g, "\\|")} | ${comparison.expected.expectedAction} | ${comparison.failures.length === 0 ? "PASS" : "FAIL"} |`);
    if (actual) {
      lines.push(`| actual | ${actual.evidence.text.replace(/\|/g, "\\|")} | ${String(actual.conceptId ?? "n/a").replace(/\|/g, "\\|")} | ${actual.gcamArticleId ?? "n/a"} | ${actual.explanation.replace(/\|/g, "\\|")} | ${actual.action} |`);
    }
  }

  if (caseResult.humanFindings.length === 0) {
    lines.push("_No expected findings._");
  }

  if (caseResult.findingComparisons.some((comparison) => comparison.failures.length > 0)) {
    lines.push("");
    lines.push("Failures:");
    for (const comparison of caseResult.findingComparisons) {
      for (const failure of comparison.failures) {
        lines.push(`- [${failure.stage}] ${failure.findingId}: ${failure.code} (${failure.message})`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function renderRegressionReportMarkdown(report: RegressionReport): string {
  const lines: string[] = [];
  lines.push("# V4 Regression Report");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Regression ID: ${report.regressionId}`);
  lines.push(`- Total cases: ${report.metrics.totalCases}`);
  lines.push(`- Passed cases: ${report.metrics.passedCases}`);
  lines.push(`- Failed cases: ${report.metrics.failedCases}`);
  lines.push(`- Expected score: ${formatScore(report.metrics.expectedScore)}`);
  lines.push(`- Actual score: ${formatScore(report.metrics.actualScore)}`);
  lines.push(`- Score delta: ${formatScore(report.metrics.scoreDelta)}`);
  lines.push("");
  lines.push("## Metrics");
  lines.push(`- Finding precision: ${formatScore(report.metrics.findingPrecision)}`);
  lines.push(`- Finding recall: ${formatScore(report.metrics.findingRecall)}`);
  lines.push(`- Evidence accuracy: ${formatScore(report.metrics.evidenceAccuracy)}`);
  lines.push(`- Evidence span accuracy: ${formatScore(report.metrics.evidenceSpanAccuracy)}`);
  lines.push(`- Concept accuracy: ${formatScore(report.metrics.conceptAccuracy)}`);
  lines.push(`- GCAM article accuracy: ${formatScore(report.metrics.gcamArticleAccuracy)}`);
  lines.push(`- Explanation accuracy: ${formatScore(report.metrics.explanationAccuracy)}`);
  lines.push(`- Duplicate finding rate: ${formatScore(report.metrics.duplicateFindingRate)}`);
  lines.push(`- Hallucination rate: ${formatScore(report.metrics.hallucinationRate)}`);
  lines.push("");
  lines.push("## Cases");
  for (const caseResult of report.cases) {
    lines.push(renderCaseMarkdown(caseResult));
  }
  lines.push("## Failures");
  if (report.failures.length === 0) {
    lines.push("_No regression failures detected._");
  } else {
    for (const failure of report.failures) {
      lines.push(`- [${failure.stage}] ${failure.findingId}: ${failure.code} (${failure.message})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function buildRegressionMetrics(input: Readonly<{
  cases: readonly RegressionCaseResult[];
}>): RegressionMetrics {
  const totalCases = input.cases.length;
  const passedCases = input.cases.filter((item) => item.passed).length;
  const failedCases = totalCases - passedCases;
  const expectedScore = average(input.cases.map((item) => item.expectedScore));
  const actualScore = average(input.cases.map((item) => item.actualScore));
  const scoreDelta = Number((actualScore - expectedScore).toFixed(6));

  const allComparisons = input.cases.flatMap((item) => item.findingComparisons);
  const totalActualFindings = input.cases.reduce((sum, item) => sum + item.actualFindings.length, 0);
  const totalExpectedFindings = input.cases.reduce((sum, item) => sum + item.humanFindings.length, 0);
  const matchedFindings = allComparisons.filter((comparison) => comparison.matches.evidence && comparison.matches.evidenceSpan && comparison.matches.concept && comparison.matches.gcamArticle && comparison.matches.explanation && comparison.matches.action).length;
  const evidenceMatches = allComparisons.filter((comparison) => comparison.matches.evidence).length;
  const evidenceSpanMatches = allComparisons.filter((comparison) => comparison.matches.evidenceSpan).length;
  const conceptMatches = allComparisons.filter((comparison) => comparison.matches.concept).length;
  const gcamArticleMatches = allComparisons.filter((comparison) => comparison.matches.gcamArticle).length;
  const explanationMatches = allComparisons.filter((comparison) => comparison.matches.explanation).length;
  const duplicateFindingCount = input.cases.reduce((sum, item) => sum + item.duplicateFindingCount, 0);
  const hallucinationCount = input.cases.reduce((sum, item) => sum + item.hallucinationCount, 0);

  return Object.freeze({
    totalCases,
    passedCases,
    failedCases,
    expectedScore,
    actualScore,
    scoreDelta,
    findingPrecision: ratio(matchedFindings, totalActualFindings),
    findingRecall: ratio(matchedFindings, totalExpectedFindings),
    evidenceAccuracy: ratio(evidenceMatches, matchedFindings),
    evidenceSpanAccuracy: ratio(evidenceSpanMatches, matchedFindings),
    conceptAccuracy: ratio(conceptMatches, matchedFindings),
    gcamArticleAccuracy: ratio(gcamArticleMatches, matchedFindings),
    explanationAccuracy: ratio(explanationMatches, matchedFindings),
    duplicateFindingRate: ratio(duplicateFindingCount, totalActualFindings),
    hallucinationRate: ratio(hallucinationCount, totalActualFindings),
  });
}
