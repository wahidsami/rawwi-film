/**
 * Compatibility helper.
 *
 * Why this file exists:
 * - Preserves the builder-side context assembly used by the current V3 prompt rendering stack.
 * - Carries placeholder fallback text where older callers may omit optional context.
 *
 * Active V3 reviewer pipeline participation:
 * - Active compatibility layer within prompt building, but not a reasoning module.
 *
 * Backward compatibility:
 * - Retained intentionally to keep older prompt inputs rendering deterministically.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and once all prompt-callers provide the new structured context.
 */
import { renderListSection, renderRawSection, renderSection, renderStableJsonSection } from "./sectionAssembler.js";
import type { V3PromptBuilderContext } from "./builderContext.js";

export function renderStoryMemorySection(context: V3PromptBuilderContext): string {
  if (typeof context.storyMemory === "string") {
    return renderRawSection("Story Memory", context.storyMemory);
  }

  const parts: string[] = [];
  if (context.storyMemory.summary) parts.push(context.storyMemory.summary);
  if (context.storyMemory.notes && context.storyMemory.notes.length > 0) parts.push(renderListSection("Notes", context.storyMemory.notes));
  if (context.storyMemory.scenes && context.storyMemory.scenes.length > 0) parts.push(renderListSection("Scenes", context.storyMemory.scenes));

  return renderSection("Story Memory", parts.length > 0 ? parts.join("\n\n") : "- (not provided)");
}

export function renderChunkContextSection(context: V3PromptBuilderContext): string {
  const parts: string[] = [];
  parts.push(renderRawSection("Local Chunk", context.chunkContext.localChunk));

  if (context.chunkContext.sceneMemory !== undefined) {
    const sceneMemory = context.chunkContext.sceneMemory ?? "(placeholder: not available)";
    parts.push(renderRawSection("Scene Memory", sceneMemory));
  } else {
    parts.push(renderRawSection("Scene Memory", "(placeholder: not available)"));
  }

  if (context.chunkContext.neighboringSentences && context.chunkContext.neighboringSentences.length > 0) {
    parts.push(renderListSection("Neighboring Sentences", context.chunkContext.neighboringSentences));
  } else {
    parts.push(renderListSection("Neighboring Sentences", []));
  }

  if (context.chunkContext.metadata) {
    parts.push(renderStableJsonSection("Metadata", context.chunkContext.metadata));
  } else {
    parts.push(renderStableJsonSection("Metadata", {}));
  }

  return renderSection("Chunk Context", parts.join("\n\n"));
}
