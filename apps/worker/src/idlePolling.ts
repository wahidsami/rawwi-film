export type WorkerPollProbe = {
  hasPendingExtraction: boolean;
  hasPendingAnalysis: boolean;
  hasAggregationCandidate: boolean;
  hasStaleJudgingChunks: boolean;
};

export type WorkerPollMode = {
  idleMode: boolean;
  pollIntervalMs: number;
  transition: "enter" | "leave" | null;
};

export function shouldEnterIdleMode(probe: WorkerPollProbe): boolean {
  return !probe.hasPendingExtraction &&
    !probe.hasPendingAnalysis &&
    !probe.hasAggregationCandidate &&
    !probe.hasStaleJudgingChunks;
}

export function resolveWorkerPollMode(
  probe: WorkerPollProbe,
  wasIdleMode: boolean,
  activePollIntervalMs: number,
  idlePollIntervalMs: number,
): WorkerPollMode {
  const idleMode = shouldEnterIdleMode(probe);
  const pollIntervalMs = idleMode ? idlePollIntervalMs : activePollIntervalMs;
  const transition =
    idleMode && !wasIdleMode ? "enter" : !idleMode && wasIdleMode ? "leave" : null;

  return {
    idleMode,
    pollIntervalMs,
    transition,
  };
}
