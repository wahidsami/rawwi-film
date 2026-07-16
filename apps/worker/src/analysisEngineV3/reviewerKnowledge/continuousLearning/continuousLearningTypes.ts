export type ContinuousLearningSignalKind =
  | "board_correction"
  | "gcam_correction"
  | "approved_finding"
  | "rejected_finding"
  | "human_override"
  | "false_positive"
  | "false_negative"
  | "new_precedent";

export type ContinuousLearningArtifact = Readonly<{
  id: string;
  version: string;
  title: string;
  description: string;
  confidence: number;
  sourceIds: readonly string[];
}>;

export type ContinuousLearningArtifacts = Readonly<{
  lessons: readonly ContinuousLearningArtifact[];
  cases: readonly ContinuousLearningArtifact[];
  patterns: readonly ContinuousLearningArtifact[];
  knowledgeUpdates: readonly ContinuousLearningArtifact[];
  decisionMemories: readonly ContinuousLearningArtifact[];
  reviewerImprovements: readonly ContinuousLearningArtifact[];
}>;

export type ContinuousLearningRecord = Readonly<{
  id: string;
  version: string;
  source: string;
  date: string;
  signalKind: ContinuousLearningSignalKind;
  domain: string;
  concepts: readonly string[];
  evidence: readonly string[];
  reasoning: readonly string[];
  decision: string;
  confidence: number;
  artifacts: ContinuousLearningArtifacts;
  knowledgeAcquisitionRecordIds: readonly string[];
  reviewerId: string | null;
  reviewerName: string | null;
  agreementState: "consensus" | "disagreement" | "pending";
  disagreementGroupId: string | null;
  supersedesId: string | null;
  supersededById: string | null;
  relatedRecordIds: readonly string[];
}>;

export type ContinuousLearningValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type ContinuousLearningValidationResult = Readonly<{
  valid: boolean;
  issues: readonly ContinuousLearningValidationIssue[];
  hash: string;
  recordHashes: readonly string[];
}>;

export type ContinuousLearningSearchQuery = Readonly<{
  signalKind?: ContinuousLearningSignalKind | null;
  concept?: string | null;
  domain?: string | null;
  source?: string | null;
  lesson?: string | null;
  case?: string | null;
  pattern?: string | null;
  knowledgeUpdate?: string | null;
  decisionMemory?: string | null;
  reviewerImprovement?: string | null;
  keyword?: string | null;
  reviewerId?: string | null;
  disagreementGroupId?: string | null;
}>;

export type ContinuousLearningSearchResult = Readonly<{
  record: ContinuousLearningRecord;
  score: number;
  reasons: readonly string[];
}>;

export type ContinuousLearningCoverageReport = Readonly<{
  framework: string;
  recordCount: number;
  signalKindCount: number;
  versionCount: number;
  domainCount: number;
  conceptCount: number;
  lessonCount: number;
  caseCount: number;
  patternCount: number;
  knowledgeUpdateCount: number;
  decisionMemoryCount: number;
  reviewerImprovementCount: number;
  duplicateIdCount: number;
  coveragePercent: number;
  productionReadiness: number;
  readyForLearning: boolean;
  warnings: readonly string[];
  gaps: readonly string[];
  hash: string;
}>;

export type ContinuousLearningRegistry = Readonly<{
  records: readonly ContinuousLearningRecord[];
  validation: ContinuousLearningValidationResult;
  hash: string;
  list: () => readonly ContinuousLearningRecord[];
  get: (id: string) => ContinuousLearningRecord | null;
  register: (record: ContinuousLearningRecord) => ContinuousLearningRegistry;
  unregister: (id: string) => boolean;
  search: (query: ContinuousLearningSearchQuery) => readonly ContinuousLearningSearchResult[];
}>;
