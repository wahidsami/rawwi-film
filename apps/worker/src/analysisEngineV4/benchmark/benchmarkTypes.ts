import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";

export type BenchmarkFindingAction = "accept" | "reject" | "needs_review";

export type BenchmarkEvidence = Readonly<{
  text: string;
  startOffset: number | null;
  endOffset: number | null;
  lineId: string | null;
  pageNumber: number | null;
}>;

export type BenchmarkGroundTruthFinding = Readonly<{
  findingId: string;
  expectedEvidence: BenchmarkEvidence;
  expectedConceptId: string;
  expectedGcamArticleId: number;
  expectedExplanation: string;
  expectedAction: BenchmarkFindingAction;
}>;

export type BenchmarkScreenplay = Readonly<{
  screenplayId: string;
  sceneId: string;
  sceneText: string;
  expectedSceneSummary?: string | null;
  expectedFindings: readonly BenchmarkGroundTruthFinding[];
}>;

export type BenchmarkActualFinding = Readonly<{
  findingId: string;
  evidence: BenchmarkEvidence;
  conceptId: string | null;
  conceptLabel: string | null;
  knowledgeDomain: string | null;
  gcamArticleId: number | null;
  gcamArticleTitleAr: string | null;
  explanation: string;
  action: BenchmarkFindingAction;
}>;

export type BenchmarkStageName =
  | "scene_understanding"
  | "evidence_extraction"
  | "concept_classification"
  | "legal_mapping"
  | "explanation"
  | "judge";

export type BenchmarkStageFailure = Readonly<{
  stage: BenchmarkStageName;
  findingId: string;
  code: string;
  message: string;
  expected: string;
  actual: string;
}>;

export type BenchmarkStageScore = Readonly<{
  stage: BenchmarkStageName;
  score: number;
  passed: number;
  total: number;
}>;

export type BenchmarkFindingComparison = Readonly<{
  findingId: string;
  expected: BenchmarkGroundTruthFinding;
  actual: BenchmarkActualFinding | null;
  matches: Readonly<{
    evidence: boolean;
    evidenceSpan: boolean;
    concept: boolean;
    gcamArticle: boolean;
    explanation: boolean;
    action: boolean;
  }>;
  failures: readonly BenchmarkStageFailure[];
}>;

export type BenchmarkCaseResult = Readonly<{
  screenplayId: string;
  sceneId: string;
  sceneSummary: string;
  sceneUnderstandingScore: BenchmarkStageScore;
  evidenceExtractionScore: BenchmarkStageScore;
  conceptClassificationScore: BenchmarkStageScore;
  legalMappingScore: BenchmarkStageScore;
  explanationScore: BenchmarkStageScore;
  judgeScore: BenchmarkStageScore;
  findingComparisons: readonly BenchmarkFindingComparison[];
  actualFindings: readonly BenchmarkActualFinding[];
  falsePositives: readonly BenchmarkActualFinding[];
  falseNegatives: readonly BenchmarkGroundTruthFinding[];
  incorrectEvidence: readonly BenchmarkFindingComparison[];
  incorrectArticleMappings: readonly BenchmarkFindingComparison[];
  hallucinatedExplanations: readonly BenchmarkFindingComparison[];
  duplicateFindingCount: number;
  hallucinationCount: number;
  traceDocument: SceneAnalysisTraceDocument;
}>;

export type BenchmarkMetrics = Readonly<{
  findingPrecision: number;
  findingRecall: number;
  evidenceAccuracy: number;
  evidenceSpanAccuracy: number;
  conceptAccuracy: number;
  gcamArticleAccuracy: number;
  explanationAccuracy: number;
  duplicateFindingRate: number;
  hallucinationRate: number;
  overallReviewScore: number;
}>;

export type BenchmarkReport = Readonly<{
  benchmarkId: string;
  cases: readonly BenchmarkCaseResult[];
  stageScores: Readonly<Record<BenchmarkStageName, BenchmarkStageScore>>;
  metrics: BenchmarkMetrics;
  perStageFailures: Readonly<Record<BenchmarkStageName, readonly BenchmarkStageFailure[]>>;
  falsePositives: readonly BenchmarkActualFinding[];
  falseNegatives: readonly BenchmarkGroundTruthFinding[];
  incorrectEvidence: readonly BenchmarkFindingComparison[];
  incorrectArticleMappings: readonly BenchmarkFindingComparison[];
  hallucinatedExplanations: readonly BenchmarkFindingComparison[];
  markdown: string;
}>;

