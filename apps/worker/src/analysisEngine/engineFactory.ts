import { createAnalysisEngineV3Adapter } from "./analysisEngineV3Adapter.js";
import { createAnalysisEngineV4Adapter } from "./analysisEngineV4Adapter.js";
import type { AnalysisEngine, AnalysisEngineName } from "./types.js";

export type AnalysisEngineFactoryOptions = Readonly<{
  env?: Readonly<{ ANALYSIS_ENGINE?: string | undefined }>;
  v3Adapter?: AnalysisEngine;
  v4Adapter?: AnalysisEngine;
}>;

function normalizeSelection(value: string | undefined | null): AnalysisEngineName {
  return value?.toLowerCase() === "v4" ? "v4" : "v3";
}

export function create(options: AnalysisEngineFactoryOptions = {}): AnalysisEngine {
  const selection = normalizeSelection(options.env?.ANALYSIS_ENGINE ?? process.env.ANALYSIS_ENGINE);
  if (selection === "v4") {
    return options.v4Adapter ?? createAnalysisEngineV4Adapter();
  }
  return options.v3Adapter ?? createAnalysisEngineV3Adapter();
}

export { create as createAnalysisEngine };
export { createAnalysisEngineV3Adapter } from "./analysisEngineV3Adapter.js";
export { createAnalysisEngineV4Adapter } from "./analysisEngineV4Adapter.js";
export type { AnalysisEngine, AnalysisEngineName, AnalysisJobContext, AnalysisResult, AnalysisResponseContract, AnalysisDiagnostics } from "./types.js";
