import { createHash } from "node:crypto";

import {
  REASONING_TRACE_STAGE_ORDER,
  REASONING_TRACE_STAGE_TITLES,
  type ReasoningTraceComparatorInput,
  type ReasoningTraceComparatorReport,
  type ReasoningTraceStageComparison,
  type ReasoningTraceStageDraft,
  type ReasoningTraceStageRecord,
  type ReasoningTraceStageId,
} from "../types/reasoningTraceTypes.js";
import {
  collectReasoningTraceStages,
  hashReasoningTraceValue,
  stableSerializeReasoningTraceValue,
} from "../collector/reasoningTraceComparatorCollector.js";

function stageMap(stages: readonly ReasoningTraceStageRecord[]): Map<ReasoningTraceStageId, ReasoningTraceStageRecord> {
  return new Map(stages.map((stage) => [stage.stage, stage] as const));
}

function formatArray(values: readonly string[] | readonly number[]): string {
  return values.length === 0 ? "none" : values.map((value) => String(value)).join(", ");
}

function compareLists(expected: readonly string[] | readonly number[], actual: readonly string[] | readonly number[]) {
  const expectedList = expected.map((value) => String(value));
  const actualList = actual.map((value) => String(value));
  const expectedSet = new Set(expectedList);
  const actualSet = new Set(actualList);

  const matched = expectedList.filter((value) => actualSet.has(value));
  const missing = expectedList.filter((value) => !actualSet.has(value));
  const unexpected = actualList.filter((value) => !expectedSet.has(value));
  return {
    matched,
    missing,
    unexpected,
  } as const;
}

function compareStage(
  stage: ReasoningTraceStageId,
  expected: ReasoningTraceStageRecord | null,
  actual: ReasoningTraceStageRecord | null,
): ReasoningTraceStageComparison {
  if (expected === null && actual === null) {
    return Object.freeze({
      stage,
      title: REASONING_TRACE_STAGE_TITLES[stage],
      expected: null,
      actual: null,
      status: "missing",
      matched: Object.freeze([]),
      missing: Object.freeze([`stage:${stage}`]),
      unexpected: Object.freeze([]),
      confidenceDifference: null,
      reasonDifference: Object.freeze([]),
      knowledgeDifference: Object.freeze([]),
    });
  }

  if (expected === null) {
    return Object.freeze({
      stage,
      title: actual?.title ?? REASONING_TRACE_STAGE_TITLES[stage],
      expected: null,
      actual,
      status: "unexpected",
      matched: Object.freeze([]),
      missing: Object.freeze([]),
      unexpected: Object.freeze([`stage:${stage}`]),
      confidenceDifference: null,
      reasonDifference: Object.freeze([actual ? `unexpected stage: ${actual.reason}` : `unexpected stage: ${stage}`]),
      knowledgeDifference: Object.freeze(actual ? actual.knowledgeAssetsUsed.map((value) => `unexpected:${value}`) : []),
    });
  }

  if (actual === null) {
    return Object.freeze({
      stage,
      title: expected.title,
      expected,
      actual: null,
      status: "missing",
      matched: Object.freeze([]),
      missing: Object.freeze([`stage:${stage}`]),
      unexpected: Object.freeze([]),
      confidenceDifference: null,
      reasonDifference: Object.freeze([`missing stage: ${expected.reason}`]),
      knowledgeDifference: Object.freeze(expected.knowledgeAssetsUsed.map((value) => `missing:${value}`)),
    });
  }

  const fieldComparisons: string[] = [];
  const missing: string[] = [];
  const unexpected: string[] = [];
  const reasonDifference: string[] = [];
  const knowledgeDifference: string[] = [];

  const compareScalar = (label: string, left: unknown, right: unknown) => {
    if (left === right) {
      fieldComparisons.push(label);
      return;
    }
    missing.push(`${label}: ${String(left)}`);
    unexpected.push(`${label}: ${String(right)}`);
  };

  const compareArrayField = (label: string, left: readonly string[] | readonly number[], right: readonly string[] | readonly number[]) => {
    const diff = compareLists(left, right);
    if (diff.missing.length === 0 && diff.unexpected.length === 0) {
      fieldComparisons.push(label);
      return;
    }
    if (diff.missing.length > 0) missing.push(`${label}: ${formatArray(diff.missing)}`);
    if (diff.unexpected.length > 0) unexpected.push(`${label}: ${formatArray(diff.unexpected)}`);
    if (label === "knowledgeAssetsUsed" || label === "lessonIds" || label === "decisionRecordIds" || label === "patternIds" || label === "benchmarkIds" || label === "reviewerMethodologyIds" || label === "narrativeIds" || label === "intentIds" || label === "relationshipIds" || label === "judgmentIds" || label === "gcamArticleIds" || label === "gcamAtomIds") {
      knowledgeDifference.push(`${label}: expected [${formatArray(left)}] actual [${formatArray(right)}]`);
    }
  };

  compareScalar("title", expected.title, actual.title);
  compareArrayField("inputs", expected.inputs, actual.inputs);
  compareArrayField("outputs", expected.outputs, actual.outputs);
  compareScalar("confidence", expected.confidence, actual.confidence);
  compareArrayField("supportingEvidence", expected.supportingEvidence, actual.supportingEvidence);
  compareArrayField("knowledgeAssetsUsed", expected.knowledgeAssetsUsed, actual.knowledgeAssetsUsed);
  compareArrayField("lessonIds", expected.lessonIds, actual.lessonIds);
  compareArrayField("decisionRecordIds", expected.decisionRecordIds, actual.decisionRecordIds);
  compareArrayField("patternIds", expected.patternIds, actual.patternIds);
  compareArrayField("benchmarkIds", expected.benchmarkIds, actual.benchmarkIds);
  compareArrayField("reviewerMethodologyIds", expected.reviewerMethodologyIds, actual.reviewerMethodologyIds);
  compareArrayField("narrativeIds", expected.narrativeIds, actual.narrativeIds);
  compareArrayField("intentIds", expected.intentIds, actual.intentIds);
  compareArrayField("relationshipIds", expected.relationshipIds, actual.relationshipIds);
  compareArrayField("judgmentIds", expected.judgmentIds, actual.judgmentIds);
  compareArrayField("gcamArticleIds", expected.gcamArticleIds, actual.gcamArticleIds);
  compareArrayField("gcamAtomIds", expected.gcamAtomIds, actual.gcamAtomIds);
  compareScalar("reason", expected.reason, actual.reason);

  const confidenceDifference = Number((actual.confidence - expected.confidence).toFixed(6));
  if (confidenceDifference !== 0) {
    reasonDifference.push(`confidence:${expected.confidence.toFixed(6)}→${actual.confidence.toFixed(6)}`);
  }
  if (expected.reason !== actual.reason) {
    reasonDifference.push(`reason:${expected.reason}→${actual.reason}`);
  }

  const status: ReasoningTraceStageComparison["status"] =
    missing.length === 0 && unexpected.length === 0 && reasonDifference.length === 0 && knowledgeDifference.length === 0
      ? "matched"
      : "partial";

  return Object.freeze({
    stage,
    title: expected.title,
    expected,
    actual,
    status,
    matched: Object.freeze([...fieldComparisons].sort((left, right) => left.localeCompare(right))),
    missing: Object.freeze([...missing].sort((left, right) => left.localeCompare(right))),
    unexpected: Object.freeze([...unexpected].sort((left, right) => left.localeCompare(right))),
    confidenceDifference,
    reasonDifference: Object.freeze([...reasonDifference].sort((left, right) => left.localeCompare(right))),
    knowledgeDifference: Object.freeze([...knowledgeDifference].sort((left, right) => left.localeCompare(right))),
  });
}

