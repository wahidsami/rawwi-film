import type { V3PipelineChunk } from "./pipelineTypes.js";
import type { V3PromptGlossary } from "../builder/builderTypes.js";

export type V3PipelineContext = Readonly<{
  moduleId: string;
  chunk: V3PipelineChunk;
  glossary: V3PromptGlossary;
}>;

export function createV3PipelineContext(input: V3PipelineContext): V3PipelineContext {
  return {
    moduleId: input.moduleId,
    glossary: {
      title: input.glossary.title,
      entries: [...input.glossary.entries].map((entry) => ({
        term: entry.term,
        articleId: entry.articleId,
        variants: entry.variants ? [...entry.variants] : undefined,
        definition: entry.definition,
      })),
      notes: input.glossary.notes ? [...input.glossary.notes] : undefined,
    },
    chunk: {
      text: input.chunk.text,
      startOffset: input.chunk.startOffset,
      endOffset: input.chunk.endOffset,
      chunkIndex: input.chunk.chunkIndex,
      storyMemory: input.chunk.storyMemory ?? null,
      sceneMemory: input.chunk.sceneMemory ?? null,
      neighboringSentences: input.chunk.neighboringSentences ? [...input.chunk.neighboringSentences] : [],
      metadata: input.chunk.metadata ? { ...input.chunk.metadata } : null,
    },
  };
}
