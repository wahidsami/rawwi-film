import type { CaseLibraryEntry } from "../caseLibrary/caseLibraryTypes.js";
import type { DecisionMemoryEntry } from "../decisionMemory/decisionMemoryTypes.js";

export type PrecedentEngineQuery = Readonly<{
  articleId?: number | null;
  concept?: string | null;
  keyword?: string | null;
  status?: "accepted" | "rejected" | "needs_review" | null;
}>;

export type PrecedentEngineMatch = Readonly<{
  decision: DecisionMemoryEntry;
  caseEntry: CaseLibraryEntry | null;
  similarity: number;
  reason: string;
  matchedArticleIds: readonly number[];
  matchedConcepts: readonly string[];
}>;

export type PrecedentEngineReport = Readonly<{
  query: PrecedentEngineQuery;
  matches: readonly PrecedentEngineMatch[];
  bestMatch: PrecedentEngineMatch | null;
  totalDecisions: number;
  totalCases: number;
  precedentCoverage: number;
  hash: string;
}>;

export type PrecedentEngineRegistry = Readonly<{
  report: PrecedentEngineReport;
  search: (query: PrecedentEngineQuery) => PrecedentEngineReport;
}>;
