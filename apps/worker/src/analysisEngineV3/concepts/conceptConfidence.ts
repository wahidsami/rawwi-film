import type { ConceptConfidence } from "./conceptTypes.js";

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function combineConfidence(values: readonly number[]): number {
  let remaining = 1;
  for (const value of values) {
    remaining *= 1 - clamp(value);
  }
  return clamp(1 - remaining);
}

export function normalizeConceptConfidence(input: Partial<ConceptConfidence>): ConceptConfidence {
  const narrative = clamp(input.narrative ?? 0);
  const semantic = clamp(input.semantic ?? 0);
  const storyMemory = clamp(input.storyMemory ?? 0);
  const entity = clamp(input.entity ?? 0);
  const glossary = clamp(input.glossary ?? 0);
  const evidence = clamp(input.evidence ?? 0);
  return Object.freeze({
    narrative,
    semantic,
    storyMemory,
    entity,
    glossary,
    evidence,
    total: combineConfidence([narrative, semantic, storyMemory, entity, glossary, evidence]),
  });
}

export function clampConceptConfidence(value: number): number {
  return clamp(value);
}

