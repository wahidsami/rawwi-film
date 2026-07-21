import { runV3RuntimeAdapter } from "../analysisEngineV3/runtime/runtimeAdapter.js";
import { logger } from "../logger.js";
import type { AnalysisEngine, AnalysisJobContext, AnalysisResult } from "./types.js";

export function createAnalysisEngineV3Adapter(dependencies: Readonly<{
  runV3RuntimeAdapter?: typeof runV3RuntimeAdapter;
}> = {}): AnalysisEngine {
  const runtimeAdapter = dependencies.runV3RuntimeAdapter ?? runV3RuntimeAdapter;

  return Object.freeze({
    async execute(jobContext: AnalysisJobContext): Promise<AnalysisResult> {
      logger.info("[V4] analysisEngineV3 entered", {
        jobId: jobContext.request.jobId,
        chunkId: jobContext.request.chunkId,
      });
      const runtimeResult = await runtimeAdapter(jobContext.request, jobContext.options ?? {});
      logger.info("[V4] analysisEngineV3 exited", {
        jobId: jobContext.request.jobId,
        chunkId: jobContext.request.chunkId,
      });
      return runtimeResult as unknown as AnalysisResult;
    },
  });
}
