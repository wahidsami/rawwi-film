import type { DecisionRecord, DecisionRecordSearchQuery, DecisionRecordSearchResult } from "./decisionRecordTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function includes(haystack: string, needle: string | null | undefined): boolean {
  return typeof needle === "string" && needle.trim().length > 0 && haystack.includes(normalizeText(needle));
}

function decisionRecordText(record: DecisionRecord): string {
  return [
    record.id,
    record.version,
    record.title,
    record.summary,
    record.originalScenario,
    record.reviewQuestion,
    record.initialSuspicion,
    ...record.possibleConcepts,
    ...record.supportingEvidence,
    ...record.contradictingEvidence,
    ...record.requiredMissingEvidence,
    record.sceneContext,
    record.speakerAnalysis,
    record.targetAnalysis,
    record.intentAnalysis,
    ...record.reasoningSteps,
    record.reviewerDecision,
    record.confidence,
    record.findingType,
    ...record.gcamMappings.flatMap((mapping) => [String(mapping.article_id), ...mapping.atom_ids, mapping.note ?? ""]),
    record.falsePositiveRisk,
    record.reviewerNotes,
    ...record.benchmarkTags,
    ...record.relatedLessons,
    ...record.relatedPatterns,
    ...record.relatedBlueprintConcepts,
  ].join(" ").toLowerCase();
}

export function searchDecisionRecords(records: readonly DecisionRecord[], query: DecisionRecordSearchQuery): readonly DecisionRecordSearchResult[] {
  const needle = normalizeText([
    query.concept,
    query.lesson,
    query.pattern,
    query.benchmarkTag,
    query.confidence,
    query.target,
    query.intent,
    query.keyword,
    query.article === null || query.article === undefined ? "" : String(query.article),
  ].filter(Boolean).join(" "));

  const results: DecisionRecordSearchResult[] = [];
  for (const record of records) {
    const reasons: string[] = [];
    let score = 0;
    const text = decisionRecordText(record);

    if (includes(text, query.concept) || record.possibleConcepts.some((concept) => includes(normalizeText(concept), query.concept))) {
      score += 300;
      reasons.push("concept");
    }
    if (includes(text, query.lesson) || record.relatedLessons.some((lesson) => includes(normalizeText(lesson), query.lesson))) {
      score += 250;
      reasons.push("lesson");
    }
    if (includes(text, query.pattern) || record.relatedPatterns.some((pattern) => includes(normalizeText(pattern), query.pattern))) {
      score += 250;
      reasons.push("pattern");
    }
    if (typeof query.article === "number" && record.gcamMappings.some((mapping) => mapping.article_id === query.article)) {
      score += 225;
      reasons.push("article");
    }
    if (includes(text, query.benchmarkTag) || record.benchmarkTags.some((tag) => includes(normalizeText(tag), query.benchmarkTag))) {
      score += 200;
      reasons.push("benchmark");
    }
    if (includes(normalizeText(record.confidence), query.confidence)) {
      score += 150;
      reasons.push("confidence");
    }
    if (includes(text, query.target) || includes(normalizeText(record.targetAnalysis), query.target)) {
      score += 125;
      reasons.push("target");
    }
    if (includes(text, query.intent) || includes(normalizeText(record.intentAnalysis), query.intent)) {
      score += 125;
      reasons.push("intent");
    }
    if (needle.length > 0 && text.includes(needle)) {
      score += 50;
      reasons.push("keyword");
    }

    if (score > 0) {
      results.push(Object.freeze({
        record,
        score,
        reasons: Object.freeze([...new Set(reasons)].sort((left, right) => left.localeCompare(right))),
      }));
    }
  }

  return Object.freeze(results.sort((left, right) =>
    right.score - left.score ||
    left.record.id.localeCompare(right.record.id) ||
    left.record.version.localeCompare(right.record.version),
  ));
}
