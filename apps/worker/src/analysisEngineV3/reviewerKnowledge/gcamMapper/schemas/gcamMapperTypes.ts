export type GcamMapperDocumentHeader = Readonly<{
  schema_version: 1;
  version: string;
  id: string;
  title: string;
  description: string;
}>;

export type GcamMapperMatchCriteria = Readonly<{
  concepts: readonly string[];
  domains: readonly string[];
  targets: readonly string[];
  actions: readonly string[];
  intents: readonly string[];
  contexts: readonly string[];
}>;

export type GcamMapperArticleMapping = Readonly<{
  id: string;
  version: string;
  title: string;
  description: string;
  articleId: number;
  articleNumber: string;
  articleTitleAr: string;
  findingTitle: string;
  findingCategory: string;
  concepts: readonly string[];
  domains: readonly string[];
  targets: readonly string[];
  actions: readonly string[];
  intents: readonly string[];
  contexts: readonly string[];
  relatedMappingIds: readonly string[];
  evidenceExamples: readonly string[];
  reviewerExplanation: string;
  mappingNotes: string;
}>;

export type GcamMapperAtomMapping = Readonly<{
  id: string;
  version: string;
  title: string;
  description: string;
  articleMappingId: string;
  articleId: number;
  articleNumber: string;
  articleTitleAr: string;
  atomId: string;
  atomNumber: string;
  atomTitleAr: string;
  findingTitle: string;
  findingCategory: string;
  concepts: readonly string[];
  domains: readonly string[];
  targets: readonly string[];
  actions: readonly string[];
  intents: readonly string[];
  contexts: readonly string[];
  relatedMappingIds: readonly string[];
  evidenceExamples: readonly string[];
  reviewerExplanation: string;
  mappingNotes: string;
}>;

export type GcamMapperRule = Readonly<{
  id: string;
  version: string;
  title: string;
  description: string;
  priority: number;
  match: GcamMapperMatchCriteria;
  articleMappingId: string;
  atomMappingId: string | null;
  relatedRuleIds: readonly string[];
  debtNote: string;
}>;

export type GcamMapperInput = Readonly<{
  concepts: readonly string[];
  domains: readonly string[];
  targets: readonly string[];
  actions: readonly string[];
  intents: readonly string[];
  contexts: readonly string[];
  evidence: readonly string[];
  reviewerJudgment: string;
  confidence: number;
}>;

export type GcamMapperDebt = Readonly<{
  id: string;
  concept: string;
  reason: string;
  source: string;
  confidence: number;
  relatedRuleIds: readonly string[];
}>;

export type GcamMapperResult = Readonly<{
  status: "MAPPED" | "UNMAPPED";
  articleId: number | null;
  articleNumber: string | null;
  articleTitleAr: string | null;
  atomId: string | null;
  atomNumber: string | null;
  atomTitleAr: string | null;
  findingTitle: string;
  findingCategory: string;
  reviewerExplanation: string;
  supportingEvidence: readonly string[];
  matchedRuleId: string | null;
  matchedArticleMappingId: string | null;
  matchedAtomMappingId: string | null;
  confidence: number;
  mappingDebt: readonly GcamMapperDebt[];
  hash: string;
}>;

export type GcamMapperValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type GcamMapperValidationResult = Readonly<{
  valid: boolean;
  issues: readonly GcamMapperValidationIssue[];
  hash: string;
}>;

export type GcamMapperCoverageReport = Readonly<{
  framework: "GCAM Mapping Layer";
  version: string;
  articleMappingCount: number;
  atomMappingCount: number;
  ruleCount: number;
  mappedConceptCount: number;
  unmappedConceptCount: number;
  mappingDebtCount: number;
  duplicateMappingCount: number;
  missingMappingCount: number;
  circularMappingCount: number;
  versionConsistency: boolean;
  coveragePercentage: number;
  productionReadiness: boolean;
  status: "LOCKED" | "READY" | "NOT_READY";
  mappedConcepts: readonly string[];
  unmappedConcepts: readonly string[];
  mappingDebt: readonly GcamMapperDebt[];
  warnings: readonly string[];
  hash: string;
}>;

export type GcamMapperCatalog = Readonly<{
  articleMappings: readonly GcamMapperArticleMapping[];
  atomMappings: readonly GcamMapperAtomMapping[];
  mappingRules: readonly GcamMapperRule[];
  version: string;
}>;

export type GcamMapperRegistry = Readonly<{
  catalog: GcamMapperCatalog;
  validation: GcamMapperValidationResult;
  hash: string;
  listArticleMappings: () => readonly GcamMapperArticleMapping[];
  listAtomMappings: () => readonly GcamMapperAtomMapping[];
  listRules: () => readonly GcamMapperRule[];
  getArticleMapping: (id: string) => GcamMapperArticleMapping | null;
  getAtomMapping: (id: string) => GcamMapperAtomMapping | null;
  getRule: (id: string) => GcamMapperRule | null;
  map: (input: GcamMapperInput) => GcamMapperResult;
}>;
