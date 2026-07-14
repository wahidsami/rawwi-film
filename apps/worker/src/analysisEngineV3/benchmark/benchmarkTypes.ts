import type { V3PromptGlossary, V3PromptSubjectModule } from "../builder/builderTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";

export type BenchmarkConfidenceRange = Readonly<{
  min: number;
  max: number;
}>;

export type BenchmarkExpectedReviewerAssessment = Readonly<{
  narrativeUnderstanding: string;
  speaker: string | null;
  target: string | null;
  victim: string | null;
  narrativeIntent: string;
  evidenceStrength: number;
  contextClassification: string;
  literalVsImpliedMeaning: string;
  exceptionSignals: readonly string[];
}>;

export type BenchmarkExpectedFinding = Readonly<{
  disposition: "match" | "review" | "reject";
  summary: string;
}>;

export type BenchmarkCase = Readonly<{
  id: string;
  title: string;
  scriptSnippet: string;
  storyMemory: string | null;
  sceneMemory: string | null;
  neighboringSentences: readonly string[];
  glossary: V3PromptGlossary;
  subjectModule: V3PromptSubjectModule;
  expectedConcepts: readonly string[];
  expectedReviewerAssessment: BenchmarkExpectedReviewerAssessment;
  expectedLegalModule: string;
  expectedArticleMapping: readonly number[];
  expectedFinding: BenchmarkExpectedFinding;
  expectedExplanation: string;
  expectedConfidenceRange: BenchmarkConfidenceRange;
}>;

export type BenchmarkActualFinding = Readonly<{
  moduleId: string | null;
  articleIds: readonly number[];
  disposition: "match" | "review" | "reject";
  summary: string;
  explanation: string;
  confidence: number;
}>;

export type BenchmarkCaseMismatch = Readonly<{
  concepts: boolean;
  reviewerAssessment: boolean;
  legalModule: boolean;
  articleMapping: boolean;
  finding: boolean;
  explanation: boolean;
  confidence: boolean;
}>;

export type BenchmarkCaseResult = Readonly<{
  case: BenchmarkCase;
  actualConcepts: readonly string[];
  actualReviewerAssessment: ReviewerAssessment;
  actualLegalModule: string | null;
  actualFinding: BenchmarkActualFinding;
  passed: boolean;
  mismatches: BenchmarkCaseMismatch;
}>;

export type BenchmarkScore = Readonly<{
  totalCases: number;
  passedCases: number;
  passRate: number;
  precision: number;
  recall: number;
  falsePositives: number;
  falseNegatives: number;
  explanationMismatches: number;
  articleMappingMismatches: number;
}>;

export type BenchmarkReport = Readonly<{
  cases: readonly BenchmarkCaseResult[];
  score: BenchmarkScore;
}>;

