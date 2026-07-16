import type { AnalysisResponse } from "../engine/analysisResponse.js";

export function buildExplanationSafeAnalysisResponse(analysisResponse: AnalysisResponse): AnalysisResponse {
  return Object.freeze({
    ...analysisResponse,
    context: Object.freeze({
      ...analysisResponse.context,
      storyMemory: null,
      sceneMemory: null,
    }),
    intelligence: Object.freeze({
      ...analysisResponse.intelligence,
      storyMemory: null,
    }),
  });
}