function compareReasoningTraceInput(input: ReasoningTraceComparatorInput): readonly ReasoningTraceStageComparison[] {
  const expectedStages = stageMap(collectReasoningTraceStages(input.expected));
  const actualStages = stageMap(collectReasoningTraceStages(input.actual));
  return Object.freeze(
    REASONING_TRACE_STAGE_ORDER.map((stage) =>
      compareStage(stage, expectedStages.get(stage) ?? null, actualStages.get(stage) ?? null),
    ),
  );
}

function hashComparator(value: unknown): string {
  return createHash("sha256").update(stableSerializeReasoningTraceValue(value), "utf8").digest("hex");
}

export function buildReasoningTraceComparatorReport(
  input: ReasoningTraceComparatorInput,
): ReasoningTraceComparatorReport {
  const stages = compareReasoningTraceInput(input);
  const expectedStageCount = input.expected.length;
  const actualStageCount = input.actual.length;
  const matchedStageCount = stages.filter((stage) => stage.status === "matched").length;
  const missingStageCount = stages.filter((stage) => stage.status === "missing").length;
  const unexpectedStageCount = stages.filter((stage) => stage.status === "unexpected").length;
  const partialStageCount = stages.filter((stage) => stage.status === "partial").length;
  const confidenceDifference = Number(stages.reduce((sum, stage) => sum + (stage.confidenceDifference ?? 0), 0).toFixed(6));
  const reasonDifferenceCount = stages.reduce((sum, stage) => sum + stage.reasonDifference.length, 0);
  const knowledgeDifferenceCount = stages.reduce((sum, stage) => sum + stage.knowledgeDifference.length, 0);
  const coveragePercent = expectedStageCount === 0
    ? 100
    : Number((((matchedStageCount + partialStageCount) / expectedStageCount) * 100).toFixed(6));
  const readyForProduction = missingStageCount === 0 && unexpectedStageCount === 0 && partialStageCount === 0;
  const report: ReasoningTraceComparatorReport = Object.freeze({
    hash: "",
    expectedStageCount,
    actualStageCount,
    matchedStageCount,
    missingStageCount,
    unexpectedStageCount,
    partialStageCount,
    confidenceDifference,
    reasonDifferenceCount,
    knowledgeDifferenceCount,
    coveragePercent,
    readyForProduction,
    stages,
  });

  return Object.freeze({
    ...report,
    hash: hashComparator(report),
  });
}

export function buildReasoningTraceComparatorFromDrafts(
  expected: readonly ReasoningTraceStageDraft[],
  actual: readonly ReasoningTraceStageDraft[],
): ReasoningTraceComparatorReport {
  return buildReasoningTraceComparatorReport({ expected, actual });
}
