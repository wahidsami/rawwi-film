import type { BenchmarkCase } from "../../benchmark/benchmarkTypes.js";
import type { V3ReasoningTrace } from "../../debug/reasoningTraceTypes.js";

export type ValidationCase = BenchmarkCase &
  Readonly<{
    expectedAtomId: string | null;
  }>;

export type ValidationDifference = Readonly<{
  field:
    | "concepts"
    | "intent"
    | "context"
    | "evidence"
    | "judgment"
    | "article"
    | "atom"
    | "finding"
    | "explanation"
    | "confidence";
  reason: string;
  expected: string;
  actual: string;
  missingKnowledge: readonly string[];
  possibleDecisionRecord: string | null;
  possibleLesson: string | null;
  possiblePattern: string | null;
  possibleBenchmark: string | null;
}>;

export type ValidationCaseMismatch = Readonly<{
  concepts: boolean;
  intent: boolean;
  context: boolean;
  evidence: boolean;
  judgment: boolean;
  article: boolean;
  atom: boolean;
  finding: boolean;
  explanation: boolean;
  confidence: boolean;
}>;

export type ValidationCaseResult = Readonly<{
  case: ValidationCase;
  actualConcepts: readonly string[];
  actualIntent: string;
  actualContext: string;
  actualEvidence: string;
  actualJudgment: "match" | "review" | "reject";
  actualArticleMapping: readonly number[];
  actualAtomId: string | null;
  actualLegalModule: string | null;
  actualFinding: Readonly<{
    moduleId: string | null;
    articleIds: readonly number[];
    atomId: string | null;
    disposition: "match" | "review" | "reject";
    summary: string;
    explanation: string;
    confidence: number;
  }>;
  reasoningTrace: V3ReasoningTrace | null;
  passed: boolean;
  mismatches: ValidationCaseMismatch;
  differences: readonly ValidationDifference[];
}>;

export type ValidationMetrics = Readonly<{
  totalCases: number;
  passedCases: number;
  passRate: number;
  precision: number;
  recall: number;
  falsePositives: number;
  falseNegatives: number;
  conceptAccuracy: number;
  intentAccuracy: number;
  contextAccuracy: number;
  evidenceAccuracy: number;
  judgmentAccuracy: number;
  articleAccuracy: number;
  atomAccuracy: number;
  findingAccuracy: number;
  explanationAccuracy: number;
  confidenceAccuracy: number;
  readinessScore: number;
}>;

export type ValidationStatistics = Readonly<{
  totalCases: number;
  uniqueConceptCount: number;
  uniqueArticleCount: number;
  uniqueAtomCount: number;
  uniqueIntentCount: number;
  traceCount: number;
  totalEvidenceItems: number;
  totalReasoningStages: number;
  warningCount: number;
  errorCount: number;
  hash: string;
}>;

export type ValidationCoverageReport = Readonly<{
  conceptCoverage: number;
  intentCoverage: number;
  contextCoverage: number;
  evidenceCoverage: number;
  judgmentCoverage: number;
  articleCoverage: number;
  atomCoverage: number;
  findingCoverage: number;
  explanationCoverage: number;
  confidenceCoverage: number;
  overallCoverage: number;
  missingCount: number;
  hash: string;
}>;

export type ValidationKnowledgeGap = Readonly<{
  caseId: string;
  field: ValidationDifference["field"];
  reason: string;
  missingKnowledge: readonly string[];
  possibleDecisionRecord: string | null;
  possibleLesson: string | null;
  possiblePattern: string | null;
  possibleBenchmark: string | null;
}>;

export type ValidationKnowledgeGapReport = Readonly<{
  gaps: readonly ValidationKnowledgeGap[];
  gapCount: number;
  missingKnowledgeCount: number;
  hash: string;
}>;

export type ValidationReasoningTraceSummary = Readonly<{
  caseId: string;
  traceHash: string | null;
  stageCount: number;
  articleIds: readonly number[];
  atomId: string | null;
}>;

export type ValidationReasoningReport = Readonly<{
  traces: readonly ValidationReasoningTraceSummary[];
  traceCount: number;
  hash: string;
}>;

export type ValidationReportSummary = Readonly<{
  readinessScore: number;
  productionReadiness: boolean;
  recommendation: "READY FOR RUNTIME" | "NOT READY FOR RUNTIME";
  status: "LOCKED" | "NOT_READY";
  hash: string;
}>;

export type ValidationReport = Readonly<{
  summary: ValidationReportSummary;
  metrics: ValidationMetrics;
  statistics: ValidationStatistics;
  coverage: ValidationCoverageReport;
  reasoning: ValidationReasoningReport;
  knowledgeGaps: ValidationKnowledgeGapReport;
  cases: readonly ValidationCaseResult[];
  hash: string;
}>;

