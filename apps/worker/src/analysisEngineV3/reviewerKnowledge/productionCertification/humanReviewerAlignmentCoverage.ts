import { createHash } from "node:crypto";

import type { DecisionRecord } from "../decisionRecords/decisionRecordTypes.js";
import type { KnowledgeAcquisitionRecord } from "../knowledgeAcquisition/schema/knowledgeAcquisitionTypes.js";
import type { ProductionCertificationMetric } from "./productionCertificationTypes.js";
import type {
  HumanReviewerAlignmentInput,
  HumanReviewerAlignmentReport,
  HumanReviewerAlignmentScorecard,
} from "./humanReviewerAlignmentTypes.js";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
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

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) => left.localeCompare(right)));
}

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.filter((value) => Number.isFinite(value)))].sort((left, right) => left - right));
}

function normalizeKey(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/gi, (match) => match.toUpperCase());
}

function sortKnowledgeAcquisitionRecords(records: readonly KnowledgeAcquisitionRecord[]): readonly KnowledgeAcquisitionRecord[] {
  return Object.freeze(
    [...records].sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.id.localeCompare(right.id) ||
      left.domain.localeCompare(right.domain) ||
      left.version.localeCompare(right.version),
    ),
  );
}

function createDecisionArticleLookup(decisionRecords: readonly DecisionRecord[]): ReadonlyMap<string, readonly number[]> {
  const lookup = new Map<string, readonly number[]>();
  for (const record of decisionRecords) {
    const articleIds = uniqueSortedNumbers(record.gcamMappings.map((mapping) => mapping.article_id));
    lookup.set(record.id, articleIds);
  }
  return lookup;
}

function resolveArticlesForRecord(record: KnowledgeAcquisitionRecord, decisionArticleLookup: ReadonlyMap<string, readonly number[]>): readonly number[] {
  const resolved = new Set<number>();
  for (const decisionRecordId of record.relatedDecisionRecords) {
    const articleIds = decisionArticleLookup.get(decisionRecordId);
    if (!articleIds) {
      continue;
    }
    for (const articleId of articleIds) {
      resolved.add(articleId);
    }
  }
  return uniqueSortedNumbers([...resolved]);
}

function computeSupportScore(record: KnowledgeAcquisitionRecord, decisionArticleLookup: ReadonlyMap<string, readonly number[]>): number {
  const decisionLinks = record.relatedDecisionRecords.filter((decisionRecordId) => decisionArticleLookup.has(decisionRecordId));
  const evidenceScore = Math.min(record.evidence.length, 5) / 5 * 100;
  const reasoningScore = Math.min(record.reasoning.length, 5) / 5 * 100;
  const decisionScore = record.relatedDecisionRecords.length === 0 ? 0 : (decisionLinks.length / record.relatedDecisionRecords.length) * 100;
  const lessonScore = Math.min(record.relatedLessons.length, 5) / 5 * 100;
  return averagePercent([evidenceScore, reasoningScore, decisionScore, lessonScore]);
}

function computeReasoningAlignment(record: KnowledgeAcquisitionRecord): number {
  return averagePercent([
    record.evidence.length > 0 ? 100 : 0,
    record.reasoning.length > 0 ? 100 : 0,
    record.alternativeDecisions.length > 0 ? 100 : 0,
    record.rejectedInterpretations.length > 0 ? 100 : 0,
  ]);
}

function computePrecision(record: KnowledgeAcquisitionRecord, supportScore: number): number {
  const hasDecisionLink = record.relatedDecisionRecords.length > 0;
  const consensusBoost = record.agreementState === "consensus" ? 25 : record.agreementState === "disagreement" ? -25 : 0;
  return clampPercent((hasDecisionLink ? 50 : 0) + (record.reviewerConfidence * 50) + consensusBoost + (supportScore * 0.2));
}

function computeRecall(record: KnowledgeAcquisitionRecord): number {
  return averagePercent([
    record.evidence.length > 0 ? 100 : 0,
    record.reasoning.length > 0 ? 100 : 0,
    record.relatedLessons.length > 0 ? 100 : 0,
    record.relatedPatterns.length > 0 ? 100 : 0,
    record.relatedBenchmarks.length > 0 ? 100 : 0,
  ]);
}

