import type { LegalContextResult, LegalEvidenceResult, LegalNarrativeResult, LegalSemanticResult } from "../legal/legalTypes.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { V3PipelineChunk, V3StageHash, V3StageTiming } from "./pipelineTypes.js";
import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";

export type V3PipelineResult = Readonly<{
  moduleId: string;
  chunk: V3PipelineChunk;
  narrative: LegalNarrativeResult;
  evidence: LegalEvidenceResult;
  semantic: LegalSemanticResult;
  context: LegalContextResult;
  intelligence: IntelligenceContext;
  legalDecision: LegalDecision;
  stageTrace: readonly ["narrative", "evidence", "semantic", "context", "intelligence", "legal"];
  stageHashes: readonly V3StageHash[];
  stageTimings: readonly V3StageTiming[];
}>;

export function createV3PipelineResult(result: V3PipelineResult): V3PipelineResult {
  return Object.freeze({
    ...result,
    stageTrace: [...result.stageTrace] as readonly ["narrative", "evidence", "semantic", "context", "intelligence", "legal"],
    stageHashes: result.stageHashes.map((stage) => Object.freeze({ ...stage })),
    stageTimings: result.stageTimings.map((stage) => Object.freeze({ ...stage })),
  });
}
