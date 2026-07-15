import type { DecisionRecord } from "../decisionRecords/decisionRecordTypes.js";

export type DecisionMemoryStatus = "accepted" | "rejected" | "needs_review";

export type DecisionMemoryEntry = Readonly<{
  id: string;
  sourceId: string;
  status: DecisionMemoryStatus;
  title: string;
  summary: string;
  why: string;
  confidence: string;
  confidenceScore: number;
  evidence: readonly string[];
  articleIds: readonly number[];
  atomIds: readonly string[];
  concepts: readonly string[];
  reasoning: readonly string[];
  benchmarkTags: readonly string[];
  relatedLessons: readonly string[];
  relatedPatterns: readonly string[];
  relatedBlueprintConcepts: readonly string[];
  falsePositiveRisk: string;
  reviewerDecision: string;
  findingType: string;
}>;

export type DecisionMemorySearchQuery = Readonly<{
  articleId?: number | null;
  concept?: string | null;
  status?: DecisionMemoryStatus | null;
  keyword?: string | null;
  benchmarkTag?: string | null;
}>;

export type DecisionMemorySearchResult = Readonly<{
  entry: DecisionMemoryEntry;
  score: number;
  reasons: readonly string[];
}>;

export type DecisionMemoryValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type DecisionMemoryValidationResult = Readonly<{
  valid: boolean;
  issues: readonly DecisionMemoryValidationIssue[];
  hash: string;
}>;

export type DecisionMemoryCoverageReport = Readonly<{
  framework: string;
  decisionCount: number;
  acceptedCount: number;
  rejectedCount: number;
  needsReviewCount: number;
  articleCoveragePercent: number;
  decisionCoveragePercent: number;
  readyForMemory: boolean;
  missingCoverage: readonly string[];
  warnings: readonly string[];
  hash: string;
}>;

export type DecisionMemoryRegistry = Readonly<{
  entries: readonly DecisionMemoryEntry[];
  validation: DecisionMemoryValidationResult;
  hash: string;
  list: () => readonly DecisionMemoryEntry[];
  get: (id: string) => DecisionMemoryEntry | null;
  search: (query: DecisionMemorySearchQuery) => readonly DecisionMemorySearchResult[];
}>;

export type DecisionMemoryInputs = Readonly<{
  decisionRecords: readonly DecisionRecord[];
}>;
