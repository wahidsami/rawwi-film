export type KnowledgeAcquisitionKnowledgeType =
  | "reviewer_observation"
  | "reviewer_comment"
  | "reviewer_finding"
  | "reviewer_explanation"
  | "reviewer_rationale"
  | "reviewer_correction"
  | "reviewer_disagreement"
  | "reviewer_consensus"
  | "reviewer_exception"
  | "reviewer_interpretation"
  | "reviewer_edge_case"
  | "reviewer_dialect_note"
  | "reviewer_cultural_note"
  | "reviewer_historical_note"
  | "reviewer_religious_note"
  | "reviewer_political_note"
  | "reviewer_visual_note"
  | "reviewer_storytelling_note"
  | "reviewer_hidden_meaning_note"
  | "reviewer_symbolism_note";

export type KnowledgeAcquisitionSourceType =
  | "gcam_regulation"
  | "gcam_slide"
  | "reviewer_meeting"
  | "internal_note"
  | "reviewed_script"
  | "reviewer_feedback"
  | "benchmark_correction"
  | "other";

export type KnowledgeAcquisitionAgreementState = "consensus" | "disagreement" | "pending";

export type KnowledgeAcquisitionRecord = Readonly<{
  id: string;
  version: string;
  source: string;
  date: string;
  reviewerConfidence: number;
  knowledgeType: KnowledgeAcquisitionKnowledgeType | string;
  domain: string;
  concepts: readonly string[];
  storyContext: string;
  evidence: readonly string[];
  reasoning: readonly string[];
  decision: string;
  alternativeDecisions: readonly string[];
  rejectedInterpretations: readonly string[];
  relatedLessons: readonly string[];
  relatedPatterns: readonly string[];
  relatedDecisionRecords: readonly string[];
  relatedBenchmarks: readonly string[];
  knowledgeDebtReference: string;
  futureReviewNotes: readonly string[];
  reviewerId: string | null;
  reviewerName: string | null;
  agreementState: KnowledgeAcquisitionAgreementState;
  disagreementGroupId: string | null;
  supersedesId: string | null;
  supersededById: string | null;
  relatedRecordIds: readonly string[];
}>;

export type KnowledgeAcquisitionRecordDocument = Readonly<{
  schema_version: 1;
  document_version: string;
  format?: "knowledge_acquisition_record";
  record: KnowledgeAcquisitionRecord;
}>;

export type KnowledgeAcquisitionBundleDocument = Readonly<{
  schema_version: 1;
  bundle_version: string;
  format?: "knowledge_acquisition_bundle";
  records: readonly KnowledgeAcquisitionRecordDocument[];
}>;

export type KnowledgeAcquisitionDocumentInput =
  | KnowledgeAcquisitionRecord
  | KnowledgeAcquisitionRecordDocument
  | KnowledgeAcquisitionBundleDocument;

export type KnowledgeAcquisitionValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type KnowledgeAcquisitionValidationResult = Readonly<{
  valid: boolean;
  issues: readonly KnowledgeAcquisitionValidationIssue[];
  hash: string;
  recordHashes: readonly string[];
}>;

export type KnowledgeAcquisitionSearchQuery = Readonly<{
  concept?: string | null;
  domain?: string | null;
  knowledgeType?: string | null;
  source?: string | null;
  lesson?: string | null;
  pattern?: string | null;
  decisionRecord?: string | null;
  benchmark?: string | null;
  keyword?: string | null;
  reviewerId?: string | null;
  disagreementGroupId?: string | null;
}>;

export type KnowledgeAcquisitionSearchResult = Readonly<{
  record: KnowledgeAcquisitionRecord;
  score: number;
  reasons: readonly string[];
}>;

export type KnowledgeAcquisitionRegistryValidation = Readonly<{
  valid: boolean;
  issues: readonly KnowledgeAcquisitionValidationIssue[];
  hash: string;
  recordHashes: readonly string[];
}>;

export type KnowledgeAcquisitionCoverageReport = Readonly<{
  framework: string;
  recordCount: number;
  domainCount: number;
  knowledgeTypeCount: number;
  sourceCount: number;
  conceptCount: number;
  duplicateIdCount: number;
  brokenReferenceCount: number;
  missingReferenceCount: number;
  evolutionLinkCount: number;
  coveragePercent: number;
  productionReadiness: number;
  readyForAcademy: boolean;
  warnings: readonly string[];
  gaps: readonly string[];
  hash: string;
}>;

export type KnowledgeAcquisitionRegistry = Readonly<{
  rootDir: string | null;
  records: readonly KnowledgeAcquisitionRecord[];
  validation: KnowledgeAcquisitionRegistryValidation;
  hash: string;
  list: () => readonly KnowledgeAcquisitionRecord[];
  get: (id: string) => KnowledgeAcquisitionRecord | null;
  register: (record: KnowledgeAcquisitionRecord) => KnowledgeAcquisitionRegistry;
  unregister: (id: string) => boolean;
  search: (query: KnowledgeAcquisitionSearchQuery) => readonly KnowledgeAcquisitionSearchResult[];
}>;
