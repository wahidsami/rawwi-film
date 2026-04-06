import type { AnalysisChunk, AnalysisJob } from "../jobs.js";

export const PIPELINE_V2_SCENE_MEMORY_VERSION = "v1";

type SceneDescriptor = {
  sceneIndex: number;
  heading: string;
  startOffset: number;
  endOffset: number;
  preview: string;
};

export type ChunkSceneMemory = {
  detectedSceneCount: number;
  currentScene: SceneDescriptor | null;
  previousScene: SceneDescriptor | null;
  nextScene: SceneDescriptor | null;
  localSceneContext: {
    beforeChunk: string | null;
    afterChunk: string | null;
  };
  skippedReason?: string | null;
};

const sceneIndexCache = new Map<string, SceneDescriptor[]>();
const LOCAL_SCENE_CONTEXT_RADIUS = 650;
const SCENE_PREVIEW_MAX = 420;

function compactText(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}…`;
}

function normalizeSceneHeading(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function isLikelySceneHeading(line: string): boolean {
  const trimmed = normalizeSceneHeading(line);
  if (!trimmed) return false;
  if (trimmed.length > 96) return false;
  if (/:/.test(trimmed)) return false;

  if (/^(?:المشهد|مشهد)\s*[\d\u0660-\u0669]+/u.test(trimmed)) return true;
  if (/^(?:INT\.|EXT\.|I\/E\.|INT\/EXT|\.INT|\.EXT)\b/i.test(trimmed)) return true;
  if (/^(?:[.٠-٩0-9]+\s+)?(?:المشهد|مشهد|الفصل|الطريق|منزل|سيارة)\b/u.test(trimmed)) return true;
  if (
    /(?:\bداخلي\b|\bخارجي\b|\/ليلي|\/نهاري|- خارجي|- داخلي|-خارجي|-داخلي)/u.test(trimmed) &&
    !/[.!؟،؛]/u.test(trimmed)
  ) {
    return true;
  }

  return false;
}

function buildLineIndex(fullText: string): Array<{ text: string; startOffset: number; endOffset: number }> {
  const lines: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  let cursor = 0;
  for (const rawLine of fullText.split(/\r?\n/)) {
    const lineLength = rawLine.length;
    lines.push({
      text: rawLine,
      startOffset: cursor,
      endOffset: cursor + lineLength,
    });
    cursor += lineLength + 1;
  }
  return lines;
}

function buildSceneIndex(fullText: string): SceneDescriptor[] {
  const lines = buildLineIndex(fullText);
  const headings = lines
    .map((line) => ({
      heading: normalizeSceneHeading(line.text),
      startOffset: line.startOffset,
    }))
    .filter((line) => isLikelySceneHeading(line.heading));

  if (headings.length === 0) return [];

  return headings.map((heading, index) => {
    const endOffset = headings[index + 1]?.startOffset ?? fullText.length;
    const rawPreview = fullText.slice(heading.startOffset, endOffset).trim();
    return {
      sceneIndex: index + 1,
      heading: heading.heading,
      startOffset: heading.startOffset,
      endOffset,
      preview: compactText(rawPreview, SCENE_PREVIEW_MAX),
    };
  });
}

function getCachedSceneIndex(job: AnalysisJob, normalizedText: string | null): SceneDescriptor[] {
  const cached = sceneIndexCache.get(job.id);
  if (cached) return cached;

  const fullText = normalizedText?.trim() ?? "";
  const built = fullText ? buildSceneIndex(fullText) : [];
  sceneIndexCache.set(job.id, built);
  return built;
}

function sliceWithinScene(
  fullText: string,
  scene: SceneDescriptor | null,
  startOffset: number,
  endOffset: number,
): string | null {
  if (!scene) return null;
  const safeStart = Math.max(scene.startOffset, Math.min(startOffset, fullText.length));
  const safeEnd = Math.max(safeStart, Math.min(endOffset, scene.endOffset, fullText.length));
  if (safeEnd <= safeStart) return null;
  const value = fullText.slice(safeStart, safeEnd).trim();
  return value ? compactText(value, LOCAL_SCENE_CONTEXT_RADIUS) : null;
}

export function buildChunkSceneMemory(args: {
  job: AnalysisJob;
  chunk: AnalysisChunk;
  normalizedText: string | null;
}): ChunkSceneMemory {
  const fullText = args.normalizedText?.trim() ?? "";
  if (!fullText) {
    return {
      detectedSceneCount: 0,
      currentScene: null,
      previousScene: null,
      nextScene: null,
      localSceneContext: { beforeChunk: null, afterChunk: null },
      skippedReason: "no_text",
    };
  }

  const scenes = getCachedSceneIndex(args.job, fullText);
  if (scenes.length === 0) {
    return {
      detectedSceneCount: 0,
      currentScene: null,
      previousScene: null,
      nextScene: null,
      localSceneContext: { beforeChunk: null, afterChunk: null },
      skippedReason: "no_scene_headings_detected",
    };
  }

  const chunkMidpoint = Math.max(args.chunk.start_offset, Math.floor((args.chunk.start_offset + args.chunk.end_offset) / 2));
  const currentScene =
    scenes.find((scene) => chunkMidpoint >= scene.startOffset && chunkMidpoint < scene.endOffset) ??
    scenes.find((scene) => args.chunk.start_offset < scene.endOffset && args.chunk.end_offset > scene.startOffset) ??
    null;

  const currentIndex = currentScene ? scenes.findIndex((scene) => scene.sceneIndex === currentScene.sceneIndex) : -1;
  const previousScene = currentIndex > 0 ? scenes[currentIndex - 1] ?? null : null;
  const nextScene = currentIndex >= 0 ? scenes[currentIndex + 1] ?? null : null;

  return {
    detectedSceneCount: scenes.length,
    currentScene,
    previousScene,
    nextScene,
    localSceneContext: {
      beforeChunk: sliceWithinScene(
        fullText,
        currentScene,
        Math.max(currentScene?.startOffset ?? 0, args.chunk.start_offset - LOCAL_SCENE_CONTEXT_RADIUS),
        args.chunk.start_offset,
      ),
      afterChunk: sliceWithinScene(
        fullText,
        currentScene,
        args.chunk.end_offset,
        Math.min(currentScene?.endOffset ?? fullText.length, args.chunk.end_offset + LOCAL_SCENE_CONTEXT_RADIUS),
      ),
    },
  };
}

export function buildSceneMemoryPromptContext(memory: ChunkSceneMemory): string {
  const currentHeading = memory.currentScene ? `${memory.currentScene.sceneIndex}. ${memory.currentScene.heading}` : "not available";
  const previousHeading = memory.previousScene ? `${memory.previousScene.sceneIndex}. ${memory.previousScene.heading}` : "not available";
  const nextHeading = memory.nextScene ? `${memory.nextScene.sceneIndex}. ${memory.nextScene.heading}` : "not available";

  return [
    `- Detected scene count in script: ${memory.detectedSceneCount}`,
    `- Current detected scene: ${currentHeading}`,
    `- Previous detected scene: ${previousHeading}`,
    `- Next detected scene: ${nextHeading}`,
    `- Current scene preview: ${memory.currentScene?.preview ?? "not available"}`,
    `- Same-scene context before this chunk: ${memory.localSceneContext.beforeChunk ?? "not available"}`,
    `- Same-scene context after this chunk: ${memory.localSceneContext.afterChunk ?? "not available"}`,
    `- Scene memory status: ${memory.skippedReason ?? "scene_memory_available"}`,
    "- Use scene memory to decide whether dialogue/action belongs to one dramatic beat, whether a line is setup/payoff, and whether the tone is endorsement, condemnation, narration, dream logic, or neutral mention.",
    "- Do not cite scene-memory excerpts as evidence unless the exact quoted text also appears inside the current chunk.",
  ].join("\n");
}
