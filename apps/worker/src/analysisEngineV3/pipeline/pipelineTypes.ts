import type { LegalModuleRegistry } from "../legal/legalModuleRegistry.js";
import type { V3PromptGlossary } from "../builder/builderTypes.js";

export type V3PipelineChunk = Readonly<{
  text: string;
  startOffset: number;
  endOffset: number;
  chunkIndex: number;
  storyMemory?: string | null;
  sceneMemory?: string | null;
  neighboringSentences?: readonly string[];
  metadata?: Readonly<Record<string, unknown>> | null;
}>;

export type V3PipelineDiagnostics = Readonly<{
  enabled: boolean;
}>;

export type V3StageTiming = Readonly<{
  stage: "narrative" | "evidence" | "semantic" | "context" | "intelligence" | "legal";
  durationMs: number | null;
}>;

export type V3StageHash = Readonly<{
  stage: "narrative" | "evidence" | "semantic" | "context" | "intelligence" | "legal";
  hash: string;
}>;

export type V3PipelineStageTrace = readonly ["narrative", "evidence", "semantic", "context", "intelligence", "legal"];

export type V3PipelineInput = Readonly<{
  moduleId: string;
  chunk: V3PipelineChunk;
  glossary: V3PromptGlossary;
  registry?: LegalModuleRegistry | null;
  diagnostics?: V3PipelineDiagnostics | null;
}>;
