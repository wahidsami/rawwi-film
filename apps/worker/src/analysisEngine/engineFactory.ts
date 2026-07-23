import { logger } from "../logger.js";
import type { AnalysisEngine, AnalysisEngineName } from "./types.js";

export type AnalysisEngineFactoryOptions = Readonly<{
  env?: Readonly<{ ANALYSIS_ENGINE?: string | undefined }>;
  v3Adapter?: AnalysisEngine;
  v4Adapter?: AnalysisEngine;
  reviewCoreAdapter?: AnalysisEngine;
  jobId?: string | null;
}>;

function normalizeSelection(value: string | undefined | null): AnalysisEngineName {
  const normalized = value?.toLowerCase();
  if (normalized === "v3") return "v3";
  if (normalized === "v4") return "v4";
  if (normalized === "shadow") return "v3";
  if (normalized === "review_core") return "review_core";
  return "review_core";
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

function createLazyAnalysisEngineReviewCoreAdapter(): AnalysisEngine {
  let delegatePromise: Promise<AnalysisEngine> | null = null;

  return Object.freeze({
    async execute(jobContext) {
      if (!delegatePromise) {
        delegatePromise = import("./analysisEngineReviewCoreAdapter.js").then(({ createAnalysisEngineReviewCoreAdapter }) =>
          createAnalysisEngineReviewCoreAdapter(),
        );
      }
      const delegate = await delegatePromise;
      return delegate.execute(jobContext);
    },
  });
}

export function create(options: AnalysisEngineFactoryOptions = {}): AnalysisEngine {
  const selection = normalizeSelection(options.env?.ANALYSIS_ENGINE ?? process.env.ANALYSIS_ENGINE);
  logger.info("[V4] Engine factory selection", {
    jobId: options.jobId ?? null,
    requested: options.env?.ANALYSIS_ENGINE ?? process.env.ANALYSIS_ENGINE ?? null,
    selected: selection,
  });
  if (selection === "v4") {
    return options.v4Adapter ?? createLazyAnalysisEngineV4Adapter();
  }
  if (selection === "review_core") {
    return options.reviewCoreAdapter ?? createLazyAnalysisEngineReviewCoreAdapter();
  }
  return options.v3Adapter ?? createLazyAnalysisEngineV3Adapter();
}

export { create as createAnalysisEngine };
export type { AnalysisEngine, AnalysisEngineName, AnalysisJobContext, AnalysisResult, AnalysisResponseContract, AnalysisDiagnostics } from "./types.js";
