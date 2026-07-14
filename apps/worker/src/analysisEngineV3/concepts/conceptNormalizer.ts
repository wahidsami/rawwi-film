import type { Concept, ConceptContext, ConceptEvidenceSource } from "./conceptTypes.js";
import { normalizeConceptConfidence, clampConceptConfidence } from "./conceptConfidence.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function sourceKey(source: ConceptEvidenceSource): string {
  return [
    source.sourceType,
    source.sourceText,
    source.originatingSentence ?? "",
    source.entityId ?? "",
    source.glossaryTerm ?? "",
  ].join("|");
}

function mergeConcepts(concepts: readonly Concept[]): readonly Concept[] {
  const merged = new Map<string, Concept>();

  for (const concept of concepts) {
    const existing = merged.get(concept.id);
    if (!existing) {
      merged.set(concept.id, concept);
      continue;
    }

    merged.set(concept.id, Object.freeze({
      id: concept.id,
      label: existing.label || concept.label,
      confidence: normalizeConceptConfidence({
        narrative: Math.max(existing.confidence.narrative, concept.confidence.narrative),
        semantic: Math.max(existing.confidence.semantic, concept.confidence.semantic),
        storyMemory: Math.max(existing.confidence.storyMemory, concept.confidence.storyMemory),
        entity: Math.max(existing.confidence.entity, concept.confidence.entity),
        glossary: Math.max(existing.confidence.glossary, concept.confidence.glossary),
        evidence: Math.max(existing.confidence.evidence, concept.confidence.evidence),
      }),
      evidenceSources: Object.freeze(
        [...new Map([...existing.evidenceSources, ...concept.evidenceSources].map((source) => [sourceKey(source), source])).values()].sort((left, right) =>
          left.sourceType.localeCompare(right.sourceType) ||
          left.sourceText.localeCompare(right.sourceText) ||
          (left.originatingSentence ?? "").localeCompare(right.originatingSentence ?? "") ||
          (left.entityId ?? "").localeCompare(right.entityId ?? "") ||
          (left.glossaryTerm ?? "").localeCompare(right.glossaryTerm ?? ""),
        ),
      ),
      originatingSentences: uniqueSorted([...existing.originatingSentences, ...concept.originatingSentences]),
      entityReferences: uniqueSorted([...existing.entityReferences, ...concept.entityReferences]),
      glossaryReferences: uniqueSorted([...existing.glossaryReferences, ...concept.glossaryReferences]),
    }));
  }

  return Object.freeze([...merged.values()].sort((left, right) =>
    right.confidence.total - left.confidence.total ||
    left.id.localeCompare(right.id),
  ));
}

export function createEmptyConceptContext(): ConceptContext {
  return Object.freeze({
    concepts: Object.freeze([]),
    conceptIds: Object.freeze([]),
    primaryConceptId: null,
    confidence: 0,
    conceptCount: 0,
  });
}

export function normalizeConceptContext(context: ConceptContext): ConceptContext {
  const concepts = mergeConcepts(context.concepts);
  const conceptIds = Object.freeze(concepts.map((concept) => concept.id));
  const primaryConceptId = concepts[0]?.id ?? null;
  const confidence = concepts.length > 0 ? clampConceptConfidence(concepts[0].confidence.total) : 0;

  return Object.freeze({
    concepts,
    conceptIds,
    primaryConceptId,
    confidence,
    conceptCount: concepts.length,
  });
}
