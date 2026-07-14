import type { V3StageHash, V3StageTiming } from "../pipeline/pipelineTypes.js";
import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";
import type { LegalContextResult, LegalEvidenceResult, LegalNarrativeResult, LegalSemanticResult } from "../legal/legalTypes.js";
import type { LegalDecision } from "../legal/legalDecision.js";

export type AnalysisDiagnostics = Readonly<{
  executionOrder: readonly ["build_prompt", "reasoning_pipeline", "semantic_layer", "intelligence_layer", "legal_engine", "module_evaluation", "analysis_response"];
  promptHash: string;
  semanticHash: string;
  legalHash: string;
  stageHashes: readonly V3StageHash[];
  stageTimings: readonly V3StageTiming[];
}>;

export type AnalysisResponse = Readonly<{
  promptHash: string;
  semanticHash: string;
  legalHash: string;
  stageHashes: readonly V3StageHash[];
  stageTimings: readonly V3StageTiming[];
  narrative: LegalNarrativeResult;
  evidence: LegalEvidenceResult;
  semantic: LegalSemanticResult;
  context: LegalContextResult;
  intelligence: IntelligenceContext;
  legalDecision: LegalDecision;
  diagnostics: AnalysisDiagnostics;
}>;
