import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createCaseLibraryCoverageReport } from "../caseLibrary/caseLibraryCoverage.js";
import { createCaseLibraryRegistry } from "../caseLibrary/caseLibrary.js";
import { createContinuousLearningCoverageReport } from "../continuousLearning/continuousLearningCoverage.js";
import { createDefaultContinuousLearningRegistry } from "../continuousLearning/continuousLearningRegistry.js";
import { createDecisionMemoryCoverageReport } from "../decisionMemory/decisionMemoryCoverage.js";
import { createDecisionMemoryRegistry } from "../decisionMemory/decisionMemory.js";
import { createDecisionRecordRegistry } from "../decisionRecords/decisionRecordRegistry.js";
import { createDomainCoverageRegistry } from "../domainCoverage/domainCoverageRegistry.js";
import type { DomainCoverageReport } from "../domainCoverage/domainCoverageTypes.js";
import { createHumanReviewerAlignmentReport } from "./humanReviewerAlignmentCoverage.js";
import { createGcamKnowledgeLoader } from "../gcamKnowledge/gcamKnowledgeLoader.js";
import { createGcamKnowledgeRegistry } from "../gcamKnowledge/gcamKnowledgeRegistry.js";
import { computeGcamKnowledgeCoverageReport } from "../gcamKnowledge/coverage/gcamKnowledgeCoverage.js";
import { loadGcamKnowledgeRegistryFromDirectory } from "../gcamKnowledge/registries/gcamKnowledgeRegistry.js";
import { createKnowledgeAcquisitionCoverageReport } from "../knowledgeAcquisition/coverage/knowledgeAcquisitionCoverage.js";
import { createKnowledgeAssetRegistryFromDirectory } from "../knowledgeAcquisition/knowledgeAssets/knowledgeAssetRegistry.js";
import type { KnowledgeAcquisitionRecord } from "../knowledgeAcquisition/schema/knowledgeAcquisitionTypes.js";
import { createPrecedentEngineRegistry } from "../precedentEngine/precedentEngine.js";
import { createPrecedentEngineCoverageReport } from "../precedentEngine/precedentEngineCoverage.js";
import type {
  ProductionCertificationCoverageReports,
  ProductionCertificationMetric,
  ProductionCertificationMetricDirection,
  ProductionCertificationMetricUnit,
  ProductionCertificationReadinessReport,
  ProductionCertificationReport,
  ProductionCertificationScorecard,
  ProductionCertificationScorecardCategory,
} from "./productionCertificationTypes.js";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE_ACQUISITION_FOLDERS = Object.freeze([
  "knowledgeAssets",
  "reviewerNotes",
  "reviewerExamples",
  "reviewerCorrections",
  "reviewerDisagreements",
  "reviewerObservations",
  "knowledgeEvolution",
]);

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort((left, right) => left.localeCompare(right)).map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function averagePercent(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return clampPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function metric(
  id: string,
  label: string,
  value: number,
  unit: ProductionCertificationMetricUnit,
  direction: ProductionCertificationMetricDirection,
  basis: string,
): ProductionCertificationMetric {
  return Object.freeze({
    id,
    label,
    value: unit === "ms" ? Math.max(0, Math.round(value)) : clampPercent(value),
    unit,
    direction,
    basis,
  });
}

function scorecardMetricsFromDomain(report: DomainCoverageReport): readonly ProductionCertificationMetric[] {
  const sectionCoverage = [
    report.blueprint.coveragePercent,
    report.knowledgePack.coveragePercent,
    report.lessons.coveragePercent,
    report.patterns.coveragePercent,
    report.decisionRecords.coveragePercent,
    report.benchmarks.coveragePercent,
  ];
  const topicCoverage = report.metrics.topics.map((topic) => topic.coveragePercent);

  return Object.freeze([
    metric("reviewer_precision", "Reviewer Precision", averagePercent(sectionCoverage), "percent", "higher_is_better", "Average of blueprint, knowledge pack, lessons, pattern, decision record, and benchmark coverage."),
    metric("reviewer_recall", "Reviewer Recall", averagePercent(topicCoverage), "percent", "higher_is_better", "Average of all topic coverage metrics."),
    metric("knowledge_coverage", "Knowledge Coverage", averagePercent([report.knowledgePack.coveragePercent, report.lessons.coveragePercent, report.patterns.coveragePercent]), "percent", "higher_is_better", "Average of knowledge pack, lesson, and pattern coverage."),
    metric("reasoning_quality", "Reasoning Quality", averagePercent([
      report.metrics.contextsCoverage,
      report.metrics.targetsCoverage,
      report.metrics.actionsCoverage,
      report.metrics.intentsCoverage,
      report.metrics.relationshipsCoverage,
      report.metrics.evidenceRulesCoverage,
      report.metrics.methodologyCoverage,
      report.metrics.gcamMappingCoverage,
    ]), "percent", "higher_is_better", "Average of reasoning-oriented topic coverage."),
    metric("false_positives", "False Positives", 100 - averagePercent([report.metrics.falsePositivesCoverage]), "percent", "lower_is_better", "Derived deficit score from false-positive coverage."),
    metric("false_negatives", "False Negatives", 100 - averagePercent([report.metrics.falseNegativesCoverage]), "percent", "lower_is_better", "Derived deficit score from false-negative coverage."),
    metric("context_understanding", "Context Understanding", averagePercent([
      report.metrics.glossaryCoverage,
      report.metrics.crossSentenceCoverage,
      report.metrics.crossSceneCoverage,
      report.metrics.descriptionCoverage,
      report.metrics.dialogueCoverage,
      report.metrics.observationCoverage,
      report.metrics.contextsCoverage,
    ]), "percent", "higher_is_better", "Average of context-sensitive topic coverage."),
    metric("evidence_quality", "Evidence Quality", averagePercent([
      report.metrics.evidenceRulesCoverage,
      report.metrics.exceptionsCoverage,
      report.metrics.falsePositivesCoverage,
      report.metrics.falseNegativesCoverage,
    ]), "percent", "higher_is_better", "Average of evidence and exception coverage."),
    metric("decision_stability", "Decision Stability", averagePercent([report.decisionRecords.coveragePercent, report.benchmarks.coveragePercent]), "percent", "higher_is_better", "Average of decision-record and benchmark coverage."),
    metric("determinism", "Determinism", 100, "percent", "higher_is_better", "Domain coverage report hash is produced by stable serialization."),
    metric("latency", "Latency", 0, "ms", "lower_is_better", "Offline certification does not measure runtime latency."),
    metric("explainability", "Explainability", averagePercent([
      report.metrics.reviewerQuestionsCoverage,
      report.metrics.methodologyCoverage,
      report.metrics.gcamMappingCoverage,
    ]), "percent", "higher_is_better", "Average of reviewer-question, methodology, and GCAM mapping coverage."),
    metric("consensus_quality", "Consensus Quality", averagePercent([
      report.decisionRecords.coveragePercent,
      report.metrics.falsePositivesCoverage,
      report.metrics.falseNegativesCoverage,
    ]), "percent", "higher_is_better", "Decision and exception balance used as a consensus proxy."),
    metric("arbitration_accuracy", "Arbitration Accuracy", averagePercent([report.decisionRecords.coveragePercent, report.benchmarks.coveragePercent]), "percent", "higher_is_better", "Decision-record and benchmark coverage used as an arbitration proxy."),
    metric("self_critique_accuracy", "Self Critique Accuracy", averagePercent([
      report.metrics.falsePositivesCoverage,
      report.metrics.falseNegativesCoverage,
      report.metrics.exceptionsCoverage,
    ]), "percent", "higher_is_better", "Average of false-positive, false-negative, and exception coverage."),
  ]);
}

function scorecardHashInput(scorecard: Omit<ProductionCertificationScorecard, "hash">): string {
  return hashValue(scorecard);
}

function buildScorecard(
  id: string,
  title: string,
  category: ProductionCertificationScorecardCategory,
  readinessPercent: number,
  metrics: readonly ProductionCertificationMetric[],
  warnings: readonly string[],
  gaps: readonly string[],
  sourceHash: string,
): ProductionCertificationScorecard {
  const scorecard = Object.freeze({
    id,
    title,
    category,
    readinessPercent: clampPercent(readinessPercent),
    metrics: Object.freeze([...metrics]),
    warnings: Object.freeze([...warnings]),
    gaps: Object.freeze([...gaps]),
    ready: clampPercent(readinessPercent) >= 90 && warnings.length === 0 && gaps.length === 0,
    sourceHash,
  } satisfies Omit<ProductionCertificationScorecard, "hash">);

  return Object.freeze({
    ...scorecard,
    hash: scorecardHashInput(scorecard),
  });
}

function loadKnowledgeAcquisitionRecords(rootDir: string): readonly KnowledgeAcquisitionRecord[] {
  const records = new Map<string, KnowledgeAcquisitionRecord>();
  for (const folder of KNOWLEDGE_ACQUISITION_FOLDERS) {
    const directory = join(rootDir, "knowledgeAcquisition", folder);
    if (!isDirectory(directory)) {
      continue;
    }
    const registry = createKnowledgeAssetRegistryFromDirectory(directory);
    for (const record of registry.list()) {
      records.set(record.id, record);
    }
  }
  return Object.freeze([...records.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function buildReadinessReport(
  id: string,
  title: string,
  ready: boolean,
  readinessPercent: number,
  basis: string,
  warnings: readonly string[],
  gaps: readonly string[],
): ProductionCertificationReadinessReport {
  return Object.freeze({
    id,
    title,
    ready,
    readinessPercent: clampPercent(readinessPercent),
    basis,
    warnings: Object.freeze([...warnings]),
    gaps: Object.freeze([...gaps]),
  });
}

function buildReviewerScorecards(domainReports: readonly DomainCoverageReport[]): readonly ProductionCertificationScorecard[] {
  return Object.freeze(domainReports.map((report) =>
    buildScorecard(
      report.domainId,
      report.domainTitle,
      "reviewer",
      report.productionReadiness,
      scorecardMetricsFromDomain(report),
      report.warnings,
      [...report.coverageGaps, ...report.criticalGaps],
      report.hash,
    )));
}

function buildModuleScorecards(coverageReports: ProductionCertificationCoverageReports): readonly ProductionCertificationScorecard[] {
  const knowledgeAcquisition = coverageReports.knowledgeAcquisition;
  const gcamKnowledge = coverageReports.gcamKnowledge;
  const caseLibrary = coverageReports.caseLibrary;
  const decisionMemory = coverageReports.decisionMemory;
  const precedentEngine = coverageReports.precedentEngine;
  const continuousLearning = coverageReports.continuousLearning;

  return Object.freeze([
    buildScorecard(
      "knowledge_acquisition",
      knowledgeAcquisition.framework,
      "module",
      knowledgeAcquisition.productionReadiness,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", knowledgeAcquisition.coveragePercent, "percent", "higher_is_better", "Knowledge acquisition coverage percent."),
        metric("determinism", "Determinism", 100, "percent", "higher_is_better", "Coverage report is derived from stable serialization."),
        metric("latency", "Latency", 0, "ms", "lower_is_better", "Offline certification does not measure runtime latency."),
      ]),
      knowledgeAcquisition.warnings,
      knowledgeAcquisition.gaps,
      knowledgeAcquisition.hash,
    ),
    buildScorecard(
      "gcam_knowledge",
      gcamKnowledge.framework,
      "module",
      gcamKnowledge.knowledgeCapacityPercent,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", gcamKnowledge.knowledgeCapacityPercent, "percent", "higher_is_better", "GCAM knowledge capacity percent."),
        metric("determinism", "Determinism", 100, "percent", "higher_is_better", "Registry coverage is derived from stable serialization."),
        metric("latency", "Latency", 0, "ms", "lower_is_better", "Offline certification does not measure runtime latency."),
      ]),
      gcamKnowledge.warnings,
      gcamKnowledge.missingCoverage,
      gcamKnowledge.hash,
    ),
    buildScorecard(
      "case_library",
      caseLibrary.framework,
      "module",
      caseLibrary.caseCoveragePercent,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", caseLibrary.caseCoveragePercent, "percent", "higher_is_better", "Case coverage percent."),
        metric("precision", "Reviewer Precision", caseLibrary.articleCoveragePercent, "percent", "higher_is_better", "Article coverage as a case-library precision proxy."),
        metric("latency", "Latency", 0, "ms", "lower_is_better", "Offline certification does not measure runtime latency."),
      ]),
      caseLibrary.warnings,
      caseLibrary.missingCoverage,
      caseLibrary.hash,
    ),
    buildScorecard(
      "decision_memory",
      decisionMemory.framework,
      "module",
      decisionMemory.decisionCoveragePercent,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", decisionMemory.decisionCoveragePercent, "percent", "higher_is_better", "Decision coverage percent."),
        metric("precision", "Reviewer Precision", decisionMemory.articleCoveragePercent, "percent", "higher_is_better", "Article coverage as a decision-memory precision proxy."),
        metric("latency", "Latency", 0, "ms", "lower_is_better", "Offline certification does not measure runtime latency."),
      ]),
      decisionMemory.warnings,
      decisionMemory.missingCoverage,
      decisionMemory.hash,
    ),
    buildScorecard(
      "precedent_engine",
      "GCAM Reviewer Precedent Engine",
      "module",
      precedentEngine.precedentCoverage * 100,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", precedentEngine.precedentCoverage * 100, "percent", "higher_is_better", "Precedent coverage percent."),
        metric("consensus_quality", "Consensus Quality", precedentEngine.precedentCoverage * 100, "percent", "higher_is_better", "Precedent coverage used as a consensus proxy."),
        metric("latency", "Latency", 0, "ms", "lower_is_better", "Offline certification does not measure runtime latency."),
      ]),
      [],
      precedentEngine.matches.length > 0 ? [] : ["no precedent matches available"],
      precedentEngine.hash,
    ),
    buildScorecard(
      "continuous_learning",
      continuousLearning.framework,
      "module",
      continuousLearning.productionReadiness,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", continuousLearning.coveragePercent, "percent", "higher_is_better", "Continuous learning coverage percent."),
        metric("self_critique_accuracy", "Self Critique Accuracy", continuousLearning.coveragePercent, "percent", "higher_is_better", "Continuous learning coverage used as self-critique proxy."),
        metric("latency", "Latency", 0, "ms", "lower_is_better", "Offline certification does not measure runtime latency."),
      ]),
      continuousLearning.warnings,
      continuousLearning.gaps,
      continuousLearning.hash,
    ),
  ]);
}

