import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";
import { createAnalysisEngine, type AnalysisEngine } from "./analysisEngine.js";
import { createDefaultAnalysisEngineConfig, type AnalysisEngineConfig } from "./analysisConfig.js";
import { runV3ReasoningPipeline } from "../pipeline/reasoningPipeline.js";
import type { AnalysisRequest } from "./analysisRequest.js";
import type { AnalysisResponse } from "./analysisResponse.js";

export type AnalysisFactory = Readonly<{
  analyze: (request: AnalysisRequest) => AnalysisResponse;
  config: AnalysisEngineConfig;
}>;

export function createAnalysisFactory(overrides?: Partial<AnalysisEngineConfig>): AnalysisFactory {
  const config = createDefaultAnalysisEngineConfig(overrides);
  const engine: AnalysisEngine = createAnalysisEngine({
    config,
    buildPrompt: buildV3RenderedPrompt,
    runPipeline: runV3ReasoningPipeline,
  });

  return {
    analyze: engine.analyze,
    config,
  };
}

export const analyze = createAnalysisFactory().analyze;