function computeArticleSelectionAccuracy(record: KnowledgeAcquisitionRecord, decisionArticleLookup: ReadonlyMap<string, readonly number[]>): number {
  if (record.relatedDecisionRecords.length === 0) {
    return 0;
  }

  const matched = record.relatedDecisionRecords.filter((decisionRecordId) => decisionArticleLookup.has(decisionRecordId)).length;
  return clampPercent((matched / record.relatedDecisionRecords.length) * 100);
}

function computeConfidenceAlignment(record: KnowledgeAcquisitionRecord, supportScore: number): number {
  const reviewerConfidencePercent = record.reviewerConfidence * 100;
  return clampPercent(100 - Math.abs(reviewerConfidencePercent - supportScore));
}

function computeReviewerDrift(records: readonly KnowledgeAcquisitionRecord[]): number {
  if (records.length <= 1) {
    return 0;
  }

  let totalDelta = 0;
  let comparisons = 0;
  for (let index = 1; index < records.length; index += 1) {
    totalDelta += Math.abs(records[index].reviewerConfidence - records[index - 1].reviewerConfidence) * 100;
    comparisons += 1;
  }
  return comparisons > 0 ? clampPercent(totalDelta / comparisons) : 0;
}

function collectKnowledgeGaps(record: KnowledgeAcquisitionRecord, supportScore: number): readonly string[] {
  const gaps = [
    ...(record.evidence.length === 0 ? ["missing evidence"] : []),
    ...(record.reasoning.length === 0 ? ["missing reasoning"] : []),
    ...(record.relatedDecisionRecords.length === 0 ? ["missing decision record linkage"] : []),
    ...(record.relatedLessons.length === 0 ? ["missing lesson linkage"] : []),
    ...(record.relatedPatterns.length === 0 ? ["missing pattern linkage"] : []),
    ...(record.relatedBenchmarks.length === 0 ? ["missing benchmark linkage"] : []),
    ...(supportScore < 60 ? ["weak evidence support"] : []),
    ...(record.reviewerConfidence < 0.7 ? ["low reviewer confidence"] : []),
  ];
  return uniqueSortedStrings(gaps);
}

function collectArticleWeaknesses(
  record: KnowledgeAcquisitionRecord,
  decisionArticleLookup: ReadonlyMap<string, readonly number[]>,
  supportScore: number,
  precision: number,
): readonly number[] {
  if (record.relatedDecisionRecords.length === 0 || (supportScore >= 60 && precision >= 60 && record.agreementState === "consensus")) {
    return Object.freeze([]);
  }

  const articleIds = new Set<number>();
  for (const decisionRecordId of record.relatedDecisionRecords) {
    const mappedArticles = decisionArticleLookup.get(decisionRecordId);
    if (!mappedArticles) {
      continue;
    }
    for (const articleId of mappedArticles) {
      articleIds.add(articleId);
    }
  }

  return uniqueSortedNumbers([...articleIds]);
}

function collectLearningPriorities(record: KnowledgeAcquisitionRecord, supportScore: number): readonly string[] {
  if (record.concepts.length === 0) {
    return Object.freeze([]);
  }

  if (supportScore >= 60 && record.agreementState === "consensus") {
    return Object.freeze([]);
  }

  return uniqueSortedStrings([...record.concepts]).slice(0, 10);
}