function buildKnowledgeScorecards(coverageReports: ProductionCertificationCoverageReports, reviewerScorecards: readonly ProductionCertificationScorecard[]): readonly ProductionCertificationScorecard[] {
  const reviewerAverage = averagePercent(reviewerScorecards.map((card) => card.readinessPercent));
  const knowledgeAcquisition = coverageReports.knowledgeAcquisition;
  const gcamKnowledge = coverageReports.gcamKnowledge;
  const caseLibrary = coverageReports.caseLibrary;
  const decisionMemory = coverageReports.decisionMemory;
  const precedentEngine = coverageReports.precedentEngine;
  const continuousLearning = coverageReports.continuousLearning;
  const humanReviewerAlignment = coverageReports.humanReviewerAlignment;

  return Object.freeze([
    buildScorecard(
      "reviewer_domains",
      "Reviewer Domains",
      "knowledge",
      reviewerAverage,
      Object.freeze([
        metric("reviewer_precision", "Reviewer Precision", reviewerAverage, "percent", "higher_is_better", "Average reviewer domain readiness."),
        metric("reviewer_recall", "Reviewer Recall", averagePercent(reviewerScorecards.flatMap((card) => card.metrics.filter((metric) => metric.id === "reviewer_recall").map((metric) => metric.value))), "percent", "higher_is_better", "Average reviewer domain recall."),
        metric("determinism", "Determinism", 100, "percent", "higher_is_better", "Reviewer domain coverage reports are stable."),
      ]),
      reviewerScorecards.flatMap((card) => card.warnings),
      reviewerScorecards.flatMap((card) => card.gaps),
      hashValue(reviewerScorecards.map((card) => card.hash)),
    ),
    buildScorecard(
      "knowledge_acquisition_corpus",
      knowledgeAcquisition.framework,
      "knowledge",
      knowledgeAcquisition.productionReadiness,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", knowledgeAcquisition.coveragePercent, "percent", "higher_is_better", "Knowledge acquisition coverage percent."),
        metric("explainability", "Explainability", knowledgeAcquisition.coveragePercent, "percent", "higher_is_better", "Knowledge acquisition readiness used as explainability proxy."),
      ]),
      knowledgeAcquisition.warnings,
      knowledgeAcquisition.gaps,
      knowledgeAcquisition.hash,
    ),
    buildScorecard(
      "gcam_knowledge_catalog",
      gcamKnowledge.framework,
      "knowledge",
      gcamKnowledge.knowledgeCapacityPercent,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", gcamKnowledge.knowledgeCapacityPercent, "percent", "higher_is_better", "GCAM knowledge capacity percent."),
        metric("explainability", "Explainability", gcamKnowledge.readyForGcamImport ? 100 : 0, "percent", "higher_is_better", "GCAM import readiness used as explainability proxy."),
      ]),
      gcamKnowledge.warnings,
      gcamKnowledge.missingCoverage,
      gcamKnowledge.hash,
    ),
    buildScorecard(
      "case_library_corpus",
      caseLibrary.framework,
      "knowledge",
      caseLibrary.caseCoveragePercent,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", caseLibrary.caseCoveragePercent, "percent", "higher_is_better", "Case coverage percent."),
        metric("consensus_quality", "Consensus Quality", caseLibrary.articleCoveragePercent, "percent", "higher_is_better", "Article coverage used as a consensus proxy."),
      ]),
      caseLibrary.warnings,
      caseLibrary.missingCoverage,
      caseLibrary.hash,
    ),
    buildScorecard(
      "decision_memory_corpus",
      decisionMemory.framework,
      "knowledge",
      decisionMemory.decisionCoveragePercent,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", decisionMemory.decisionCoveragePercent, "percent", "higher_is_better", "Decision coverage percent."),
        metric("arbitration_accuracy", "Arbitration Accuracy", decisionMemory.decisionCoveragePercent, "percent", "higher_is_better", "Decision coverage used as an arbitration proxy."),
      ]),
      decisionMemory.warnings,
      decisionMemory.missingCoverage,
      decisionMemory.hash,
    ),
    buildScorecard(
      "precedent_engine_corpus",
      "GCAM Reviewer Precedent Engine",
      "knowledge",
      precedentEngine.precedentCoverage * 100,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", precedentEngine.precedentCoverage * 100, "percent", "higher_is_better", "Precedent coverage percent."),
        metric("decision_stability", "Decision Stability", precedentEngine.precedentCoverage * 100, "percent", "higher_is_better", "Precedent coverage used as a decision-stability proxy."),
      ]),
      [],
      precedentEngine.matches.length > 0 ? [] : ["no precedent matches available"],
      precedentEngine.hash,
    ),
    buildScorecard(
      "continuous_learning_corpus",
      continuousLearning.framework,
      "knowledge",
      continuousLearning.productionReadiness,
      Object.freeze([
        metric("knowledge_coverage", "Knowledge Coverage", continuousLearning.coveragePercent, "percent", "higher_is_better", "Continuous learning coverage percent."),
        metric("continuous_learning_growth", "Continuous Learning Growth", continuousLearning.coveragePercent, "percent", "higher_is_better", "Continuous learning coverage used as a growth proxy."),
      ]),
      continuousLearning.warnings,
      continuousLearning.gaps,
      continuousLearning.hash,
    ),
    buildScorecard(
      "human_reviewer_alignment",
      humanReviewerAlignment.framework,
      "knowledge",
      humanReviewerAlignment.readinessPercent,
      Object.freeze([
        metric("reviewer_precision", "Reviewer Precision", humanReviewerAlignment.metrics.find((metric) => metric.id === "reviewer_precision")?.value ?? 0, "percent", "higher_is_better", "Average reviewer precision across human-alignment scorecards."),
        metric("reviewer_recall", "Reviewer Recall", humanReviewerAlignment.metrics.find((metric) => metric.id === "reviewer_recall")?.value ?? 0, "percent", "higher_is_better", "Average reviewer recall across human-alignment scorecards."),
        metric("confidence_alignment", "Confidence Alignment", humanReviewerAlignment.metrics.find((metric) => metric.id === "confidence_alignment")?.value ?? 0, "percent", "higher_is_better", "Average reviewer confidence alignment."),
      ]),
      humanReviewerAlignment.warnings,
      humanReviewerAlignment.gaps,
      humanReviewerAlignment.hash,
    ),
  ]);
}

