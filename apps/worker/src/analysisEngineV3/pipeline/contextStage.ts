import type { LegalContextResult, LegalEvidenceResult, LegalNarrativeResult, LegalSemanticResult } from "../legal/legalTypes.js";
import type { V3PipelineChunk } from "./pipelineTypes.js";

function evidenceText(evidence: LegalEvidenceResult): string {
  if (evidence.primaryCandidateIndex === null) return "";
  return evidence.candidates[evidence.primaryCandidateIndex]?.text ?? "";
}

export function runContextStage(args: {
  chunk: V3PipelineChunk;
  narrative: LegalNarrativeResult;
  evidence: LegalEvidenceResult;
  semantic: LegalSemanticResult;
}): LegalContextResult {
  const { chunk, narrative, evidence, semantic } = args;
  const primaryEvidence = evidenceText(evidence);
  const localContext = chunk.text;
  const chunkContext = `chunk_index=${chunk.chunkIndex}; start=${chunk.startOffset}; end=${chunk.endOffset}`;
  const neighboringSentences = chunk.neighboringSentences ? [...chunk.neighboringSentences] : [];
  const narrativeContext = [
    semantic.semanticMeaning,
    narrative.narrativeIntent,
    narrative.narrativeVoice,
    narrative.emotionalTone,
    chunk.storyMemory ? `Story: ${chunk.storyMemory}` : null,
    chunk.sceneMemory ? `Scene: ${chunk.sceneMemory}` : null,
    neighboringSentences.length > 0 ? `Neighbors: ${neighboringSentences.join(" | ")}` : null,
    primaryEvidence ? `Evidence: ${primaryEvidence}` : null,
  ]
    .filter(Boolean)
    .join(" || ");

  return Object.freeze({
    storyMemory: chunk.storyMemory ?? null,
    sceneMemory: chunk.sceneMemory ?? null,
    localContext,
    chunkContext,
    neighboringSentences,
    narrativeContext,
    confidence: Number(Math.min(1, (narrative.confidence + semantic.confidence + evidence.confidence) / 3).toFixed(6)),
    notes: [],
  });
}
