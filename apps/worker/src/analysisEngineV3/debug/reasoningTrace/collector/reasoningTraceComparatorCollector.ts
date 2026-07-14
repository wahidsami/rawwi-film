import { createHash } from "node:crypto";

import {
  REASONING_TRACE_STAGE_ORDER,
  REASONING_TRACE_STAGE_TITLES,
  type ReasoningTraceStageDraft,
  type ReasoningTraceStageRecord,
  type ReasoningTraceStageId,
} from "../types/reasoningTraceTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeStringList(values: readonly string[] | undefined): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return Object.freeze(result.sort((left, right) => left.localeCompare(right)));
}

function normalizeNumberList(values: readonly number[] | undefined): readonly number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values ?? []) {
    if (!Number.isFinite(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(Number(value.toFixed(6)));
  }
  return Object.freeze(result.sort((left, right) => left - right));
}

export function stableSerializeReasoningTraceValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerializeReasoningTraceValue(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerializeReasoningTraceValue(item)}`).join(",")}}`;
}

export function hashReasoningTraceValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeReasoningTraceValue(value), "utf8").digest("hex");
}

function normalizeTimestamp(value: string | null | undefined, index: number): string {
  const normalized = value ? normalizeText(value) : "";
  if (normalized) return normalized;
  return new Date(Date.UTC(2000, 0, 1, 0, 0, index, 0)).toISOString();
}

function combineKnowledgeAssets(record: ReasoningTraceStageRecord): readonly string[] {
  return normalizeStringList([
    ...record.knowledgeAssetsUsed,
    ...record.lessonIds,
    ...record.decisionRecordIds,
    ...record.patternIds,
    ...record.benchmarkIds,
    ...record.reviewerMethodologyIds,
    ...record.narrativeIds,
    ...record.intentIds,
    ...record.relationshipIds,
    ...record.judgmentIds,
    ...record.gcamArticleIds.map((articleId) => `article:${articleId}`),
    ...record.gcamAtomIds.map((atomId) => `atom:${atomId}`),
  ]);
}

export function normalizeReasoningTraceStageDraft(
  draft: ReasoningTraceStageDraft,
  index: number,
): ReasoningTraceStageRecord {
  const stage = draft.stage;
  const title = normalizeText(draft.title ?? REASONING_TRACE_STAGE_TITLES[stage]);
  const inputs = normalizeStringList(draft.inputs);
  const outputs = normalizeStringList(draft.outputs);
  const supportingEvidence = normalizeStringList(draft.supportingEvidence);
  const lessonIds = normalizeStringList(draft.lessonIds);
  const decisionRecordIds = normalizeStringList(draft.decisionRecordIds);
  const patternIds = normalizeStringList(draft.patternIds);
  const benchmarkIds = normalizeStringList(draft.benchmarkIds);
  const reviewerMethodologyIds = normalizeStringList(draft.reviewerMethodologyIds);
  const narrativeIds = normalizeStringList(draft.narrativeIds);
  const intentIds = normalizeStringList(draft.intentIds);
  const relationshipIds = normalizeStringList(draft.relationshipIds);
  const judgmentIds = normalizeStringList(draft.judgmentIds);
  const gcamArticleIds = normalizeNumberList(draft.gcamArticleIds);
  const gcamAtomIds = normalizeStringList(draft.gcamAtomIds);
  const record: ReasoningTraceStageRecord = Object.freeze({
    stage,
    title,
    timestamp: normalizeTimestamp(draft.timestamp, index),
    inputs,
    outputs,
    confidence: Number((typeof draft.confidence === "number" && Number.isFinite(draft.confidence) ? draft.confidence : 0).toFixed(6)),
    supportingEvidence,
    knowledgeAssetsUsed: combineKnowledgeAssets({
      stage,
      title,
      timestamp: normalizeTimestamp(draft.timestamp, index),
      inputs,
      outputs,
      confidence: Number((typeof draft.confidence === "number" && Number.isFinite(draft.confidence) ? draft.confidence : 0).toFixed(6)),
      supportingEvidence,
      knowledgeAssetsUsed: normalizeStringList(draft.knowledgeAssetsUsed),
      lessonIds,
      decisionRecordIds,
      patternIds,
      benchmarkIds,
      reviewerMethodologyIds,
      narrativeIds,
      intentIds,
      relationshipIds,
      judgmentIds,
      gcamArticleIds,
      gcamAtomIds,
      reason: normalizeText(draft.reason ?? ""),
    }),
    lessonIds,
    decisionRecordIds,
    patternIds,
    benchmarkIds,
    reviewerMethodologyIds,
    narrativeIds,
    intentIds,
    relationshipIds,
    judgmentIds,
    gcamArticleIds,
    gcamAtomIds,
    reason: normalizeText(draft.reason ?? outputs.join(" | ")),
  });
  return record;
}

export function collectReasoningTraceStages(
  drafts: readonly ReasoningTraceStageDraft[],
): readonly ReasoningTraceStageRecord[] {
  const normalizedByStage = new Map<ReasoningTraceStageId, ReasoningTraceStageRecord>();
  drafts.forEach((draft, index) => {
    if (!normalizedByStage.has(draft.stage)) {
      normalizedByStage.set(draft.stage, normalizeReasoningTraceStageDraft(draft, index));
    }
  });
  return Object.freeze(
    REASONING_TRACE_STAGE_ORDER
      .filter((stage) => normalizedByStage.has(stage))
      .map((stage) => normalizedByStage.get(stage) as ReasoningTraceStageRecord),
  );
}

export function createEmptyReasoningTraceStage(
  stage: ReasoningTraceStageId,
  index: number,
): ReasoningTraceStageRecord {
  return normalizeReasoningTraceStageDraft(
    {
      stage,
      timestamp: null,
      inputs: [],
      outputs: [],
      confidence: 0,
      supportingEvidence: [],
      knowledgeAssetsUsed: [],
      lessonIds: [],
      decisionRecordIds: [],
      patternIds: [],
      benchmarkIds: [],
      reviewerMethodologyIds: [],
      narrativeIds: [],
      intentIds: [],
      relationshipIds: [],
      judgmentIds: [],
      gcamArticleIds: [],
      gcamAtomIds: [],
      reason: "",
    },
    index,
  );
}