function buildSummaryMetrics(
  reviewerScorecards: readonly ProductionCertificationScorecard[],
  moduleScorecards: readonly ProductionCertificationScorecard[],
  knowledgeScorecards: readonly ProductionCertificationScorecard[],
  coverageReports: ProductionCertificationCoverageReports,
  latencyMs: number,
): readonly ProductionCertificationMetric[] {
  const reviewerDomains = reviewerScorecards.filter((card) => card.category === "reviewer");
  const reviewerPrecision = averagePercent(reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "reviewer_precision").map((metric) => metric.value)));
  const reviewerRecall = averagePercent(reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "reviewer_recall").map((metric) => metric.value)));
  const knowledgeCoverage = averagePercent([
    ...moduleScorecards.map((card) => card.readinessPercent),
    ...knowledgeScorecards.map((card) => card.readinessPercent),
  ]);
  const reasoningQuality = averagePercent(reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "reasoning_quality").map((metric) => metric.value)));
  const falsePositives = 100 - averagePercent(reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "false_positives").map((metric) => 100 - metric.value)));
  const falseNegatives = 100 - averagePercent(reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "false_negatives").map((metric) => 100 - metric.value)));
  const contextUnderstanding = averagePercent(reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "context_understanding").map((metric) => metric.value)));
  const evidenceQuality = averagePercent(reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "evidence_quality").map((metric) => metric.value)));
  const decisionStability = averagePercent([
    coverageReports.decisionMemory.decisionCoveragePercent,
    coverageReports.precedentEngine.precedentCoverage * 100,
  ]);
  const determinism = reviewerScorecards.every((card) => card.hash.length > 0) && moduleScorecards.every((card) => card.hash.length > 0) && knowledgeScorecards.every((card) => card.hash.length > 0) ? 100 : 0;
  const explainability = averagePercent([
    coverageReports.knowledgeAcquisition.coveragePercent,
    coverageReports.gcamKnowledge.knowledgeCapacityPercent,
    ...reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "explainability").map((metric) => metric.value)),
  ]);
  const consensusQuality = averagePercent([
    ...reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "consensus_quality").map((metric) => metric.value)),
    coverageReports.decisionMemory.decisionCoveragePercent,
  ]);
  const arbitrationAccuracy = averagePercent([
    coverageReports.decisionMemory.decisionCoveragePercent,
    coverageReports.precedentEngine.precedentCoverage * 100,
  ]);
  const selfCritiqueAccuracy = averagePercent([
    ...reviewerDomains.flatMap((card) => card.metrics.filter((metric) => metric.id === "self_critique_accuracy").map((metric) => metric.value)),
    coverageReports.continuousLearning.coveragePercent,
  ]);
  const continuousLearningGrowth = coverageReports.continuousLearning.coveragePercent;
  const humanReviewerAlignment = coverageReports.humanReviewerAlignment;

  return Object.freeze([
    metric("reviewer_precision", "Reviewer Precision", reviewerPrecision, "percent", "higher_is_better", "Average reviewer precision across domains."),
    metric("reviewer_recall", "Reviewer Recall", reviewerRecall, "percent", "higher_is_better", "Average reviewer recall across domains."),
    metric("knowledge_coverage", "Knowledge Coverage", knowledgeCoverage, "percent", "higher_is_better", "Average readiness across module and knowledge scorecards."),
    metric("reasoning_quality", "Reasoning Quality", reasoningQuality, "percent", "higher_is_better", "Average reviewer reasoning quality across domains."),
    metric("false_positives", "False Positives", falsePositives, "percent", "lower_is_better", "Derived reviewer false-positive deficit."),
    metric("false_negatives", "False Negatives", falseNegatives, "percent", "lower_is_better", "Derived reviewer false-negative deficit."),
    metric("context_understanding", "Context Understanding", contextUnderstanding, "percent", "higher_is_better", "Average reviewer context understanding."),
    metric("evidence_quality", "Evidence Quality", evidenceQuality, "percent", "higher_is_better", "Average reviewer evidence quality."),
    metric("decision_stability", "Decision Stability", decisionStability, "percent", "higher_is_better", "Decision memory and precedent stability."),
    metric("determinism", "Determinism", determinism, "percent", "higher_is_better", "Deterministic hashes across scorecards."),
    metric("latency", "Latency", latencyMs, "ms", "lower_is_better", "Time to build the certification report."),
    metric("explainability", "Explainability", explainability, "percent", "higher_is_better", "Knowledge and GCAM explanation readiness."),
    metric("consensus_quality", "Consensus Quality", consensusQuality, "percent", "higher_is_better", "Consensus proxy from decision memory and precedent coverage."),
    metric("arbitration_accuracy", "Arbitration Accuracy", arbitrationAccuracy, "percent", "higher_is_better", "Arbitration proxy from decision memory and precedent coverage."),
    metric("self_critique_accuracy", "Self Critique Accuracy", selfCritiqueAccuracy, "percent", "higher_is_better", "Self-critique proxy from continuous learning and reviewer coverage."),
    metric("continuous_learning_growth", "Continuous Learning Growth", continuousLearningGrowth, "percent", "higher_is_better", "Continuous learning coverage."),
    metric("human_reviewer_alignment", "Human Reviewer Alignment", humanReviewerAlignment.readinessPercent, "percent", "higher_is_better", "Human reviewer benchmark readiness."),
    metric("human_reviewer_precision", "Human Reviewer Precision", humanReviewerAlignment.metrics.find((metric) => metric.id === "reviewer_precision")?.value ?? 0, "percent", "higher_is_better", "Precision derived from human reviewer alignment scorecards."),
    metric("human_reviewer_recall", "Human Reviewer Recall", humanReviewerAlignment.metrics.find((metric) => metric.id === "reviewer_recall")?.value ?? 0, "percent", "higher_is_better", "Recall derived from human reviewer alignment scorecards."),
  ]);
}

