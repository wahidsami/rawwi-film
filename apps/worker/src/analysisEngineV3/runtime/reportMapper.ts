import type { V3RuntimeDiagnostics } from "./runtimeDiagnostics.js";
import type { V3RuntimeAdapterResult } from "./runtimeTypes.js";

export function buildRuntimeTruthLayerMeta(result: Pick<V3RuntimeAdapterResult, "analysisResponse" | "findings" | "diagnostics"> & Readonly<{ gptAssistant?: Record<string, unknown> | null }>): Record<string, unknown> {
  return {
    architecture: "v3_runtime_adapter",
    stage: "reasoning",
    engine_version: result.diagnostics.engineVersion,
    provider_name: result.diagnostics.providerName,
    model_name: result.diagnostics.modelName,
    model_version: result.diagnostics.modelVersion,
    prompt_hash: result.diagnostics.promptHash,
    semantic_hash: result.diagnostics.semanticHash,
    legal_hash: result.diagnostics.legalHash,
    raw_response_hash: result.diagnostics.rawResponseHash,
    execution_signature_hash: result.diagnostics.executionSignatureHash,
    stage_hashes: result.diagnostics.stageHashes,
    stage_timings: result.diagnostics.stageTimings,
    subject_module_id: result.diagnostics.subjectModuleId,
    chunk_hash: result.diagnostics.chunkHash,
    finding_count: result.diagnostics.findingCount,
    findings_count: result.findings.length,
    gpt_assistant: result.gptAssistant ?? null,
  };
}

export function buildRuntimeReportMetadata(diagnostics: V3RuntimeDiagnostics): Record<string, unknown> {
  return {
    engine_version: diagnostics.engineVersion,
    provider_name: diagnostics.providerName,
    model_name: diagnostics.modelName,
    model_version: diagnostics.modelVersion,
    prompt_hash: diagnostics.promptHash,
    semantic_hash: diagnostics.semanticHash,
    legal_hash: diagnostics.legalHash,
    raw_response_hash: diagnostics.rawResponseHash,
    execution_signature_hash: diagnostics.executionSignatureHash,
    stage_hashes: diagnostics.stageHashes,
    stage_timings: diagnostics.stageTimings,
    subject_module_id: diagnostics.subjectModuleId,
    chunk_hash: diagnostics.chunkHash,
    finding_count: diagnostics.findingCount,
  };
}
