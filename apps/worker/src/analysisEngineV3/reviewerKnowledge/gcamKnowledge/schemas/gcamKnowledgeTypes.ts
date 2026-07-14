export type GcamKnowledgeVersion = Readonly<{
  major: number;
  minor: number;
  patch: number;
}>;

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
  documentId: string;
  documentTitle: string | null;
  sourcePage: number | null;
  articleId: number | null;
  atomId: string | null;
  reviewer: string | null;
  meeting: string | null;
  date: string | null;
  excerpt: string;
}>;

export type GcamKnowledgeLinks = Readonly<{
  articleIds: readonly number[];
  atomIds: readonly string[];
  conceptIds: readonly string[];
  domainIds: readonly string[];
  relatedLessons: readonly string[];
  relatedPatternLibraries: readonly string[];
  relatedDecisionRecords: readonly string[];
  relatedBenchmarks: readonly string[];
  relatedMethodologies: readonly string[];
  relatedKnowledgeAcquisitionRecords: readonly string[];
}>;

export type GcamKnowledgeRecord = Readonly<{
  id: string;
  version: string;
  kind: GcamKnowledgeKind;
  title: string;
  description: string;
  source: GcamKnowledgeSourceReference;
  confidence: number;
  concepts: readonly string[];
  domains: readonly string[];
  relatedLessons: readonly string[];
  relatedPatternLibraries: readonly string[];
  relatedDecisionRecords: readonly string[];
  relatedBenchmarks: readonly string[];
  relatedMethodologies: readonly string[];
  relatedKnowledgeAcquisitionRecords: readonly string[];
  evidence: readonly string[];
  reasoning: readonly string[];
  decision: string;
  alternativeInterpretations: readonly string[];
  rejectedInterpretations: readonly string[];
  reviewerComment: string;
  reviewerFinding: string;
  reviewerObservation: string;
  knowledgeDebtLinks: readonly string[];
  futureReviewNotes: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
}>;

export type GcamKnowledgeArticleRecord = GcamKnowledgeRecord & Readonly<{
  kind: "article";
  articleId: number;
  atomIds: readonly string[];
  titleAr: string | null;
}>;

export type GcamKnowledgeAtomRecord = GcamKnowledgeRecord & Readonly<{
  kind: "atom";
  articleId: number;
  atomId: string;
  titleAr: string | null;
}>;

export type GcamKnowledgeDebtRecord = GcamKnowledgeRecord & Readonly<{
  kind: "knowledge_debt";
  missingCoverage: readonly string[];
  severity: "low" | "medium" | "high";
}>;

export type GcamKnowledgeCatalog = Readonly<{
  articles: readonly GcamKnowledgeArticleRecord[];
  atoms: readonly GcamKnowledgeAtomRecord[];
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

export type GcamKnowledgeDocument = Readonly<{
  schema_version: 1;
  document_version: string;
  format: "gcam_knowledge_record" | "gcam_knowledge_catalog" | "gcam_knowledge_bundle";
  record?: GcamKnowledgeRecord;
  catalog?: GcamKnowledgeCatalog;
  records?: readonly GcamKnowledgeRecord[];
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

export type GcamKnowledgeCoverageReport = Readonly<{
  framework: string;
  infrastructureReadinessPercent: number;
  coverageInfrastructurePercent: number;
  validationStatus: "EMPTY" | "VALID" | "INVALID";
  knowledgeCapacityPercent: number;
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
  warnings: readonly string[];
  missingCoverage: readonly string[];
  readyForGcamImport: boolean;
  hash: string;
}>;

export type GcamKnowledgeReferenceContext = Readonly<{
  lessonIds: readonly string[];
  patternLibraryIds: readonly string[];
  decisionRecordIds: readonly string[];
  benchmarkIds: readonly string[];
  methodologyIds: readonly string[];
  knowledgeAcquisitionRecordIds: readonly string[];
}>;

export type GcamKnowledgeRegistry = Readonly<{
  catalog: GcamKnowledgeCatalog;
  validation: GcamKnowledgeValidationResult;
  hash: string;
  listAll: () => readonly GcamKnowledgeRecord[];
  listByKind: (kind: GcamKnowledgeKind) => readonly GcamKnowledgeRecord[];
  get: (id: string) => GcamKnowledgeRecord | null;
  register: (record: GcamKnowledgeRecord) => GcamKnowledgeRegistry;
  unregister: (id: string) => GcamKnowledgeRegistry;
  importDocument: (document: GcamKnowledgeDocument) => GcamKnowledgeRegistry;
  exportDocument: () => GcamKnowledgeDocument;
}>;