function unionStrings(values: readonly (readonly string[])[]): readonly string[] {
  return Object.freeze([...new Set(values.flat().filter((value) => value.trim().length > 0))].sort((left, right) => left.localeCompare(right)));
}

function buildReadinessReports(
  reviewerScorecards: readonly ProductionCertificationScorecard[],
  moduleScorecards: readonly ProductionCertificationScorecard[],
  knowledgeScorecards: readonly ProductionCertificationScorecard[],
  coverageReports: ProductionCertificationCoverageReports,
): readonly ProductionCertificationReadinessReport[] {
  const reviewerReady = reviewerScorecards.every((card) => card.ready);
  const moduleReady = moduleScorecards.every((card) => card.ready);
  const knowledgeReady = knowledgeScorecards.every((card) => card.ready);
  const humanReviewerAlignment = coverageReports.humanReviewerAlignment;
  return Object.freeze([
    buildReadinessReport(
      "reviewer_domains",
      "Reviewer Domains",
      reviewerReady,
      averagePercent(reviewerScorecards.map((card) => card.readinessPercent)),
      "All reviewer domain scorecards must be ready.",
      unionStrings(reviewerScorecards.map((card) => card.warnings)),
      unionStrings(reviewerScorecards.map((card) => card.gaps)),
    ),
    buildReadinessReport(
      "module_scorecards",
      "Module Scorecards",
      moduleReady,
      averagePercent(moduleScorecards.map((card) => card.readinessPercent)),
      "All module scorecards must be ready.",
      unionStrings(moduleScorecards.map((card) => card.warnings)),
      unionStrings(moduleScorecards.map((card) => card.gaps)),
    ),
    buildReadinessReport(
      "knowledge_scorecards",
      "Knowledge Scorecards",
      knowledgeReady,
      averagePercent(knowledgeScorecards.map((card) => card.readinessPercent)),
      "All knowledge scorecards must be ready.",
      unionStrings(knowledgeScorecards.map((card) => card.warnings)),
      unionStrings(knowledgeScorecards.map((card) => card.gaps)),
    ),
    buildReadinessReport(
      "gcam_knowledge",
      "GCAM Knowledge",
      coverageReports.gcamKnowledge.readyForGcamImport,
      coverageReports.gcamKnowledge.knowledgeCapacityPercent,
      "GCAM knowledge registry must be ready for import.",
      coverageReports.gcamKnowledge.warnings,
      coverageReports.gcamKnowledge.missingCoverage,
    ),
    buildReadinessReport(
      "knowledge_acquisition",
      "Knowledge Acquisition",
      coverageReports.knowledgeAcquisition.readyForAcademy,
      coverageReports.knowledgeAcquisition.productionReadiness,
      "Knowledge acquisition records must be ready for the academy.",
      coverageReports.knowledgeAcquisition.warnings,
      coverageReports.knowledgeAcquisition.gaps,
    ),
    buildReadinessReport(
      "case_library",
      "Case Library",
      coverageReports.caseLibrary.readyForLibrary,
      coverageReports.caseLibrary.caseCoveragePercent,
      "Case library must be ready.",
      coverageReports.caseLibrary.warnings,
      coverageReports.caseLibrary.missingCoverage,
    ),
    buildReadinessReport(
      "decision_memory",
      "Decision Memory",
      coverageReports.decisionMemory.readyForMemory,
      coverageReports.decisionMemory.decisionCoveragePercent,
      "Decision memory must be ready.",
      coverageReports.decisionMemory.warnings,
      coverageReports.decisionMemory.missingCoverage,
    ),
    buildReadinessReport(
      "precedent_engine",
      "Precedent Engine",
      coverageReports.precedentEngine.precedentCoverage > 0,
      coverageReports.precedentEngine.precedentCoverage * 100,
      "Precedent engine must have at least one matchable precedent.",
      [],
      coverageReports.precedentEngine.matches.length > 0 ? [] : ["no precedent matches available"],
    ),
    buildReadinessReport(
      "continuous_learning",
      "Continuous Learning",
      coverageReports.continuousLearning.readyForLearning,
      coverageReports.continuousLearning.coveragePercent,
      "Continuous learning corpus must be ready.",
      coverageReports.continuousLearning.warnings,
      coverageReports.continuousLearning.gaps,
    ),
    buildReadinessReport(
      "human_reviewer_alignment",
      "Human Reviewer Alignment",
      humanReviewerAlignment.readyForProduction,
      humanReviewerAlignment.readinessPercent,
      "Human reviewer alignment corpus must be ready.",
      humanReviewerAlignment.warnings,
      humanReviewerAlignment.gaps,
    ),
  ]);
}