function buildMetric(
  id: string,
  label: string,
  value: number,
  unit: ProductionCertificationMetric["unit"],
  direction: ProductionCertificationMetric["direction"],
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

function buildScorecard(records: readonly KnowledgeAcquisitionRecord[], decisionArticleLookup: ReadonlyMap<string, readonly number[]>): HumanReviewerAlignmentScorecard {
  const sortedRecords = sortKnowledgeAcquisitionRecords(records);
  const scorecardKey = normalizeKey(sortedRecords[0]?.reviewerId ?? sortedRecords[0]?.reviewerName ?? sortedRecords[0]?.domain, "unassigned");
  const reviewerId = normalizeKey(sortedRecords[0]?.reviewerId, scorecardKey);
  const reviewerName = normalizeKey(sortedRecords[0]?.reviewerName, titleCase(scorecardKey));
  const domain = normalizeKey(sortedRecords[0]?.domain, "unassigned");

  const supportScores = sortedRecords.map((record) => computeSupportScore(record, decisionArticleLookup));
  const precisionValues = sortedRecords.map((record, index) => computePrecision(record, supportScores[index]));
  const recallValues = sortedRecords.map((record) => computeRecall(record));
  const articleSelectionValues = sortedRecords.map((record) => computeArticleSelectionAccuracy(record, decisionArticleLookup));
  const confidenceAlignmentValues = sortedRecords.map((record, index) => computeConfidenceAlignment(record, supportScores[index]));
  const reasoningAlignmentValues = sortedRecords.map((record) => computeReasoningAlignment(record));
  const drift = computeReviewerDrift(sortedRecords);

  const knowledgeGaps = uniqueSortedStrings(sortedRecords.flatMap((record, index) => collectKnowledgeGaps(record, supportScores[index])));
  const articleWeaknesses = uniqueSortedNumbers(sortedRecords.flatMap((record, index) => collectArticleWeaknesses(record, decisionArticleLookup, supportScores[index], precisionValues[index])));
  const learningPriorities = uniqueSortedStrings(sortedRecords.flatMap((record, index) => collectLearningPriorities(record, supportScores[index])));

  const warnings = uniqueSortedStrings([
    ...(sortedRecords.length < 3 ? ["limited reviewer sample"] : []),
    ...(averagePercent(precisionValues) < 70 ? ["precision below target"] : []),
    ...(averagePercent(confidenceAlignmentValues) < 70 ? ["confidence alignment below target"] : []),
    ...(drift > 25 ? ["reviewer drift above target"] : []),
  ]);

  const gaps = uniqueSortedStrings([
    ...(sortedRecords.length === 0 ? ["missing reviewer records"] : []),
    ...(sortedRecords.every((record) => record.relatedDecisionRecords.length === 0) ? ["missing decision record linkages"] : []),
    ...(sortedRecords.every((record) => record.relatedLessons.length === 0) ? ["missing lesson linkages"] : []),
    ...(sortedRecords.every((record) => record.relatedPatterns.length === 0) ? ["missing pattern linkages"] : []),
    ...(sortedRecords.every((record) => record.relatedBenchmarks.length === 0) ? ["missing benchmark linkages"] : []),
  ]);

  const totalScripts = uniqueSortedStrings(sortedRecords.map((record) => record.source)).length;
  const readinessPercent = averagePercent([
    averagePercent(precisionValues),
    averagePercent(recallValues),
    averagePercent(articleSelectionValues),
    averagePercent(confidenceAlignmentValues),
    averagePercent(reasoningAlignmentValues),
    100 - drift,
  ]);

  const report: Omit<HumanReviewerAlignmentScorecard, "hash"> = {
    reviewerId,
    reviewerName,
    domain,
    totalScripts,
    precision: averagePercent(precisionValues),
    recall: averagePercent(recallValues),
    articleSelectionAccuracy: averagePercent(articleSelectionValues),
    confidenceAlignment: averagePercent(confidenceAlignmentValues),
    reasoningAlignment: averagePercent(reasoningAlignmentValues),
    reviewerDrift: drift,
    knowledgeGaps,
    articleWeaknesses: Object.freeze(articleWeaknesses.map((articleId) => `article ${articleId}`)),
    learningPriorities,
    readinessPercent,
    warnings,
    gaps,
    sourceHash: hashValue({
      reviewerId,
      reviewerName,
      domain,
      records: sortedRecords.map((record) => record.id),
      metrics: {
        precision: averagePercent(precisionValues),
        recall: averagePercent(recallValues),
        articleSelectionAccuracy: averagePercent(articleSelectionValues),
        confidenceAlignment: averagePercent(confidenceAlignmentValues),
        reasoningAlignment: averagePercent(reasoningAlignmentValues),
        reviewerDrift: drift,
      },
      knowledgeGaps,
      articleWeaknesses,
      learningPriorities,
    }),
  };

  return Object.freeze({
    ...report,
    hash: hashValue(report),
  });
}

function unionStrings(values: readonly (readonly string[])[]): readonly string[] {
  return uniqueSortedStrings(values.flat());
}

function unionArticles(values: readonly (readonly string[])[]): readonly string[] {
  return uniqueSortedStrings(values.flat());
}

export function createHumanReviewerAlignmentReport(input: HumanReviewerAlignmentInput): HumanReviewerAlignmentReport {
  const knowledgeAcquisitionRecords = sortKnowledgeAcquisitionRecords(input.knowledgeAcquisitionRecords);
  const decisionRecords = Object.freeze([...input.decisionRecords].sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version)));
  const decisionArticleLookup = createDecisionArticleLookup(decisionRecords);

  const groups = new Map<string, KnowledgeAcquisitionRecord[]>();
  for (const record of knowledgeAcquisitionRecords) {
    const key = normalizeKey(record.reviewerId ?? record.reviewerName ?? record.domain, record.domain);
    const existing = groups.get(key);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const reviewerScorecards = Object.freeze(
    [...groups.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([, records]) => buildScorecard(records, decisionArticleLookup)),
  );

  const recordCount = knowledgeAcquisitionRecords.length;
  const reviewerCount = reviewerScorecards.length;
  const reviewedScriptCount = uniqueSortedStrings(knowledgeAcquisitionRecords.map((record) => record.source)).length;
  const humanFindingCount = knowledgeAcquisitionRecords.filter((record) => record.knowledgeType.toLowerCase().includes("finding")).length;
  const decisionRecordCount = decisionRecords.length;
  const reviewerDrift = averagePercent(reviewerScorecards.map((scorecard) => scorecard.reviewerDrift));
  const knowledgeGaps = unionStrings(reviewerScorecards.map((scorecard) => scorecard.knowledgeGaps));
  const articleWeaknesses = unionArticles(reviewerScorecards.map((scorecard) => scorecard.articleWeaknesses));
  const learningPriorities = unionStrings(reviewerScorecards.map((scorecard) => scorecard.learningPriorities));
  const warnings = uniqueSortedStrings([
    ...(recordCount === 0 ? ["no human reviewer records available"] : []),
    ...(reviewerCount === 0 ? ["no reviewer groups available"] : []),
    ...(decisionRecordCount === 0 ? ["no decision records available"] : []),
    ...(reviewerScorecards.some((scorecard) => scorecard.warnings.length > 0) ? ["reviewer alignment warnings present"] : []),
  ]);
  const gaps = uniqueSortedStrings([
    ...(recordCount === 0 ? ["missing human reviewer records"] : []),
    ...(decisionRecordCount === 0 ? ["missing decision records"] : []),
    ...reviewerScorecards.flatMap((scorecard) => scorecard.gaps),
  ]);

  const readinessPercent = averagePercent(reviewerScorecards.map((scorecard) => scorecard.readinessPercent));
  const metrics = Object.freeze([
    buildMetric("reviewer_precision", "Reviewer Precision", averagePercent(reviewerScorecards.map((scorecard) => scorecard.precision)), "percent", "higher_is_better", "Average reviewer precision across reviewer groups."),
    buildMetric("reviewer_recall", "Reviewer Recall", averagePercent(reviewerScorecards.map((scorecard) => scorecard.recall)), "percent", "higher_is_better", "Average reviewer recall across reviewer groups."),
    buildMetric("article_selection_accuracy", "Article Selection Accuracy", averagePercent(reviewerScorecards.map((scorecard) => scorecard.articleSelectionAccuracy)), "percent", "higher_is_better", "Average accuracy of decision-record article resolution."),
    buildMetric("confidence_alignment", "Confidence Alignment", averagePercent(reviewerScorecards.map((scorecard) => scorecard.confidenceAlignment)), "percent", "higher_is_better", "Average alignment between reviewer confidence and evidence support."),
    buildMetric("reasoning_alignment", "Reasoning Alignment", averagePercent(reviewerScorecards.map((scorecard) => scorecard.reasoningAlignment)), "percent", "higher_is_better", "Average completeness of reviewer reasoning traces."),
    buildMetric("reviewer_drift", "Reviewer Drift", reviewerDrift, "percent", "lower_is_better", "Average confidence drift between chronologically adjacent reviewer records."),
    buildMetric("knowledge_gap_coverage", "Knowledge Gap Coverage", reviewerScorecards.length > 0 ? averagePercent(reviewerScorecards.map((scorecard) => scorecard.gaps.length === 0 ? 100 : 0)) : 0, "percent", "higher_is_better", "Portion of reviewer groups without alignment gaps."),
  ]);

  const report: Omit<HumanReviewerAlignmentReport, "hash"> = {
    framework: "Human Reviewer Alignment Benchmark",
    generatedAt: new Date().toISOString(),
    recordCount,
    reviewerCount,
    reviewedScriptCount,
    humanFindingCount,
    decisionRecordCount,
    reviewerScorecards,
    metrics,
    reviewerDrift,
    knowledgeGaps,
    articleWeaknesses,
    learningPriorities,
    readinessPercent,
    readyForProduction: recordCount > 0 && reviewerCount > 0 && readinessPercent >= 90 && warnings.length === 0 && gaps.length === 0,
    warnings,
    gaps,
  };

  return Object.freeze({
    ...report,
    hash: hashValue(report),
  });
}
