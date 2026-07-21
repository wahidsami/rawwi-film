import { isDeepStrictEqual } from "node:util";

import type { SceneAnalysisState, SceneAnalysisTraceEntry, SceneAnalysisTraceSnapshot } from "./sceneAnalysisState.js";
import { freezeSceneAnalysisState, snapshotSceneAnalysisState } from "./sceneAnalysisState.js";
import { createSceneAnalysisTraceNodeView } from "./sceneAnalysisTraceViewer.js";

function changedKeys(before: SceneAnalysisTraceSnapshot, after: SceneAnalysisTraceSnapshot): readonly string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => key !== "traceLength");
  return Object.freeze(keys.filter((key) => !isDeepStrictEqual((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key])));
}

export function buildSceneAnalysisTraceEntry(input: Readonly<{
  node: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  before: SceneAnalysisTraceSnapshot;
  after: SceneAnalysisTraceSnapshot;
  beforeState: SceneAnalysisState;
  afterState: SceneAnalysisState;
  verification: SceneAnalysisTraceEntry["verification"];
}>): SceneAnalysisTraceEntry {
  return Object.freeze({
    node: input.node,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    changedKeys: changedKeys(input.before, input.after),
    before: input.before,
    after: input.after,
    beforeView: createSceneAnalysisTraceNodeView(input.beforeState),
    afterView: createSceneAnalysisTraceNodeView(input.afterState),
    verification: input.verification,
  });
}

export function appendSceneAnalysisTrace(input: Readonly<{
  state: SceneAnalysisState;
  entry: SceneAnalysisTraceEntry;
}>): SceneAnalysisState {
  return freezeSceneAnalysisState({
    ...input.state,
    trace: Object.freeze([...input.state.trace, input.entry]),
  });
}

export function createTraceTransition(
  state: SceneAnalysisState,
  node: string,
  startedAt: string,
  finishedAt: string,
  durationMs: number,
  nextState: SceneAnalysisState,
  verification: SceneAnalysisTraceEntry["verification"],
): SceneAnalysisTraceEntry {
  return buildSceneAnalysisTraceEntry({
    node,
    startedAt,
    finishedAt,
    durationMs,
    before: snapshotSceneAnalysisState(state),
    after: snapshotSceneAnalysisState(nextState),
    beforeState: state,
    afterState: nextState,
    verification,
  });
}
