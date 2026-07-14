import type { LegalEvidenceCandidate, LegalEvidenceResult } from "./legalTypes.js";

export type { LegalEvidenceCandidate, LegalEvidenceResult } from "./legalTypes.js";

export function createLegalEvidenceCandidate(candidate: LegalEvidenceCandidate): LegalEvidenceCandidate {
  return {
    text: candidate.text,
    startOffset: candidate.startOffset,
    endOffset: candidate.endOffset,
    confidence: Number(candidate.confidence.toFixed(6)),
    source: candidate.source,
    notes: candidate.notes ? [...candidate.notes] : undefined,
  };
}

export function createLegalEvidenceResult(result: LegalEvidenceResult): LegalEvidenceResult {
  return {
    candidates: result.candidates.map(createLegalEvidenceCandidate),
    primaryCandidateIndex: result.primaryCandidateIndex,
    admissible: result.admissible,
    confidence: Number(result.confidence.toFixed(6)),
    notes: result.notes ? [...result.notes] : undefined,
  };
}

