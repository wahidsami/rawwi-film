export type ConceptSeverity = "low" | "medium" | "high" | "critical";

export type ConceptNormalizationEntry = Readonly<{
  evidenceId: string;
  originalText: string;
  normalizedText: string;
  comparisonText: string;
}>;

export type ConceptDedupDecision = Readonly<{
  keptConceptId: string;
  droppedConceptId: string;
  reason: string;
  matchedBy: "concept_identity" | "evidence_identity" | "normalized_text";
}>;

export type ConceptRecord = Readonly<{
  id: string;
  evidenceId: string;
  evidenceSpanId: string;
  conceptId: string;
  conceptName: string;
  conceptCategory: string;
  confidence: number;
  severity: ConceptSeverity;
  targets: readonly string[];
  participants: readonly string[];
  reason: string;
  supportingEvidenceIds: readonly string[];
  evidenceSpanIds: readonly string[];
  knowledgeDomains: readonly string[];
  label: string;
  rationale: readonly string[];
}>;

export type ConceptCollection = Readonly<{
  sceneId: string;
  evidenceCollectionId: string | null;
  concepts: readonly ConceptRecord[];
  dedupDecisions: readonly ConceptDedupDecision[];
  normalization: readonly ConceptNormalizationEntry[];
  classificationOutput: readonly string[];
  confidence: number;
  executionTimeMs: number;
}>;