function buildCoverageReports(rootDir: string): ProductionCertificationCoverageReports {
  const domainRegistry = createDomainCoverageRegistry();
  const reviewerDomains = domainRegistry.list().map((entry) => entry.report);
  const decisionRecordRegistry = createDecisionRecordRegistry();
  const decisionRecords = decisionRecordRegistry.list();
  const knowledgeAcquisitionRecords = loadKnowledgeAcquisitionRecords(rootDir);
  const gcamCatalog = createGcamKnowledgeLoader().load();
  const gcamKnowledgeRegistry = createGcamKnowledgeRegistry(gcamCatalog);
  const gcamSchemaRegistry = loadGcamKnowledgeRegistryFromDirectory(join(rootDir, "gcamKnowledge"));
  const gcamRecords = gcamKnowledgeRegistry.listAll();
  const knowledgeAcquisition = createKnowledgeAcquisitionCoverageReport(knowledgeAcquisitionRecords);
  const caseLibraryRegistry = createCaseLibraryRegistry({ gcamRecords, decisionRecords });
  const decisionMemoryRegistry = createDecisionMemoryRegistry({ decisionRecords });
  const precedentEngineRegistry = createPrecedentEngineRegistry(decisionMemoryRegistry, caseLibraryRegistry);
  const gcamKnowledge = computeGcamKnowledgeCoverageReport(
    gcamSchemaRegistry.catalog,
    gcamSchemaRegistry.validation.valid ? "VALID" : "INVALID",
    gcamSchemaRegistry.validation.issues.map((issue) => `${issue.code}:${issue.message}`),
  );
  const caseLibrary = createCaseLibraryCoverageReport(caseLibraryRegistry);
  const decisionMemory = createDecisionMemoryCoverageReport(decisionMemoryRegistry);
  const precedentEngine = createPrecedentEngineCoverageReport(precedentEngineRegistry.report);
  const continuousLearning = createContinuousLearningCoverageReport(createDefaultContinuousLearningRegistry());
  const humanReviewerAlignment = createHumanReviewerAlignmentReport({
    knowledgeAcquisitionRecords,
    decisionRecords,
  });

  return Object.freeze({
    reviewerDomains: Object.freeze(reviewerDomains),
    knowledgeAcquisition,
    gcamKnowledge,
    caseLibrary,
    decisionMemory,
    precedentEngine,
    continuousLearning,
    humanReviewerAlignment,
  });
}

