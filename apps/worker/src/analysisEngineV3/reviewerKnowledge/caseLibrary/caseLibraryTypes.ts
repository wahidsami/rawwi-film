import type { GcamKnowledgeRecord } from "../gcamKnowledge/schemas/gcamKnowledgeTypes.js";
import type { DecisionRecord } from "../decisionRecords/decisionRecordTypes.js";

export type CaseLibraryCaseCategory =
  | "positive"
  | "negative"
  | "borderline"
  | "false_positive"
  | "false_negative"
  | "similar"
  | "counter";

export type CaseLibraryCaseSourceKind = "gcam_knowledge" | "decision_record";

export type CaseLibraryCase = Readonly<{
  id: string;
  sourceKind: CaseLibraryCaseSourceKind;
  sourceId: string;
  primaryCategory: CaseLibraryCaseCategory;
  categories: readonly CaseLibraryCaseCategory[];
  title: string;
  summary: string;
  articleIds: readonly number[];
  atomIds: readonly string[];
  concepts: readonly string[];
  evidence: readonly string[];
  reviewerExplanation: string;
  gcamReasoning: readonly string[];
  culturalReasoning: readonly string[];
  reviewerDecision: string;
  confidence: number;
  falsePositiveRisk: string | null;
  relatedIds: readonly string[];
}>;

export type CaseLibraryEntry = Readonly<{
  articleId: number;
  articleTitle: string;
  titleAr: string;
  cases: readonly CaseLibraryCase[];
  positiveExamples: readonly CaseLibraryCase[];
  negativeExamples: readonly CaseLibraryCase[];
  borderlineExamples: readonly CaseLibraryCase[];
  falsePositives: readonly CaseLibraryCase[];
  falseNegatives: readonly CaseLibraryCase[];
  similarCases: readonly CaseLibraryCase[];
  counterExamples: readonly CaseLibraryCase[];
  reviewerExplanation: string;
  gcamReasoning: readonly string[];
  culturalReasoning: readonly string[];
}>;

export type CaseLibrarySearchQuery = Readonly<{
  articleId?: number | null;
  concept?: string | null;
  keyword?: string | null;
  category?: CaseLibraryCaseCategory | null;
}>;

export type CaseLibrarySearchResult = Readonly<{
  entry: CaseLibraryEntry;
  score: number;
  reasons: readonly string[];
}>;

export type CaseLibraryValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type CaseLibraryValidationResult = Readonly<{
  valid: boolean;
  issues: readonly CaseLibraryValidationIssue[];
  hash: string;
}>;

export type CaseLibraryCoverageReport = Readonly<{
  framework: string;
  articleCount: number;
  caseCount: number;
  positiveExampleCount: number;
  negativeExampleCount: number;
  borderlineExampleCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  similarCaseCount: number;
  counterExampleCount: number;
  articleCoveragePercent: number;
  caseCoveragePercent: number;
  readyForLibrary: boolean;
  missingCoverage: readonly string[];
  warnings: readonly string[];
  hash: string;
}>;

export type CaseLibraryRegistry = Readonly<{
  entries: readonly CaseLibraryEntry[];
  validation: CaseLibraryValidationResult;
  hash: string;
  list: () => readonly CaseLibraryEntry[];
  get: (articleId: number) => CaseLibraryEntry | null;
  search: (query: CaseLibrarySearchQuery) => readonly CaseLibrarySearchResult[];
}>;

export type CaseLibraryInputs = Readonly<{
  gcamRecords: readonly GcamKnowledgeRecord[];
  decisionRecords: readonly DecisionRecord[];
}>;
