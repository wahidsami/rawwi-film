import type { ChunkContextEnvelope } from "./contextMemory.js";
import type { ChunkSceneMemory } from "./sceneMemory.js";
import type { ScriptMemoryPayload } from "./scriptMemory.js";

const DEFAULT_STAGE_BUDGETS = {
  chunk: 1400,
  scene: 1400,
  script: 1600,
};

function compact(text: string | null | undefined, maxChars: number): string | null {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 1))}…`;
}

function summarizeScript(scriptMemory: ScriptMemoryPayload): string | null {
  if (scriptMemory.summary?.synopsis_ar) {
    return scriptMemory.summary.synopsis_ar;
  }
  const opening = scriptMemory.sampledWindows.opening;
  const middle = scriptMemory.sampledWindows.middle;
  const ending = scriptMemory.sampledWindows.ending;
  return [opening, middle, ending].filter(Boolean).join(" | ") || null;
}

export type Memory2StageBundle = {
  stages: {
    chunk: string | null;
    scene: string | null;
    script: string | null;
  };
  usedChars: {
    chunk: number;
    scene: number;
    script: number;
    total: number;
  };
  budgets: typeof DEFAULT_STAGE_BUDGETS;
};

export function buildMemory2StageBundle(args: {
  contextEnvelope: ChunkContextEnvelope;
  sceneMemory: ChunkSceneMemory;
  scriptMemory: ScriptMemoryPayload;
  budgets?: Partial<typeof DEFAULT_STAGE_BUDGETS>;
}): Memory2StageBundle {
  const budgets = { ...DEFAULT_STAGE_BUDGETS, ...(args.budgets ?? {}) };

  const chunkStage = compact(
    [
      args.contextEnvelope.memory.previousExcerpt,
      args.contextEnvelope.memory.nextExcerpt,
      args.contextEnvelope.memory.dialogueTurns.length > 0
        ? args.contextEnvelope.memory.dialogueTurns.map((turn) => `${turn.speaker}: ${turn.textPreview}`).join(" | ")
        : null,
    ]
      .filter(Boolean)
      .join(" | "),
    budgets.chunk,
  );

  const sceneStage = compact(
    [
      args.sceneMemory.currentScene?.heading ? `scene=${args.sceneMemory.currentScene.heading}` : null,
      args.sceneMemory.localSceneContext.beforeChunk,
      args.sceneMemory.localSceneContext.afterChunk,
      args.sceneMemory.currentScene?.preview,
    ]
      .filter(Boolean)
      .join(" | "),
    budgets.scene,
  );

  const scriptStage = compact(
    [
      summarizeScript(args.scriptMemory),
      args.scriptMemory.speakerHints.length > 0
        ? `speakers=${args.scriptMemory.speakerHints.join("، ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" | "),
    budgets.script,
  );

  const usedChars = {
    chunk: chunkStage?.length ?? 0,
    scene: sceneStage?.length ?? 0,
    script: scriptStage?.length ?? 0,
    total: (chunkStage?.length ?? 0) + (sceneStage?.length ?? 0) + (scriptStage?.length ?? 0),
  };

  return {
    stages: {
      chunk: chunkStage,
      scene: sceneStage,
      script: scriptStage,
    },
    usedChars,
    budgets,
  };
}

export function buildMemory2StagePromptContext(bundle: Memory2StageBundle): string {
  return [
    `Memory2 staged context (strict budgeted retrieval):`,
    `- Stage chunk (${bundle.usedChars.chunk}/${bundle.budgets.chunk} chars): ${bundle.stages.chunk ?? "not available"}`,
    `- Stage scene (${bundle.usedChars.scene}/${bundle.budgets.scene} chars): ${bundle.stages.scene ?? "not available"}`,
    `- Stage script (${bundle.usedChars.script}/${bundle.budgets.script} chars): ${bundle.stages.script ?? "not available"}`,
    `- Total staged memory chars: ${bundle.usedChars.total}`,
    "- Use staged memory only for interpretation and continuity.",
    "- Evidence must still be literal text from the current chunk.",
  ].join("\n");
}

