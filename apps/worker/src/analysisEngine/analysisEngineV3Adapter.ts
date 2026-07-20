import { runV3RuntimeAdapter } from "../analysisEngineV3/runtime/runtimeAdapter.js";
import type { AnalysisEngine, AnalysisJobContext, AnalysisResult } from "./types.js";

export function createAnalysisEngineV3Adapter(dependencies: Readonly<{
  runV3RuntimeAdapter?: typeof runV3RuntimeAdapter;
}> = {}): AnalysisEngine {
  const runtimeAdapter = dependencies.runV3RuntimeAdapter ?? runV3RuntimeAdapter;

  return Object.freeze({
    async execute(jobContext: AnalysisJobContext): Promise<AnalysisResult> {
      const runtimeResult = await runtimeAdapter(jobContext.request, jobContext.options ?? {});
      return runtimeResult as unknown as AnalysisResult;
    },
  });
}
