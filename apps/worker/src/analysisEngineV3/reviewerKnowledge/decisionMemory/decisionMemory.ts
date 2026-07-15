import { createDecisionRecordRegistry } from "../decisionRecords/decisionRecordRegistry.js";
import type { DecisionRecord } from "../decisionRecords/decisionRecordTypes.js";
import { hashDecisionMemoryValue, includesDecisionMemoryText, normalizeDecisionMemoryText, uniqueDecisionMemoryNumbers, uniqueDecisionMemoryStrings } from "./decisionMemoryUtils.js";
import type {
  DecisionMemoryEntry,
  DecisionMemoryInputs,
  DecisionMemoryRegistry,
  DecisionMemorySearchQuery,
  DecisionMemorySearchResult,
  DecisionMemoryValidationIssue,
  DecisionMemoryValidationResult,
} from "./decisionMemoryTypes.js";

function pushIssue(
  issues: DecisionMemoryValidationIssue[],
  severity: DecisionMemoryValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function statusForRecord(record: DecisionRecord): DecisionMemoryEntry["status"] {
  const findingType = normalizeDecisionMemoryText(record.findingType).toLowerCase();
  const decision = normalizeDecisionMemoryText(record.reviewerDecision).toLowerCase();
  const confidence = normalizeDecisionMemoryText(record.confidence).toLowerCase();

  if (findingType === "match" || decision.includes("accepted") || decision.includes("supported")) {
    return "accepted";
  }
  if (findingType === "reject" || decision.includes("rejected") || decision.includes("not established") || confidence === "no_finding") {
    return "rejected";
  }
  return "needs_review";
}

function confidenceScore(record: DecisionRecord): number {
  const confidence = normalizeDecisionMemoryText(record.confidence).toLowerCase();
  if (confidence === "high" || confidence === "very_high") return 0.95;
  if (confidence === "medium") return 0.75;
  if (confidence === "low" || confidence === "very_low") return 0.45;
  if (confidence === "needs_review") return 0.5;
  if (confidence === "no_finding") return 0.2;
  return 0.65;
}

function buildEntry(record: DecisionRecord): DecisionMemoryEntry {
  const articleIds = uniqueDecisionMemoryNumbers(record.gcamMappings.map((mapping) => mapping.article_id));
  const atomIds = uniqueDecisionMemoryStrings(record.gcamMappings.flatMap((mapping) => mapping.atom_ids));
  const concepts = uniqueDecisionMemoryStrings([
    ...record.possibleConcepts,
    ...record.relatedBlueprintConcepts,
    ...record.relatedLessons,
    ...record.relatedPatterns,
    ...record.benchmarkTags,
  ]);

  return Object.freeze({
    id: record.id,
    sourceId: record.id,
    status: statusForRecord(record),
    title: record.title,
    summary: record.summary,
    why: [record.reviewerDecision, record.reviewerNotes, record.falsePositiveRisk].filter((value) => value.length > 0).join(" "),
    confidence: record.confidence,
    confidenceScore: confidenceScore(record),
    evidence: uniqueDecisionMemoryStrings([
      ...record.supportingEvidence,
      ...record.contradictingEvidence,
      ...record.requiredMissingEvidence,
      record.originalScenario,
      record.sceneContext,
    ]),
    articleIds,
    atomIds,
    concepts,
    reasoning: uniqueDecisionMemoryStrings([
      record.initialSuspicion,
      record.sceneContext,
      record.speakerAnalysis,
      record.targetAnalysis,
      record.intentAnalysis,
      ...record.reasoningSteps,
    ]),
    benchmarkTags: uniqueDecisionMemoryStrings(record.benchmarkTags),
    relatedLessons: uniqueDecisionMemoryStrings(record.relatedLessons),
    relatedPatterns: uniqueDecisionMemoryStrings(record.relatedPatterns),
    relatedBlueprintConcepts: uniqueDecisionMemoryStrings(record.relatedBlueprintConcepts),
    falsePositiveRisk: record.falsePositiveRisk,
    reviewerDecision: record.reviewerDecision,
    findingType: record.findingType,
  });
}

function computeValidation(entries: readonly DecisionMemoryEntry[]): DecisionMemoryValidationResult {
  const issues: DecisionMemoryValidationIssue[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      pushIssue(issues, "error", "decision.duplicate", `decisions[${entry.id}]`, `Duplicate decision memory entry: ${entry.id}`);
    }
    seen.add(entry.id);
  }

  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(issues),
    hash: hashDecisionMemoryValue(entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      articleIds: entry.articleIds,
      concepts: entry.concepts,
    }))),
  });
}

function scoreEntry(entry: DecisionMemoryEntry, query: DecisionMemorySearchQuery): { score: number; reasons: readonly string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (typeof query.articleId === "number" && entry.articleIds.includes(query.articleId)) {
    score += 6;
    reasons.push("article");
  }

  if (query.status && entry.status === query.status) {
    score += 5;
    reasons.push("status");
  }

  if (includesDecisionMemoryText(entry.title, query.concept) || includesDecisionMemoryText(entry.summary, query.concept) || entry.concepts.some((concept) => includesDecisionMemoryText(concept, query.concept))) {
    score += 3;
    reasons.push("concept");
  }

  if (includesDecisionMemoryText([entry.why, ...entry.reasoning, ...entry.evidence].join(" "), query.keyword)) {
    score += 2;
    reasons.push("keyword");
  }

  if (includesDecisionMemoryText(entry.benchmarkTags.join(" "), query.benchmarkTag)) {
    score += 2;
    reasons.push("benchmark");
  }

  return {
    score,
    reasons: Object.freeze([...new Set(reasons)].sort((left, right) => left.localeCompare(right))),
  };
}

export function createDecisionMemoryRegistry(inputs?: Partial<DecisionMemoryInputs>): DecisionMemoryRegistry {
  const decisionRecords = inputs?.decisionRecords ?? createDecisionRecordRegistry().list();
  const entries = Object.freeze(decisionRecords.map((record) => buildEntry(record)).sort((left, right) => left.id.localeCompare(right.id)));
  const validation = computeValidation(entries);

  return Object.freeze({
    entries,
    validation,
    hash: hashDecisionMemoryValue({ entries, validation }),
    list: () => entries,
    get: (id: string) => entries.find((entry) => entry.id === id) ?? null,
    search: (query: DecisionMemorySearchQuery) =>
      Object.freeze(
        entries
          .map((entry) => {
            const scored = scoreEntry(entry, query);
            return Object.freeze({
              entry,
              score: scored.score,
              reasons: scored.reasons,
            }) as DecisionMemorySearchResult;
          })
          .filter((result) => result.score > 0)
          .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id)),
      ),
  });
}

export function createDefaultDecisionMemoryRegistry(): DecisionMemoryRegistry {
  return createDecisionMemoryRegistry();
}
