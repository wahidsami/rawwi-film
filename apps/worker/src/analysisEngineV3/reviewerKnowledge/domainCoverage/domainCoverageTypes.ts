export type DomainCoverageSeverity = "error" | "warning";

export type DomainCoverageIssue = Readonly<{
  severity: DomainCoverageSeverity;
  code: string;
  path: string;
  message: string;
}>;

export type DomainCoverageValidationResult = Readonly<{
  valid: boolean;
  issues: readonly DomainCoverageIssue[];
  hash: string;
}>;

export type DomainCoverageSection = Readonly<{
  title: string;
  present: number;
  expected: number;
  coveragePercent: number;
  missing: readonly string[];
  warnings: readonly string[];
  notes: readonly string[];
  hash: string;
}>;

export type DomainCoverageTopicMetric = Readonly<{
  id: string;
  title: string;
  present: number;
  expected: number;
  coveragePercent: number;
  evidence: readonly string[];
  missing: readonly string[];
}>;

export type DomainCoverageMetrics = Readonly<{
  conceptCount: number;
  duplicateConceptCount: number;
  missingConceptCount: number;
  missingPatternCoverage: number;
  missingDecisionCoverage: number;
  missingBenchmarkCoverage: number;
  glossaryCoverage: number;
  crossSentenceCoverage: number;
  crossSceneCoverage: number;
  descriptionCoverage: number;
  dialogueCoverage: number;
  observationCoverage: number;
  contextsCoverage: number;
  targetsCoverage: number;
  actionsCoverage: number;
  intentsCoverage: number;
  relationshipsCoverage: number;
  evidenceRulesCoverage: number;
  exceptionsCoverage: number;
  falsePositivesCoverage: number;
  falseNegativesCoverage: number;
  reviewerQuestionsCoverage: number;
  methodologyCoverage: number;
  gcamMappingCoverage: number;
  topics: readonly DomainCoverageTopicMetric[];
  hash: string;
}>;

export type DomainCoverageReport = Readonly<{
  domainId: string;
  domainTitle: string;
  domainVersion: string;
  blueprint: DomainCoverageSection;
  knowledgePack: DomainCoverageSection;
  lessons: DomainCoverageSection;
  patterns: DomainCoverageSection;
  decisionRecords: DomainCoverageSection;
  benchmarks: DomainCoverageSection;
  metrics: DomainCoverageMetrics;
  productionReadiness: number;
  recommendation: "READY" | "NOT READY";
  coverageGaps: readonly string[];
  criticalGaps: readonly string[];
  warnings: readonly string[];
  hash: string;
}>;

export type DomainCoverageRegistryEntry = Readonly<{
  domainId: string;
  report: DomainCoverageReport;
}>;

export type DomainCoverageRegistry = Readonly<{
  rootDir: string;
  domains: readonly string[];
  reports: readonly DomainCoverageRegistryEntry[];
  hash: string;
  list: () => readonly DomainCoverageRegistryEntry[];
  get: (domainId: string) => DomainCoverageReport | null;
  analyze: (domainId: string) => DomainCoverageReport;
  refresh: () => void;
}>;

