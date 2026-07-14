import { createHash } from "node:crypto";
import type { AnalysisResponse } from "../engine/analysisResponse.js";

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`).join(",")}}`;
}

export type V3RuntimeDiagnostics = Readonly<{
  engineVersion: "v3";
  providerName: string;
  modelName: string;
  modelVersion: string | null;
  rawResponseHash: string;
  responseId: string | null;
  responseTimestamp: string | null;
  promptHash: string;
  semanticHash: string;
  legalHash: string;
  executionSignatureHash: string | null;
  stageHashes: AnalysisResponse["stageHashes"];
  stageTimings: AnalysisResponse["stageTimings"];
  subjectModuleId: string;
  chunkHash: string;
  findingCount: number;
}>;

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}

export function createV3RuntimeDiagnostics(input: {
  analysisResponse: AnalysisResponse;
  providerName: string;
  modelName: string;
  modelVersion: string | null;
  rawResponseHash: string;
  responseId: string | null;
  responseTimestamp: string | null;
  promptHash: string;
  executionSignatureHash: string | null;
  subjectModuleId: string;
  chunkText: string;
  findingCount: number;
}): V3RuntimeDiagnostics {
  return Object.freeze({
    engineVersion: "v3",
    providerName: input.providerName,
    modelName: input.modelName,
    modelVersion: input.modelVersion,
    rawResponseHash: input.rawResponseHash,
    responseId: input.responseId,
    responseTimestamp: input.responseTimestamp,
    promptHash: input.promptHash,
    semanticHash: hash(input.analysisResponse.semantic),
    legalHash: hash(input.analysisResponse.legalDecision),
    executionSignatureHash: input.executionSignatureHash,
    stageHashes: input.analysisResponse.stageHashes,
    stageTimings: input.analysisResponse.stageTimings,
    subjectModuleId: input.subjectModuleId,
    chunkHash: hash(input.chunkText),
    findingCount: input.findingCount,
  });
}
