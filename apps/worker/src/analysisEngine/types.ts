import type { AnalysisResponse } from "../analysisEngineV3/engine/analysisResponse.js";
import type { V3RuntimeDiagnostics } from "../analysisEngineV3/runtime/runtimeDiagnostics.js";
import type { V3RuntimeAdapterOptions, V3RuntimeAdapterRequest, V3RuntimeFinding } from "../analysisEngineV3/runtime/runtimeTypes.js";

export type AnalysisEngineName = "v3" | "v4" | "review_core";

export type AnalysisDiagnostics = Readonly<Omit<V3RuntimeDiagnostics, "engineVersion"> & {
  engineVersion: AnalysisEngineName;
}>;

export type AnalysisResponseContract = Readonly<Omit<AnalysisResponse, "diagnostics"> & {
  diagnostics: AnalysisDiagnostics;
}>;

export type AnalysisJobContext = Readonly<{
  request: V3RuntimeAdapterRequest;
  options?: V3RuntimeAdapterOptions;
}>;

export type AnalysisResult = Readonly<{
  analysisResponse: AnalysisResponseContract;
  findings: readonly V3RuntimeFinding[];
  diagnostics: AnalysisDiagnostics;
  truthLayerMeta: Record<string, unknown>;
}>;

export type AnalysisEngine = Readonly<{
  execute: (jobContext: AnalysisJobContext) => Promise<AnalysisResult>;
}>;

