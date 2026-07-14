export type DecisionRecordVersion = Readonly<{
  major: number;
  minor: number;
  patch: number;
}>;

export type DecisionRecordGCAMMapping = Readonly<{
  article_id: number;
  atom_ids: readonly string[];
  note: string | null;
}>;

export type DecisionRecord = Readonly<{
  id: string;
  version: string;
  title: string;
  summary: string;
  originalScenario: string;
  reviewQuestion: string;
  initialSuspicion: string;
  possibleConcepts: readonly string[];
  supportingEvidence: readonly string[];
  contradictingEvidence: readonly string[];
  requiredMissingEvidence: readonly string[];
  sceneContext: string;
  speakerAnalysis: string;
  targetAnalysis: string;
  intentAnalysis: string;
  reasoningSteps: readonly string[];
  reviewerDecision: string;
  confidence: string;
  findingType: string;
  gcamMappings: readonly DecisionRecordGCAMMapping[];
  falsePositiveRisk: string;
  reviewerNotes: string;
  benchmarkTags: readonly string[];
  relatedLessons: readonly string[];
  relatedPatterns: readonly string[];
  relatedBlueprintConcepts: readonly string[];
}>;

export type DecisionRecordSearchQuery = Readonly<{
  concept?: string | null;
  lesson?: string | null;
  pattern?: string | null;
  article?: number | null;
  benchmarkTag?: string | null;
  confidence?: string | null;
  target?: string | null;
  intent?: string | null;
  keyword?: string | null;
}>;

export type DecisionRecordSearchResult = Readonly<{
  record: DecisionRecord;
  score: number;
  reasons: readonly string[];
}>;

export type DecisionRecordValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type DecisionRecordValidationResult = Readonly<{
  valid: boolean;
  issues: readonly DecisionRecordValidationIssue[];
  hash: string;
}>;

export type DecisionRecordRegistryValidation = Readonly<{
  valid: boolean;
  issues: readonly DecisionRecordValidationIssue[];
  hash: string;
  recordHashes: readonly string[];
}>;

export type DecisionRecordRegistry = Readonly<{
  rootDir: string;
  records: readonly DecisionRecord[];
  validation: DecisionRecordRegistryValidation;
  hash: string;
  list: () => readonly DecisionRecord[];
  get: (id: string) => DecisionRecord | null;
  register: (record: DecisionRecord) => void;
  unregister: (id: string) => void;
  search: (query: DecisionRecordSearchQuery) => readonly DecisionRecordSearchResult[];
}>;