function toDomainReadiness(reviewerScorecards: readonly ProductionCertificationScorecard[]): number {
  return averagePercent(reviewerScorecards.map((scorecard) => scorecard.readinessPercent));
}

function toOverallReadiness(
  reviewerScorecards: readonly ProductionCertificationScorecard[],
  moduleScorecards: readonly ProductionCertificationScorecard[],
  knowledgeScorecards: readonly ProductionCertificationScorecard[],
): number {
  return averagePercent([
    toDomainReadiness(reviewerScorecards),
    averagePercent(moduleScorecards.map((scorecard) => scorecard.readinessPercent)),
    averagePercent(knowledgeScorecards.map((scorecard) => scorecard.readinessPercent)),
  ]);
}

function collectWarnings(readinessReports: readonly ProductionCertificationReadinessReport[]): readonly string[] {
  return Object.freeze([...new Set(readinessReports.flatMap((report) => report.warnings))].sort((left, right) => left.localeCompare(right)));
}

function collectGaps(readinessReports: readonly ProductionCertificationReadinessReport[]): readonly string[] {
  return Object.freeze([...new Set(readinessReports.flatMap((report) => report.gaps))].sort((left, right) => left.localeCompare(right)));
}

export function createProductionCertificationReport(rootDir = DEFAULT_ROOT): ProductionCertificationReport {
  const generatedAt = new Date().toISOString();
  const start = performance.now();
  const coverageReports = buildCoverageReports(rootDir);
  const reviewerScorecards = buildReviewerScorecards(coverageReports.reviewerDomains);
  const moduleScorecards = buildModuleScorecards(coverageReports);
  const knowledgeScorecards = buildKnowledgeScorecards(coverageReports, reviewerScorecards);
  const readinessReports = buildReadinessReports(reviewerScorecards, moduleScorecards, knowledgeScorecards, coverageReports);
  const warnings = collectWarnings(readinessReports);
  const gaps = collectGaps(readinessReports);
  const latencyMs = Math.max(0, Math.round(performance.now() - start));
  const metrics = buildSummaryMetrics(reviewerScorecards, moduleScorecards, knowledgeScorecards, coverageReports, latencyMs);
  const productionReadiness = toOverallReadiness(reviewerScorecards, moduleScorecards, knowledgeScorecards);
  const readyForProduction = productionReadiness >= 90 && warnings.length === 0 && gaps.length === 0 && readinessReports.every((report) => report.ready);

  const report = Object.freeze({
    framework: "V3 Production Certification",
    generatedAt,
    reviewerScorecards,
    moduleScorecards,
    knowledgeScorecards,
    coverageReports,
    readinessReports,
    metrics,
    productionReadiness,
    readyForProduction,
    warnings,
    gaps,
  } satisfies Omit<ProductionCertificationReport, "hash">);

  return Object.freeze({
    ...report,
    hash: hashValue(report),
  });
}
