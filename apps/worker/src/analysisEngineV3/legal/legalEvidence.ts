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
    quote: result.quote ?? null,
    scene: result.scene ?? null,
    page: result.page ?? null,
    evidenceType: result.evidenceType ?? "unknown",
    observedFacts: result.observedFacts ? [...result.observedFacts] : [],
    notes: result.notes ? [...result.notes] : undefined,
  };
}
