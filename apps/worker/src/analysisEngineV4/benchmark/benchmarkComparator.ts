import type { AnalysisResult } from "../../analysisEngine/types.js";
import type { BenchmarkEngineName } from "./benchmarkTypes.js";
import type { V3RuntimeFinding } from "../../analysisEngineV3/runtime/runtimeTypes.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import type {
  BenchmarkActualFinding,
  BenchmarkCaseResult,
  BenchmarkEngineComparison,
  BenchmarkEngineMetrics,
  BenchmarkFindingComparison,
  BenchmarkGroundTruthFinding,
  BenchmarkMetrics,
  BenchmarkScreenplay,
  BenchmarkStageFailure,
  BenchmarkStageName,
  BenchmarkStageScore,
} from "./benchmarkTypes.js";
import { createBenchmarkMetrics, createStageScore } from "./benchmarkMetrics.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeComparable(value: string): string {
  return normalizeText(value).toLowerCase();
}

function createEvidenceSnapshot(evidence: V3RuntimeFinding | null): BenchmarkActualFinding["evidence"] {
  return {
    text: evidence?.evidence_snippet ?? "",
    startOffset: evidence?.start_offset_global ?? null,
    endOffset: evidence?.end_offset_global ?? null,
    lineId: evidence?.lineage_id ?? null,
    pageNumber: null,
  };
}

function uniqueBy<T>(values: readonly T[], keyFn: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return Object.freeze(unique);
}

function actualFindingKey(finding: V3RuntimeFinding): string {
  return [
    finding.lineage_id ?? finding.canonical_finding_id ?? "",
    finding.article_id,
    finding.atom_id ?? finding.canonical_atom ?? "",
    normalizeComparable(finding.evidence_snippet ?? ""),
    finding.start_offset_global ?? -1,
    finding.end_offset_global ?? -1,
  ].join("|");
}

