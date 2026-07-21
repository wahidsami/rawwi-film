import { uniqueSorted } from "./conceptNormalizer.js";
import type { ConceptDedupDecision, ConceptRecord } from "./conceptTypes.js";

export type DeduplicatedConcepts = Readonly<{
  concepts: readonly ConceptRecord[];
  dedupDecisions: readonly ConceptDedupDecision[];
}>;

function conceptIdentity(concept: ConceptRecord): string {
  return `${concept.conceptId}|${concept.evidenceId}`;
}

function mergeConceptRecords(left: ConceptRecord, right: ConceptRecord): ConceptRecord {
  const confidence = Math.max(left.confidence, right.confidence);
  return Object.freeze({
    ...left,
    confidence: Number(confidence.toFixed(6)),
    targets: uniqueSorted([...left.targets, ...right.targets]),
    participants: uniqueSorted([...left.participants, ...right.participants]),
    supportingEvidenceIds: uniqueSorted([...left.supportingEvidenceIds, ...right.supportingEvidenceIds]),
    evidenceSpanIds: uniqueSorted([...left.evidenceSpanIds, ...right.evidenceSpanIds]),
    knowledgeDomains: uniqueSorted([...left.knowledgeDomains, ...right.knowledgeDomains]),
    rationale: Object.freeze([
      ...left.rationale,
      ...right.rationale.filter((item) => !left.rationale.includes(item)),
    ]),
  });
}

export function deduplicateConceptRecords(records: readonly ConceptRecord[]): DeduplicatedConcepts {
  const deduped = new Map<string, ConceptRecord>();
  const dedupDecisions: ConceptDedupDecision[] = [];

  for (const record of records) {
    const key = conceptIdentity(record);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, record);
      continue;
    }

    const merged = mergeConceptRecords(existing, record);
    deduped.set(key, merged);
    dedupDecisions.push(Object.freeze({
      keptConceptId: existing.id,
      droppedConceptId: record.id,
      reason: "Merged duplicate concept produced for the same grounded evidence span.",
      matchedBy: "concept_identity",
    }));
  }

  return Object.freeze({
    concepts: Object.freeze([...deduped.values()]),
    dedupDecisions: Object.freeze(dedupDecisions),
  });
}

