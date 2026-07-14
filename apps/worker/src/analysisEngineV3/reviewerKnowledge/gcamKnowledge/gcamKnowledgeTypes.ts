export type GcamKnowledgeKind =
  | "article"
  | "atom"
  | "reviewer_example"
  | "reviewer_comment"
  | "reviewer_observation"
  | "reviewer_interpretation"
  | "reviewer_exception"
  | "reviewer_correction"
  | "reviewer_disagreement"
  | "reviewer_note"
  | "knowledge_debt";

export type GcamKnowledgeSourceReference = Readonly<{
  document: string;
  articleId: number | null;
  atomId: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  excerpt: string;
}>;

export type GcamKnowledgeLinkSet = Readonly<{
  articleIds: readonly number[];
  atomIds: readonly string[];
  conceptRefs: readonly string[];
  methodologyRefs: readonly string[];
  patternRefs: readonly string[];
  decisionRecordRefs: readonly string[];
  benchmarkRefs: readonly string[];
  knowledgeAcquisitionRecordRefs: readonly string[];
}>;

export type GcamKnowledgeExample = Readonly<{
  id: string;
  title: string;
  text: string;
  whyItMatters: string;
  alternativeInterpretations: readonly string[];
  rejectedInterpretations: readonly string[];
}>;

export type GcamKnowledgeRecord = Readonly<{
  id: string;
  kind: GcamKnowledgeKind;
  title: string;
  summary: string;
  source: GcamKnowledgeSourceReference;
  links: GcamKnowledgeLinkSet;
  evidence: readonly string[];
  alternativeInterpretations: readonly string[];
  rejectedInterpretations: readonly string[];
  reviewerComment: string;
  reviewerFinding: string;
  confidence: number;
  knowledgeDebtReference: string | null;
}>;

export type GcamArticleRecord = GcamKnowledgeRecord & Readonly<{
  kind: "article";
  articleId: number;
  atomIds: readonly string[];
  titleAr: string;
}>;

export type GcamAtomRecord = GcamKnowledgeRecord & Readonly<{
  kind: "atom";
  articleId: number;
  atomId: string;
  titleAr: string;
}>;

export type GcamKnowledgeDebtRecord = GcamKnowledgeRecord & Readonly<{
  kind: "knowledge_debt";
  missingCoverage: readonly string[];
  severity: "low" | "medium" | "high";
}>;

export type GcamKnowledgeCatalog = Readonly<{
  articles: readonly GcamArticleRecord[];
  atoms: readonly GcamAtomRecord[];
  reviewerExamples: readonly GcamKnowledgeRecord[];
  reviewerComments: readonly GcamKnowledgeRecord[];
  reviewerObservations: readonly GcamKnowledgeRecord[];
  reviewerInterpretations: readonly GcamKnowledgeRecord[];
  reviewerExceptions: readonly GcamKnowledgeRecord[];
  reviewerCorrections: readonly GcamKnowledgeRecord[];
  reviewerDisagreements: readonly GcamKnowledgeRecord[];
  reviewerNotes: readonly GcamKnowledgeRecord[];
  knowledgeDebt: readonly GcamKnowledgeDebtRecord[];
}>;

export type GcamKnowledgeValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type GcamKnowledgeValidationResult = Readonly<{
  valid: boolean;
  issues: readonly GcamKnowledgeValidationIssue[];
  hash: string;
}>;

export type GcamCoverageReport = Readonly<{
  framework: string;
  articleCount: number;
  atomCount: number;
  reviewerExampleCount: number;
  reviewerCommentCount: number;
  reviewerObservationCount: number;
  reviewerInterpretationCount: number;
  reviewerExceptionCount: number;
  reviewerCorrectionCount: number;
  reviewerDisagreementCount: number;
  reviewerNoteCount: number;
  knowledgeDebtCount: number;
  articleCoveragePercent: number;
  atomCoveragePercent: number;
  exampleCoveragePercent: number;
  reviewerNotesCoveragePercent: number;
  observationCoveragePercent: number;
  exceptionCoveragePercent: number;
  missingCoverage: readonly string[];
  readyForBenchmark: boolean;
  hash: string;
}>;

export type GcamKnowledgeRegistry = Readonly<{
  catalog: GcamKnowledgeCatalog;
  validation: GcamKnowledgeValidationResult;
  hash: string;
  listAll: () => readonly GcamKnowledgeRecord[];
  listByKind: (kind: GcamKnowledgeKind) => readonly GcamKnowledgeRecord[];
  get: (id: string) => GcamKnowledgeRecord | null;
}>;

