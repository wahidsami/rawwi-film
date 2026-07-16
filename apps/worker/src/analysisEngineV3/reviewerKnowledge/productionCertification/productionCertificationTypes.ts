import type { CaseLibraryCoverageReport } from "../caseLibrary/caseLibraryTypes.js";
import type { ContinuousLearningCoverageReport } from "../continuousLearning/continuousLearningTypes.js";
import type { DecisionMemoryCoverageReport } from "../decisionMemory/decisionMemoryTypes.js";
import type { DomainCoverageReport } from "../domainCoverage/domainCoverageTypes.js";
import type { GcamKnowledgeCoverageReport } from "../gcamKnowledge/schemas/gcamKnowledgeTypes.js";
import type { KnowledgeAcquisitionCoverageReport } from "../knowledgeAcquisition/schema/knowledgeAcquisitionTypes.js";
import type { PrecedentEngineReport } from "../precedentEngine/precedentEngineTypes.js";
import type { HumanReviewerAlignmentReport } from "./humanReviewerAlignmentTypes.js";

export type ProductionCertificationMetricDirection = "higher_is_better" | "lower_is_better";

export type ProductionCertificationMetricUnit = "percent" | "count" | "ms" | "score";

export type ProductionCertificationMetric = Readonly<{
  id: string;
  label: string;
  value: number;
  unit: ProductionCertificationMetricUnit;
  direction: ProductionCertificationMetricDirection;
  basis: string;
}>;

export type ProductionCertificationScorecardCategory = "reviewer" | "module" | "knowledge";

export type ProductionCertificationScorecard = Readonly<{
  id: string;
  title: string;
  category: ProductionCertificationScorecardCategory;
  readinessPercent: number;
  metrics: readonly ProductionCertificationMetric[];
  warnings: readonly string[];
  gaps: readonly string[];
  ready: boolean;
  sourceHash: string;
  hash: string;
}>;

export type ProductionCertificationReadinessReport = Readonly<{
  id: string;
  title: string;
  ready: boolean;
  readinessPercent: number;
  basis: string;
  warnings: readonly string[];
  gaps: readonly string[];
}>;

export type ProductionCertificationCoverageReports = Readonly<{
  reviewerDomains: readonly DomainCoverageReport[];
  knowledgeAcquisition: KnowledgeAcquisitionCoverageReport;
  gcamKnowledge: GcamKnowledgeCoverageReport;
  caseLibrary: CaseLibraryCoverageReport;
  decisionMemory: DecisionMemoryCoverageReport;
  precedentEngine: PrecedentEngineReport;
  continuousLearning: ContinuousLearningCoverageReport;
  humanReviewerAlignment: HumanReviewerAlignmentReport;
}>;

export type ProductionCertificationReport = Readonly<{
  framework: string;
  generatedAt: string;
  reviewerScorecards: readonly ProductionCertificationScorecard[];
  moduleScorecards: readonly ProductionCertificationScorecard[];
  knowledgeScorecards: readonly ProductionCertificationScorecard[];
  coverageReports: ProductionCertificationCoverageReports;
  readinessReports: readonly ProductionCertificationReadinessReport[];
  metrics: readonly ProductionCertificationMetric[];
  productionReadiness: number;
  readyForProduction: boolean;
  warnings: readonly string[];
  gaps: readonly string[];
  hash: string;
}>;
