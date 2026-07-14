import type { LegalContextResult } from "./legalTypes.js";

export type { LegalContextResult } from "./legalTypes.js";

export function createLegalContextResult(result: LegalContextResult): LegalContextResult {
  return {
    storyMemory: result.storyMemory,
    sceneMemory: result.sceneMemory,
    localContext: result.localContext,
    chunkContext: result.chunkContext,
    neighboringSentences: [...result.neighboringSentences],
    narrativeContext: result.narrativeContext,
    confidence: Number(result.confidence.toFixed(6)),
    notes: result.notes ? [...result.notes] : undefined,
  };
}

