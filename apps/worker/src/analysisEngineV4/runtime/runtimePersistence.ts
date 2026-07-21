import { persistShadowMode, type ShadowPersistenceInput, type ShadowPersistenceResult } from "../shadow/shadowPersistence.js";
import type { RuntimeOrchestrationResult } from "./runtimeArtifacts.js";

export type RuntimePersistenceInput = Readonly<ShadowPersistenceInput & {
  runtime: RuntimeOrchestrationResult;
}>;

export type RuntimePersistenceResult = Readonly<ShadowPersistenceResult & {
  runtimeBundleId: string;
}>;

export async function persistRuntimeArtifacts(input: RuntimePersistenceInput): Promise<RuntimePersistenceResult> {
  const persistence = await persistShadowMode({
    jobId: input.jobId,
    chunkId: input.chunkId,
    runKey: input.runKey,
    visibleResult: input.visibleResult,
    shadowResult: input.shadowResult,
    comparison: input.comparison,
    traceDocument: input.traceDocument ?? input.runtime.trace,
    executionTimeMs: input.executionTimeMs,
    promptTokenEstimate: input.promptTokenEstimate,
    completionTokenEstimate: input.completionTokenEstimate,
    estimatedCostUsd: input.estimatedCostUsd,
    runtimeArtifacts: input.runtime,
  });

  return Object.freeze({
    ...persistence,
    runtimeBundleId: input.runtime.bundle.bundleId,
  });
}

