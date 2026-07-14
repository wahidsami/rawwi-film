import { createHash } from "node:crypto";
import type { AnalysisDiagnostics, AnalysisResponse } from "./analysisResponse.js";

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`).join(",")}}`;
}

export function hashForDiagnostics(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}

export function createAnalysisDiagnostics(input: {
  promptHash: string;
  stageHashes: AnalysisResponse["stageHashes"];
  stageTimings: AnalysisResponse["stageTimings"];
  semantic: AnalysisResponse["semantic"];
  legalDecision: AnalysisResponse["legalDecision"];
}): AnalysisDiagnostics {
  return Object.freeze({
    executionOrder: ["build_prompt", "reasoning_pipeline", "semantic_layer", "intelligence_layer", "legal_engine", "module_evaluation", "analysis_response"] as const,
    promptHash: input.promptHash,
    semanticHash: hashForDiagnostics(input.semantic),
    legalHash: hashForDiagnostics(input.legalDecision),
    stageHashes: input.stageHashes,
    stageTimings: input.stageTimings,
  });
}
