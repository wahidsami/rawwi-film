import { normalizeDecisionRecordVersion } from "./decisionRecordVersioning.js";
import type { DecisionRecord, DecisionRecordGCAMMapping } from "./decisionRecordTypes.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeList(values: readonly string[]): readonly string[] {
  return Object.freeze(values.map((value) => normalizeText(value)).filter(Boolean));
}

function toStringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map(normalizeText) : [];
}

function toMappings(value: unknown): readonly DecisionRecordGCAMMapping[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value
      .filter(isPlainObject)
      .map((mapping) =>
        Object.freeze({
          article_id: typeof mapping.article_id === "number" && Number.isFinite(mapping.article_id) ? mapping.article_id : 0,
          atom_ids: Object.freeze(
            Array.isArray(mapping.atom_ids)
              ? [...new Set(mapping.atom_ids.filter((entry): entry is string => typeof entry === "string").map(normalizeText).filter(Boolean))].sort((left, right) => left.localeCompare(right))
              : [],
          ),
          note: typeof mapping.note === "string" ? normalizeText(mapping.note) : null,
        }),
      ),
  );
}

export function parseDecisionRecord(input: unknown): DecisionRecord {
  if (!isPlainObject(input)) {
    throw new Error("Decision record must be a JSON object");
  }

  return Object.freeze({
    id: typeof input.id === "string" ? normalizeText(input.id) : "",
    version: normalizeDecisionRecordVersion(input.version),
    title: typeof input.title === "string" ? normalizeText(input.title) : "",
    summary: typeof input.summary === "string" ? normalizeText(input.summary) : "",
    originalScenario: typeof input.originalScenario === "string" ? normalizeText(input.originalScenario) : "",
    reviewQuestion: typeof input.reviewQuestion === "string" ? normalizeText(input.reviewQuestion) : "",
    initialSuspicion: typeof input.initialSuspicion === "string" ? normalizeText(input.initialSuspicion) : "",
    possibleConcepts: normalizeList(toStringList(input.possibleConcepts)),
    supportingEvidence: normalizeList(toStringList(input.supportingEvidence)),
    contradictingEvidence: normalizeList(toStringList(input.contradictingEvidence)),
    requiredMissingEvidence: normalizeList(toStringList(input.requiredMissingEvidence)),
    sceneContext: typeof input.sceneContext === "string" ? normalizeText(input.sceneContext) : "",
    speakerAnalysis: typeof input.speakerAnalysis === "string" ? normalizeText(input.speakerAnalysis) : "",
    targetAnalysis: typeof input.targetAnalysis === "string" ? normalizeText(input.targetAnalysis) : "",
    intentAnalysis: typeof input.intentAnalysis === "string" ? normalizeText(input.intentAnalysis) : "",
    reasoningSteps: normalizeList(toStringList(input.reasoningSteps)),
    reviewerDecision: typeof input.reviewerDecision === "string" ? normalizeText(input.reviewerDecision) : "",
    confidence: typeof input.confidence === "string" ? normalizeText(input.confidence).toLowerCase() : "",
    findingType: typeof input.findingType === "string" ? normalizeText(input.findingType) : "",
    gcamMappings: toMappings(input.gcamMappings),
    falsePositiveRisk: typeof input.falsePositiveRisk === "string" ? normalizeText(input.falsePositiveRisk) : "",
    reviewerNotes: typeof input.reviewerNotes === "string" ? normalizeText(input.reviewerNotes) : "",
    benchmarkTags: normalizeList(toStringList(input.benchmarkTags)),
    relatedLessons: normalizeList(toStringList(input.relatedLessons)),
    relatedPatterns: normalizeList(toStringList(input.relatedPatterns)),
    relatedBlueprintConcepts: normalizeList(toStringList(input.relatedBlueprintConcepts)),
  });
}
