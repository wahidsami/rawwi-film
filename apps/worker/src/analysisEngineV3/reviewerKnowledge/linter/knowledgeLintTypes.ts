export type KnowledgeLintSeverity = "error" | "warning";

export type KnowledgeLintMessage = Readonly<{
  code: string;
  severity: KnowledgeLintSeverity;
  path: string;
  message: string;
}>;

export type KnowledgeLintMetadata = Readonly<{
  id: string;
  version: string;
  title: string;
  category: string;
  language: string;
  description: string;
}>;

export type KnowledgeLintEvidenceTier = Readonly<{
  minimum: readonly string[];
  strong: readonly string[];
  weak: readonly string[];
  insufficient: readonly string[];
}>;

export type KnowledgeLintQuestion = Readonly<{
  id: string;
  category: string;
  purpose: string;
  expectedAnswerFormat: string;
  reasoningGuidance: string;
  evidenceRequirements: readonly string[];
}>;

export type KnowledgeLintReportTemplate = Readonly<{
  findingTitle: string;
  reasonTemplate: string;
  recommendationTemplate: string;
  severity: "low" | "medium" | "high" | "critical";
  priority: number;
  reportCategory: string;
}>;

export type KnowledgeLintConfidenceRule = Readonly<{
  threshold: number;
  label: string;
}>;

export type KnowledgeLintGlossaryEntry = Readonly<{
  id: string;
  term: string;
  definition: string;
  aliases: readonly string[];
  conceptIds: readonly string[];
  notes: readonly string[];
}>;

export type KnowledgeLintRelationship = Readonly<{
  parentConceptId: string;
  childConceptId: string;
  type: string;
  note: string | null;
}>;

export type KnowledgeLintArticleMapping = Readonly<{
  articleId: number;
  articleTitle: string;
  articleNumber: string;
  atomNumber: string | null;
  reportTitle: string;
  note: string | null;
}>;

export type KnowledgeLintConcept = Readonly<{
  id: string;
  name: string;
  definition: string;
  examples: readonly string[];
  counterExamples: readonly string[];
  borderlineExamples: readonly string[];
  educationalExamples: readonly string[];
  fictionExamples: readonly string[];
  reviewerQuestions: readonly KnowledgeLintQuestion[];
  evidence: KnowledgeLintEvidenceTier;
  exceptions: readonly string[];
  falsePositives: readonly string[];
  falseNegatives: readonly string[];
  reportTemplate: KnowledgeLintReportTemplate;
  confidenceRules: readonly KnowledgeLintConfidenceRule[];
  glossaryIds: readonly string[];
  articleMappings: readonly KnowledgeLintArticleMapping[];
  parentConceptId: string | null;
  childConceptIds: readonly string[];
  notes: readonly string[];
}>;

export type KnowledgeLintPack = Readonly<{
  metadata: KnowledgeLintMetadata;
  concepts: readonly KnowledgeLintConcept[];
  glossary: readonly KnowledgeLintGlossaryEntry[];
  relationships: readonly KnowledgeLintRelationship[];
  sourcePath: string | null;
  notes: readonly string[];
}>;

export type KnowledgeLintStatistics = Readonly<{
  conceptCount: number;
  glossaryEntryCount: number;
  exampleCount: number;
  relationshipCount: number;
  coveragePercentage: number;
  validationScore: number;
  warningCount: number;
  errorCount: number;
  duplicateCount: number;
  unusedCount: number;
}>;

export type KnowledgeLintCoverage = Readonly<{
  metadata: number;
  concepts: number;
  evidence: number;
  exceptions: number;
  reviewerQuestions: number;
  glossary: number;
  relationships: number;
  gcamMapping: number;
  reportTemplate: number;
  confidence: number;
  examples: number;
}>;

export type KnowledgeLintPackScore = Readonly<{
  score: number;
  completeness: number;
  consistency: number;
  specificity: number;
}>;

export type KnowledgeLintOverallScore = Readonly<{
  score: number;
  readyForAcademy: boolean;
}>;

export type KnowledgeLintReport = Readonly<{
  metadata: KnowledgeLintMetadata;
  sourcePath: string | null;
  errors: readonly KnowledgeLintMessage[];
  warnings: readonly KnowledgeLintMessage[];
  statistics: KnowledgeLintStatistics;
  coverage: KnowledgeLintCoverage;
  packScore: KnowledgeLintPackScore;
  overallScore: KnowledgeLintOverallScore;
  stableHash: string;
}>;

export type KnowledgeLintRegistryEntry = Readonly<{
  pack: KnowledgeLintPack;
  report: KnowledgeLintReport;
}>;

