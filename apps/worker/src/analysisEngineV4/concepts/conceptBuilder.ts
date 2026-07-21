import type { EvidenceCollection, Evidence } from "../evidence/evidenceTypes.js";
import type { SceneAnalysisConcept } from "../sceneAnalysisState.js";
import { classifyEvidence } from "./conceptClassifier.js";
import { deduplicateConceptRecords } from "./conceptDeduplicator.js";
import { normalizeConceptText } from "./conceptNormalizer.js";
import type { ConceptCollection, ConceptNormalizationEntry, ConceptRecord } from "./conceptTypes.js";

function toLegacyConcept(record: ConceptRecord): SceneAnalysisConcept {
  return Object.freeze({
    conceptId: record.conceptId,
    label: record.conceptName,
    knowledgeDomains: record.knowledgeDomains,
    evidenceSpanIds: record.evidenceSpanIds,
    confidence: record.confidence,
    rationale: record.rationale,
  });
}

function buildNormalizationEntry(evidence: Evidence): ConceptNormalizationEntry {
  const rawText = evidence.text ?? evidence.rawText ?? "";
  const normalizedText = normalizeConceptText(rawText);
  return Object.freeze({
    evidenceId: evidence.id,
    originalText: rawText,
    normalizedText,
    comparisonText: normalizedText,
  });
}

function buildEmptyCollection(sceneId: string, evidenceCollectionId: string | null): ConceptCollection {
  return Object.freeze({
    sceneId,
    evidenceCollectionId,
    concepts: Object.freeze([]),
    dedupDecisions: Object.freeze([]),
    normalization: Object.freeze([]),
    classificationOutput: Object.freeze([]),
    confidence: 0,
    executionTimeMs: 0,
  });
}

export function buildConceptCollection(evidenceCollection: EvidenceCollection | null, sceneIdFallback = "unknown-scene"): ConceptCollection {
  if (!evidenceCollection) {
    return buildEmptyCollection(sceneIdFallback, null);
  }

  const startedAt = Date.now();
  const normalization = evidenceCollection.evidence.map((evidence) => buildNormalizationEntry(evidence));
  const rawConceptRecords = evidenceCollection.evidence.flatMap((evidence) => classifyEvidence(evidence).records);
  const deduplicated = deduplicateConceptRecords(rawConceptRecords);
  const concepts = [...deduplicated.concepts].sort((left, right) => right.confidence - left.confidence || left.conceptId.localeCompare(right.conceptId) || left.evidenceId.localeCompare(right.evidenceId));
  const confidence = concepts.length === 0
    ? 0
    : Number((concepts.reduce((total, concept) => total + concept.confidence, 0) / concepts.length).toFixed(6));
  const classificationOutput = evidenceCollection.evidence.flatMap((evidence) => {
    const result = classifyEvidence(evidence);
    if (result.records.length === 0) {
      return [`${evidence.id}:none`];
    }
    return result.records.map((record) => `${record.id}:${record.confidence.toFixed(3)}`);
  });

  return Object.freeze({
    sceneId: evidenceCollection.sceneId,
    evidenceCollectionId: evidenceCollection.sceneId,
    concepts: Object.freeze(concepts),
    dedupDecisions: deduplicated.dedupDecisions,
    normalization: Object.freeze(normalization),
    classificationOutput: Object.freeze(classificationOutput),
    confidence,
    executionTimeMs: Math.max(0, Date.now() - startedAt),
  } as ConceptCollection);
}

export function buildLegacyConceptsFromCollection(collection: ConceptCollection): readonly SceneAnalysisConcept[] {
  return Object.freeze(collection.concepts.map((concept) => toLegacyConcept(concept)));
}

export function buildConceptSummaryForTrace(collection: ConceptCollection): string {
  if (collection.concepts.length === 0) {
    return "No semantic concepts detected.";
  }

  return collection.concepts
    .map((concept) => `${concept.conceptName}:${concept.conceptId}(${concept.confidence.toFixed(3)})`)
    .join(", ");
}
