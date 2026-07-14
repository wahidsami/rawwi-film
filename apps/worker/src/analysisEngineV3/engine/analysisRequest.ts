import type { V3PromptBuilderInput, V3PromptChunkContext, V3PromptGlossary, V3PromptOutputSchema, V3PromptSubjectModule } from "../builder/builderTypes.js";
import type { V3PromptDecisionGraph, V3PromptReasoningContract, V3PromptSemanticLayer } from "../builder/builderTypes.js";
import type { AnalysisHooks } from "./analysisHooks.js";

export type AnalysisRequestChunk = Readonly<{
  text: string;
  startOffset: number;
  endOffset: number;
  chunkIndex: number;
}>;

export type AnalysisRequestConfig = Readonly<{
  diagnostics?: Readonly<{ enabled?: boolean }>;
  reasoningContract?: V3PromptReasoningContract;
  decisionGraph?: V3PromptDecisionGraph;
  semanticLayer?: V3PromptSemanticLayer;
  hooks?: AnalysisHooks;
}>;

export type AnalysisRequest = Readonly<{
  chunk: AnalysisRequestChunk;
  storyMemory: string | null;
  sceneMemory: string | null;
  neighboringSentences: readonly string[];
  glossary: V3PromptGlossary;
  subjectModule: V3PromptSubjectModule;
  outputSchema: V3PromptOutputSchema;
  config?: AnalysisRequestConfig;
}>;

export function toPromptChunkContext(request: AnalysisRequest): V3PromptChunkContext {
  return {
    localChunk: request.chunk.text,
    neighboringSentences: request.neighboringSentences,
    sceneMemory: request.sceneMemory,
    metadata: {
      chunkIndex: request.chunk.chunkIndex,
      startOffset: request.chunk.startOffset,
      endOffset: request.chunk.endOffset,
    },
  };
}

export function toPromptBuilderInput(
  request: AnalysisRequest,
  config: Readonly<{
    reasoningContract: V3PromptReasoningContract;
    decisionGraph: V3PromptDecisionGraph;
    semanticLayer: V3PromptSemanticLayer;
  }>,
): V3PromptBuilderInput {
  return {
    reasoningContract: config.reasoningContract,
    decisionGraph: config.decisionGraph,
    semanticLayer: config.semanticLayer,
    storyMemory: request.storyMemory ?? "",
    chunkContext: toPromptChunkContext(request),
    subjectModule: request.subjectModule,
    glossary: request.glossary,
    outputSchema: request.outputSchema,
  };
}
