import type { V3PipelineResult } from "../pipeline/pipelineResult.js";
import type { AnalysisRequest } from "./analysisRequest.js";
import type { AnalysisResponse } from "./analysisResponse.js";

export type AnalysisHookContext = Readonly<{
  request: AnalysisRequest;
  promptHash?: string;
  pipelineResult?: V3PipelineResult;
  response?: AnalysisResponse;
}>;

export type AnalysisHooks = Readonly<{
  beforePromptBuild?: (context: AnalysisHookContext) => void;
  afterPromptBuild?: (context: AnalysisHookContext) => void;
  beforePipeline?: (context: AnalysisHookContext) => void;
  afterPipeline?: (context: AnalysisHookContext) => void;
  afterAnalysis?: (context: AnalysisHookContext) => void;
}>;

