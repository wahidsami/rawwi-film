export type KnowledgeRegistryKind =
  | "academy_pack_document"
  | "academy_pack"
  | "lesson"
  | "pattern_document"
  | "pattern_entry"
  | "blueprint_document"
  | "blueprint_entry"
  | "decision_record"
  | "knowledge_acquisition_record"
  | "gcam_knowledge_record";

export type KnowledgeRegistryTraceability = Readonly<{
  source: string | null;
  sourceKind: string;
  sourcePath: string | null;
  sourceDocumentId: string | null;
  sourcePage: number | null;
  reviewer: string | null;
  meeting: string | null;
  date: string | null;
}>;

export type KnowledgeRegistryExplainability = Readonly<{
  summary: string;
  evidence: readonly string[];
  reasoning: readonly string[];
  decision: string | null;
  confidence: number | null;
  alternativeInterpretations: readonly string[];
  rejectedInterpretations: readonly string[];
}>;

export type KnowledgeRegistryMetadata = Readonly<{
  id: string;
  title: string;
  description: string;
  version: string | null;
  kind: KnowledgeRegistryKind;
  domain: string | null;
  category: string | null;
  tags: readonly string[];
  aliases: readonly string[];
  relatedIds: readonly string[];
  createdAt: string | null;
  updatedAt: string | null;
  hash: string;
}>;

export type KnowledgeRegistryEntry = Readonly<{
  registryKey: string;
  metadata: KnowledgeRegistryMetadata;
  traceability: KnowledgeRegistryTraceability;
  explainability: KnowledgeRegistryExplainability;
  payload: Readonly<Record<string, unknown>>;
}>;

export type KnowledgeRegistryValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type KnowledgeRegistryValidationResult = Readonly<{
  valid: boolean;
  issues: readonly KnowledgeRegistryValidationIssue[];
  hash: string;
}>;

export type KnowledgeRegistryStatistics = Readonly<{
  totalCount: number;
  kindCounts: Readonly<Record<KnowledgeRegistryKind | string, number>>;
  sourceCounts: Readonly<Record<string, number>>;
  domainCounts: Readonly<Record<string, number>>;
  traceabilityCoverage: number;
  explainabilityCoverage: number;
  duplicateIdCount: number;
  missingMetadataCount: number;
  missingReferenceCount: number;
  circularReferenceCount: number;
  orphanCount: number;
  coveragePercent: number;
  productionReadiness: number;
  hash: string;
}>;

export type KnowledgeRegistryReport = Readonly<{
  rootDir: string;
  entries: readonly KnowledgeRegistryEntry[];
  validation: KnowledgeRegistryValidationResult;
  statistics: KnowledgeRegistryStatistics;
  hash: string;
  list: () => readonly KnowledgeRegistryEntry[];
  get: (registryKey: string) => KnowledgeRegistryEntry | null;
  listByKind: (kind: KnowledgeRegistryKind) => readonly KnowledgeRegistryEntry[];
}>;
