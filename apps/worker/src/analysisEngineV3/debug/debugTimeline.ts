import type { V3StageHash, V3StageTiming } from "../pipeline/pipelineTypes.js";
import type { V3DebugTimelineEntry } from "./debugTypes.js";

const STAGE_ORDER: readonly V3StageTiming["stage"][] = ["narrative", "evidence", "semantic", "context", "intelligence", "legal"];

function normalizeStageLabel(stage: V3StageTiming["stage"]): string {
  return stage.replace(/_/g, " ");
}

export function buildV3DebugTimeline(
  stageTimings: readonly V3StageTiming[],
  stageHashes: readonly V3StageHash[],
): readonly V3DebugTimelineEntry[] {
  const hashByStage = new Map(stageHashes.map((entry) => [entry.stage, entry.hash] as const));
  const timingByStage = new Map(stageTimings.map((entry) => [entry.stage, entry.durationMs] as const));

  return Object.freeze(
    STAGE_ORDER.map((stage, order) =>
      Object.freeze({
        stage,
        durationMs: timingByStage.get(stage) ?? null,
        hash: hashByStage.get(stage) ?? null,
        label: normalizeStageLabel(stage),
        order,
      }),
    ),
  );
}

export function renderV3DebugTimeline(timeline: readonly V3DebugTimelineEntry[]): string {
  const lines = [
    "## Timeline",
    "",
    "| # | Stage | Duration (ms) | Hash |",
    "|---|---|---:|---|",
  ];

  for (const entry of timeline) {
    lines.push(
      `| ${entry.order + 1} | ${entry.label} | ${entry.durationMs === null ? "n/a" : entry.durationMs} | ${entry.hash ?? "n/a"} |`,
    );
  }

  return lines.join("\n");
}