function actualEvidenceKey(finding: V3RuntimeFinding): string {
  return [
    normalizeComparable(finding.evidence_snippet ?? ""),
    finding.start_offset_global ?? -1,
    finding.end_offset_global ?? -1,
  ].join("|");
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
  const evidence = normalizeComparable(actual.evidence.text) === normalizeComparable(expected.expectedEvidence.text);
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

  return Object.freeze({
    score: evidence && evidenceSpan && concept && gcamArticle && explanation && action ? 1 : 0,
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

function buildSceneUnderstandingScore(caseItem: BenchmarkScreenplay, sceneSummary: string): BenchmarkStageScore {
  const expectedSummary = caseItem.expectedSceneSummary ?? null;
  const passed = expectedSummary == null
    ? Number(sceneSummary.length > 0)
    : Number(normalizeComparable(sceneSummary) === normalizeComparable(expectedSummary));
  return createStageScore("scene_understanding", passed, 1);
}

function extractFinding(state: AnalysisResult, engine: string): BenchmarkActualFinding[] {
  const findings = [...state.findings].sort((left, right) => actualFindingKey(left).localeCompare(actualFindingKey(right)));
  return findings.map((finding, index) => Object.freeze({
    findingId: finding.canonical_finding_id ?? finding.lineage_id ?? `${engine}:finding-${index + 1}`,
    evidence: createEvidenceSnapshot(finding),
    conceptId: finding.category ?? null,
    conceptLabel: finding.category ?? null,
    knowledgeDomain: finding.category ?? null,
    gcamArticleId: finding.article_id ?? null,
    gcamArticleTitleAr: finding.title_ar ?? null,
    explanation: finding.description_ar ?? "",
    action: String(finding.final_ruling ?? "reject") === "context_ok" ? "accept" : String(finding.final_ruling ?? "reject") === "needs_review" ? "needs_review" : "reject",
  }));
}

function buildStageScores(comparisons: readonly BenchmarkFindingComparison[]): Readonly<Record<BenchmarkStageName, BenchmarkStageScore>> {
  return Object.freeze({
    scene_understanding: createStageScore("scene_understanding", 1, 1),
    evidence_extraction: createStageScore("evidence_extraction", comparisons.filter((comparison) => comparison.matches.evidence && comparison.matches.evidenceSpan).length, Math.max(1, comparisons.length)),
    concept_classification: createStageScore("concept_classification", comparisons.filter((comparison) => comparison.matches.concept).length, Math.max(1, comparisons.length)),
    legal_mapping: createStageScore("legal_mapping", comparisons.filter((comparison) => comparison.matches.gcamArticle).length, Math.max(1, comparisons.length)),
    explanation: createStageScore("explanation", comparisons.filter((comparison) => comparison.matches.explanation).length, Math.max(1, comparisons.length)),
    judge: createStageScore("judge", comparisons.filter((comparison) => comparison.matches.action).length, Math.max(1, comparisons.length)),
  });
}

function buildMetrics(engineResult: Readonly<{
  actualFindings: readonly BenchmarkActualFinding[];
  findingComparisons: readonly BenchmarkFindingComparison[];
  duplicateFindingCount: number;
  hallucinationCount: number;
}>): BenchmarkMetrics {
  const totalActualFindings = engineResult.actualFindings.length;
  const totalExpectedFindings = engineResult.findingComparisons.length;
  const matchedFindings = engineResult.findingComparisons.filter((comparison) => comparison.matches.evidence && comparison.matches.evidenceSpan && comparison.matches.concept && comparison.matches.gcamArticle && comparison.matches.explanation && comparison.matches.action).length;
  const evidenceMatches = engineResult.findingComparisons.filter((comparison) => comparison.matches.evidence).length;
  const evidenceSpanMatches = engineResult.findingComparisons.filter((comparison) => comparison.matches.evidenceSpan).length;
  const conceptMatches = engineResult.findingComparisons.filter((comparison) => comparison.matches.concept).length;
  const gcamArticleMatches = engineResult.findingComparisons.filter((comparison) => comparison.matches.gcamArticle).length;
  const explanationMatches = engineResult.findingComparisons.filter((comparison) => comparison.matches.explanation).length;

  return createBenchmarkMetrics({
    totalActualFindings,
    totalExpectedFindings,
    matchedFindings,
    evidenceMatches,
    evidenceSpanMatches,
    conceptMatches,
    gcamArticleMatches,
    explanationMatches,
    duplicateFindingCount: engineResult.duplicateFindingCount,
    hallucinationCount: engineResult.hallucinationCount,
  });
}

export function compareBenchmarkEngineResult(input: Readonly<{
  caseItem: BenchmarkScreenplay;
  engine: BenchmarkEngineName;
  analysisResult: AnalysisResult;
  traceDocument: SceneAnalysisTraceDocument | null;
  runtimeMs: number;
  promptTokenEstimate: number | null;
  completionTokenEstimate: number | null;
  estimatedCostUsd: number | null;
}>): BenchmarkEngineComparison {
  const actualFindings = Object.freeze(extractFinding(input.analysisResult, input.engine));
  const usedActualIndexes = new Set<number>();
  const findingComparisons: BenchmarkFindingComparison[] = [];

  for (const expectedFinding of input.caseItem.expectedFindings) {
    const match = pickBestMatch(actualFindings, expectedFinding, usedActualIndexes);
    if (match.actualIndex !== null) {
      usedActualIndexes.add(match.actualIndex);
    }
    findingComparisons.push(match.comparison);
  }

  const falsePositives = actualFindings.filter((_, index) => !usedActualIndexes.has(index));
  const falseNegatives = input.caseItem.expectedFindings.filter((expectedFinding) => !findingComparisons.some((comparison) => comparison.findingId === expectedFinding.findingId && comparison.actual !== null));
  const duplicateFindingCount = Math.max(0, actualFindings.length - uniqueBy(actualFindings, (finding) => [
    finding.findingId,
    finding.gcamArticleId ?? "n/a",
    normalizeComparable(finding.evidence.text),
    finding.evidence.startOffset ?? -1,
    finding.evidence.endOffset ?? -1,
    finding.conceptId ?? "n/a",
  ].join("|")).length);
  const hallucinationCount = Math.max(0, actualFindings.length - usedActualIndexes.size);

  const comparison = Object.freeze({
    engine: input.engine,
    analysisResult: input.analysisResult,
    actualFindings,
    findingComparisons: Object.freeze(findingComparisons),
    falsePositives: Object.freeze(falsePositives),
    falseNegatives: Object.freeze(falseNegatives),
    incorrectEvidence: Object.freeze(findingComparisons.filter((comparison) => !comparison.matches.evidence || !comparison.matches.evidenceSpan)),
    incorrectArticleMappings: Object.freeze(findingComparisons.filter((comparison) => !comparison.matches.gcamArticle)),
    hallucinatedExplanations: Object.freeze(findingComparisons.filter((comparison) => !comparison.matches.explanation || !comparison.matches.action)),
    duplicateFindingCount,
    hallucinationCount,
    stageScores: buildStageScores(findingComparisons),
    metrics: buildMetrics({
      actualFindings,
      findingComparisons,
      duplicateFindingCount,
      hallucinationCount,
    }),
    traceDocument: input.traceDocument,
    execution: Object.freeze({
      runtimeMs: input.runtimeMs,
      promptTokenEstimate: input.promptTokenEstimate,
      completionTokenEstimate: input.completionTokenEstimate,
      estimatedCostUsd: input.estimatedCostUsd,
    }),
  });

  return comparison;
}

export function buildBenchmarkCaseResult(input: Readonly<{
  caseItem: BenchmarkScreenplay;
  engineComparisons: readonly BenchmarkEngineComparison[];
  traceDocument: SceneAnalysisTraceDocument;
}>): BenchmarkCaseResult {
  const preferredComparison = input.engineComparisons.find((comparison) => comparison.engine === "v4") ?? input.engineComparisons[0] ?? null;
  const sceneSummary = input.traceDocument.sceneSummary ?? input.caseItem.expectedSceneSummary ?? "";

  return Object.freeze({
    screenplayId: input.caseItem.screenplayId,
    sceneId: input.caseItem.sceneId,
    sceneSummary,
    humanFindings: Object.freeze([...input.caseItem.expectedFindings]),
    engineComparisons: Object.freeze([...input.engineComparisons]),
    sceneUnderstandingScore: buildSceneUnderstandingScore(input.caseItem, sceneSummary),
    evidenceExtractionScore: preferredComparison?.stageScores.evidence_extraction ?? createStageScore("evidence_extraction", 0, Math.max(1, input.caseItem.expectedFindings.length)),
    conceptClassificationScore: preferredComparison?.stageScores.concept_classification ?? createStageScore("concept_classification", 0, Math.max(1, input.caseItem.expectedFindings.length)),
    legalMappingScore: preferredComparison?.stageScores.legal_mapping ?? createStageScore("legal_mapping", 0, Math.max(1, input.caseItem.expectedFindings.length)),
    explanationScore: preferredComparison?.stageScores.explanation ?? createStageScore("explanation", 0, Math.max(1, input.caseItem.expectedFindings.length)),
    judgeScore: preferredComparison?.stageScores.judge ?? createStageScore("judge", 0, Math.max(1, input.caseItem.expectedFindings.length)),
    findingComparisons: Object.freeze(preferredComparison?.findingComparisons ?? []),
    actualFindings: Object.freeze(preferredComparison?.actualFindings ?? []),
    falsePositives: Object.freeze(preferredComparison?.falsePositives ?? []),
    falseNegatives: Object.freeze(preferredComparison?.falseNegatives ?? []),
    incorrectEvidence: Object.freeze(preferredComparison?.incorrectEvidence ?? []),
    incorrectArticleMappings: Object.freeze(preferredComparison?.incorrectArticleMappings ?? []),
    hallucinatedExplanations: Object.freeze(preferredComparison?.hallucinatedExplanations ?? []),
    duplicateFindingCount: preferredComparison?.duplicateFindingCount ?? 0,
    hallucinationCount: preferredComparison?.hallucinationCount ?? 0,
    traceDocument: input.traceDocument,
  });
}
