import type { DecisionRecord } from "../decisionRecords/decisionRecordTypes.js";
import type { KnowledgeAcquisitionRecord } from "../knowledgeAcquisition/schema/knowledgeAcquisitionTypes.js";
import type { ProductionCertificationMetric } from "./productionCertificationTypes.js";

export type HumanReviewerAlignmentScorecard = Readonly<{
  reviewerId: string;
  reviewerName: string;
  domain: string;
  totalScripts: number;
  precision: number;
  recall: number;
  articleSelectionAccuracy: number;
  confidenceAlignment: number;
  reasoningAlignment: number;
  reviewerDrift: number;
  knowledgeGaps: readonly string[];
  articleWeaknesses: readonly string[];
  learningPriorities: readonly string[];
  readinessPercent: number;
  warnings: readonly string[];
  gaps: readonly string[];
  sourceHash: string;
  hash: string;
}>;

export type HumanReviewerAlignmentReport = Readonly<{
  framework: string;
  generatedAt: string;
  recordCount: number;
  reviewerCount: number;
  reviewedScriptCount: number;
  humanFindingCount: number;
  decisionRecordCount: number;
  reviewerScorecards: readonly HumanReviewerAlignmentScorecard[];
  metrics: readonly ProductionCertificationMetric[];
  reviewerDrift: number;
  knowledgeGaps: readonly string[];
  articleWeaknesses: readonly string[];
  learningPriorities: readonly string[];
  readinessPercent: number;
  readyForProduction: boolean;
  warnings: readonly string[];
  gaps: readonly string[];
  hash: string;
}>;

export type HumanReviewerAlignmentInput = Readonly<{
  knowledgeAcquisitionRecords: readonly KnowledgeAcquisitionRecord[];
  decisionRecords: readonly DecisionRecord[];
}>;
