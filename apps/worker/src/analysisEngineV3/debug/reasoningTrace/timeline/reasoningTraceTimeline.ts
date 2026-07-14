import { createHash } from "node:crypto";

import {
  REASONING_TRACE_STAGE_ORDER,
  REASONING_TRACE_STAGE_TITLES,
  type ReasoningTraceStageDraft,
  type ReasoningTraceStageRecord,
  type ReasoningTraceTimeline,
  type ReasoningTraceTimelineEntry,
} from "../types/reasoningTraceTypes.js";
import {
  collectReasoningTraceStages,
  hashReasoningTraceValue,
  stableSerializeReasoningTraceValue,
} from "../collector/reasoningTraceComparatorCollector.js";

function stageHash(stage: ReasoningTraceStageRecord): string {
  return hashReasoningTraceValue(stage);
}

export function buildReasoningTraceTimeline(
  stages: readonly ReasoningTraceStageDraft[] | readonly ReasoningTraceStageRecord[],
): ReasoningTraceTimeline {
  const normalized = collectReasoningTraceStages(stages as readonly ReasoningTraceStageDraft[]);
  const timelineEntries: ReasoningTraceTimelineEntry[] = normalized.map((stage, index) =>
    Object.freeze({
      order: index,
      stage: stage.stage,
      title: stage.title,
      timestamp: stage.timestamp,
      confidence: stage.confidence,
      label: REASONING_TRACE_STAGE_TITLES[stage.stage],
      hash: stageHash(stage),
      inputs: stage.inputs,
      outputs: stage.outputs,
    }),
  );
  const timeline: ReasoningTraceTimeline = Object.freeze({
    hash: "",
    entries: Object.freeze(timelineEntries),
  });
  return Object.freeze({
    ...timeline,
    hash: createHash("sha256").update(stableSerializeReasoningTraceValue(timeline), "utf8").digest("hex"),
  });
}

export function renderReasoningTraceTimeline(timeline: ReasoningTraceTimeline): string {
  const lines = [
    "## Reasoning Trace Timeline",
    "",
    "| # | Stage | Timestamp | Confidence | Hash | Inputs | Outputs |",
    "|---|---|---|---:|---|---|---|",
  ];
  for (const entry of timeline.entries) {
    lines.push(
      `| ${entry.order + 1} | ${entry.label} | ${entry.timestamp} | ${entry.confidence.toFixed(6)} | ${entry.hash} | ${entry.inputs.length === 0 ? "none" : entry.inputs.join(" ; ")} | ${entry.outputs.length === 0 ? "none" : entry.outputs.join(" ; ")} |`,
    );
  }
  return lines.join("\n");
}
