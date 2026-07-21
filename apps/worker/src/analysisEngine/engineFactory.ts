import type { AnalysisEngine, AnalysisEngineName } from "./types.js";

export type AnalysisEngineFactoryOptions = Readonly<{
  env?: Readonly<{ ANALYSIS_ENGINE?: string | undefined }>;
  v3Adapter?: AnalysisEngine;
  v4Adapter?: AnalysisEngine;
}>;

function normalizeSelection(value: string | undefined | null): AnalysisEngineName {
  return value?.toLowerCase() === "v4" ? "v4" : "v3";
}

function createLazyAnalysisEngineV3Adapter(): AnalysisEngine {
  let delegatePromise: Promise<AnalysisEngine> | null = null;

  return Object.freeze({
    async execute(jobContext) {
      if (!delegatePromise) {
        delegatePromise = import("./analysisEngineV3Adapter.js").then(({ createAnalysisEngineV3Adapter }) => createAnalysisEngineV3Adapter());
      }
      const delegate = await delegatePromise;
      return delegate.execute(jobContext);
    },
  });
}

function createLazyAnalysisEngineV4Adapter(): AnalysisEngine {
  let delegatePromise: Promise<AnalysisEngine> | null = null;

  return Object.freeze({
    async execute(jobContext) {
      if (!delegatePromise) {
        delegatePromise = import("./analysisEngineV4Adapter.js").then(({ createAnalysisEngineV4Adapter }) => createAnalysisEngineV4Adapter());
      }
      const delegate = await delegatePromise;
      return delegate.execute(jobContext);
    },
  });
}

export function create(options: AnalysisEngineFactoryOptions = {}): AnalysisEngine {
  const selection = normalizeSelection(options.env?.ANALYSIS_ENGINE ?? process.env.ANALYSIS_ENGINE);
  if (selection === "v4") {
    return options.v4Adapter ?? createLazyAnalysisEngineV4Adapter();
  }
  return options.v3Adapter ?? createLazyAnalysisEngineV3Adapter();
}

export { create as createAnalysisEngine };
export type { AnalysisEngine, AnalysisEngineName, AnalysisJobContext, AnalysisResult, AnalysisResponseContract, AnalysisDiagnostics } from "./types.js";
