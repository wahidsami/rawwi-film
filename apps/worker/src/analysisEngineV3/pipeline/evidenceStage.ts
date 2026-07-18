import type { LegalEvidenceResult } from "../legal/legalTypes.js";
import type { V3PipelineChunk } from "./pipelineTypes.js";
import { isProfanityEvidenceText } from "../legal/modules/profanity/profanityModule.js";
import { splitSentenceEvidenceCandidates } from "../evidence/evidenceCandidates.js";

function findPrimaryCandidateIndex(candidates: readonly { readonly text: string }[]): number {
  const index = candidates.findIndex((candidate) => isProfanityEvidenceText(candidate.text));
  return index >= 0 ? index : 0;
}

export function runEvidenceStage(chunk: V3PipelineChunk): LegalEvidenceResult {
  const raw = chunk.text;
  const sentenceCandidates = splitSentenceEvidenceCandidates(raw, chunk.startOffset, 0.9);
  if (sentenceCandidates.length > 0) {
    const hasProfanityCandidate = sentenceCandidates.some((candidate) => isProfanityEvidenceText(candidate.text));
    return Object.freeze({
      candidates: sentenceCandidates,
      primaryCandidateIndex: findPrimaryCandidateIndex(sentenceCandidates),
      admissible: true,
      confidence: hasProfanityCandidate ? 0.99 : 0.9,
      notes: ["sentence_level_evidence_candidates"],
    });
  }

  return Object.freeze({
    candidates: [
      Object.freeze({
        text: raw.trim(),
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        confidence: 0.9,
        source: "chunk" as const,
        notes: [],
      }),
    ],
    primaryCandidateIndex: 0,
    admissible: true,
    confidence: 0.9,
    notes: isProfanityEvidenceText(raw) ? [] : ["no literal profanity detected"],
  });
}
