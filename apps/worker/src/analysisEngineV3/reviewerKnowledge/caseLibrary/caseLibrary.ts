import { createDecisionRecordRegistry } from "../decisionRecords/decisionRecordRegistry.js";
import type { DecisionRecord } from "../decisionRecords/decisionRecordTypes.js";
import { createGcamKnowledgeRegistry } from "../gcamKnowledge/gcamKnowledgeRegistry.js";
import type { GcamArticleRecord, GcamKnowledgeRecord } from "../gcamKnowledge/gcamKnowledgeTypes.js";
import { hashStableCaseLibraryValue, includesCaseLibraryText, normalizeCaseLibraryText, uniqueCaseLibraryNumbers, uniqueCaseLibraryStrings } from "./caseLibraryUtils.js";
import type {
  CaseLibraryCase,
  CaseLibraryCaseCategory,
  CaseLibraryEntry,
  CaseLibraryRegistry,
  CaseLibrarySearchQuery,
  CaseLibrarySearchResult,
  CaseLibraryValidationIssue,
  CaseLibraryValidationResult,
} from "./caseLibraryTypes.js";

function pushIssue(
  issues: CaseLibraryValidationIssue[],
  severity: CaseLibraryValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function normalizeCategorySet(categories: readonly CaseLibraryCaseCategory[]): readonly CaseLibraryCaseCategory[] {
  return Object.freeze([...new Set(categories)].sort((left, right) => left.localeCompare(right)));
}

function decisionStatus(record: DecisionRecord): "accepted" | "rejected" | "needs_review" {
  const findingType = normalizeCaseLibraryText(record.findingType).toLowerCase();
  const decision = normalizeCaseLibraryText(record.reviewerDecision).toLowerCase();
  const confidence = normalizeCaseLibraryText(record.confidence).toLowerCase();

  if (findingType === "match" || decision.includes("accepted") || decision.includes("supported")) return "accepted";
  if (findingType === "reject" || decision.includes("rejected") || decision.includes("not established") || decision.includes("no finding")) return "rejected";
  if (confidence === "needs_review" || decision.includes("needs review") || decision.includes("review")) return "needs_review";
  return "needs_review";
}

function categoriesForGcamRecord(record: GcamKnowledgeRecord): readonly CaseLibraryCaseCategory[] {
  switch (record.kind) {
    case "reviewer_example":
      return Object.freeze(["positive", "similar"]);
    case "reviewer_comment":
    case "reviewer_observation":
    case "reviewer_note":
      return Object.freeze(["similar"]);
    case "reviewer_interpretation":
      return Object.freeze(["borderline", "similar"]);
    case "reviewer_exception":
      return Object.freeze(["negative", "counter"]);
    case "reviewer_correction":
      return Object.freeze(["false_positive", "counter"]);
    case "reviewer_disagreement":
      return Object.freeze(["borderline", "counter"]);
    case "knowledge_debt":
      return Object.freeze(["false_negative"]);
    case "article":
    case "atom":
      return Object.freeze(["similar"]);
    default:
      return Object.freeze(["similar"]);
  }
}

function categoriesForDecisionRecord(record: DecisionRecord): readonly CaseLibraryCaseCategory[] {
  const categories = new Set<CaseLibraryCaseCategory>(["similar"]);
  const status = decisionStatus(record);

  if (status === "accepted") categories.add("positive");
  if (status === "rejected") categories.add("negative");
  if (status === "needs_review") categories.add("borderline");
  if (normalizeCaseLibraryText(record.falsePositiveRisk).toLowerCase().includes("high")) categories.add("false_positive");
  if (record.requiredMissingEvidence.length > 0 || record.findingType === "no_finding") categories.add("false_negative");
  if (record.contradictingEvidence.length > 0 || record.reviewerDecision.toLowerCase().includes("disagree")) categories.add("counter");

  return normalizeCategorySet([...categories]);
}

function buildGcamCase(record: GcamKnowledgeRecord): CaseLibraryCase {
  const categories = categoriesForGcamRecord(record);
  return Object.freeze({
    id: record.id,
    sourceKind: "gcam_knowledge" as const,
    sourceId: record.id,
    primaryCategory: categories[0] ?? "similar",
    categories,
    title: record.title,
    summary: record.summary,
    articleIds: uniqueCaseLibraryNumbers(record.links.articleIds),
    atomIds: uniqueCaseLibraryStrings(record.links.atomIds),
    concepts: uniqueCaseLibraryStrings([
      ...record.links.conceptRefs,
      ...record.links.methodologyRefs,
      ...record.links.patternRefs,
      ...record.links.decisionRecordRefs,
      ...record.links.benchmarkRefs,
      ...record.links.knowledgeAcquisitionRecordRefs,
    ]),
    evidence: uniqueCaseLibraryStrings([...record.evidence, ...record.alternativeInterpretations, ...record.rejectedInterpretations]),
    reviewerExplanation: [record.reviewerComment, record.reviewerFinding].filter((value) => value.length > 0).join(" "),
    gcamReasoning: uniqueCaseLibraryStrings([record.reviewerComment, record.reviewerFinding, record.summary, ...record.evidence]),
    culturalReasoning: uniqueCaseLibraryStrings([record.summary, record.reviewerComment, ...record.alternativeInterpretations, ...record.rejectedInterpretations]),
    reviewerDecision: record.kind,
    confidence: record.confidence / 100,
    falsePositiveRisk: record.knowledgeDebtReference,
    relatedIds: uniqueCaseLibraryStrings([
      ...record.links.conceptRefs,
      ...record.links.methodologyRefs,
      ...record.links.patternRefs,
      ...record.links.decisionRecordRefs,
      ...record.links.benchmarkRefs,
      ...record.links.knowledgeAcquisitionRecordRefs,
    ]),
  });
}

function buildDecisionCase(record: DecisionRecord): CaseLibraryCase {
  const categories = categoriesForDecisionRecord(record);
  return Object.freeze({
    id: record.id,
    sourceKind: "decision_record" as const,
    sourceId: record.id,
    primaryCategory: categories[0] ?? "similar",
    categories,
    title: record.title,
    summary: record.summary,
    articleIds: uniqueCaseLibraryNumbers(record.gcamMappings.map((mapping) => mapping.article_id)),
    atomIds: uniqueCaseLibraryStrings(record.gcamMappings.flatMap((mapping) => mapping.atom_ids)),
    concepts: uniqueCaseLibraryStrings([
      ...record.possibleConcepts,
      ...record.relatedBlueprintConcepts,
      ...record.relatedLessons,
      ...record.relatedPatterns,
      ...record.benchmarkTags,
    ]),
    evidence: uniqueCaseLibraryStrings([
      ...record.supportingEvidence,
      ...record.contradictingEvidence,
      ...record.requiredMissingEvidence,
      record.originalScenario,
      record.sceneContext,
    ]),
    reviewerExplanation: [record.reviewerDecision, record.reviewerNotes].filter((value) => value.length > 0).join(" "),
    gcamReasoning: uniqueCaseLibraryStrings([
      record.initialSuspicion,
      record.sceneContext,
      record.speakerAnalysis,
      record.targetAnalysis,
      record.intentAnalysis,
      ...record.reasoningSteps,
    ]),
    culturalReasoning: uniqueCaseLibraryStrings([
      record.summary,
      record.originalScenario,
      record.reviewQuestion,
      record.reviewerNotes,
    ]),
    reviewerDecision: record.reviewerDecision,
    confidence: record.confidence === "needs_review" ? 0.5 : record.confidence === "no_finding" ? 0.1 : 0.9,
    falsePositiveRisk: record.falsePositiveRisk,
    relatedIds: uniqueCaseLibraryStrings([
      ...record.relatedLessons,
      ...record.relatedPatterns,
      ...record.relatedBlueprintConcepts,
      ...record.benchmarkTags,
      ...record.gcamMappings.map((mapping) => String(mapping.article_id)),
    ]),
  });
}

function buildCaseEntries(gcamRecords: readonly GcamKnowledgeRecord[], decisionRecords: readonly DecisionRecord[]): readonly CaseLibraryEntry[] {
  const articles = gcamRecords.filter((record): record is GcamArticleRecord => record.kind === "article");
  const entries: CaseLibraryEntry[] = [];

  for (const article of articles) {
    const relatedGcam = gcamRecords.filter((record) => record.links.articleIds.includes(article.articleId));
    const relatedDecisionRecords = decisionRecords.filter((record) => record.gcamMappings.some((mapping) => mapping.article_id === article.articleId));
    const cases = [
      ...relatedGcam.map((record) => buildGcamCase(record)),
      ...relatedDecisionRecords.map((record) => buildDecisionCase(record)),
    ].sort((left, right) => left.primaryCategory.localeCompare(right.primaryCategory) || left.id.localeCompare(right.id));

    const byCategory = (category: CaseLibraryCaseCategory): readonly CaseLibraryCase[] => Object.freeze(cases.filter((item) => item.categories.includes(category)));

    const positiveExamples = byCategory("positive");
    const negativeExamples = byCategory("negative");
    const borderlineExamples = byCategory("borderline");
    const falsePositives = byCategory("false_positive");
    const falseNegatives = byCategory("false_negative");
    const similarCases = byCategory("similar");
    const counterExamples = byCategory("counter");

    const reviewerExplanation = uniqueCaseLibraryStrings([
      ...positiveExamples.slice(0, 3).map((item) => item.reviewerExplanation),
      ...borderlineExamples.slice(0, 2).map((item) => item.reviewerExplanation),
      ...negativeExamples.slice(0, 2).map((item) => item.reviewerExplanation),
    ]);

    const gcamReasoning = uniqueCaseLibraryStrings(cases.slice(0, 8).flatMap((item) => item.gcamReasoning));
    const culturalReasoning = uniqueCaseLibraryStrings(cases.slice(0, 8).flatMap((item) => item.culturalReasoning));

    entries.push(Object.freeze({
      articleId: article.articleId,
      articleTitle: article.title,
      titleAr: article.titleAr,
      cases: Object.freeze(cases),
      positiveExamples,
      negativeExamples,
      borderlineExamples,
      falsePositives,
      falseNegatives,
      similarCases,
      counterExamples,
      reviewerExplanation: reviewerExplanation.join(" "),
      gcamReasoning,
      culturalReasoning,
    }));
  }

  return Object.freeze(entries.sort((left, right) => left.articleId - right.articleId));
}

function scoreEntry(entry: CaseLibraryEntry, query: CaseLibrarySearchQuery): { score: number; reasons: readonly string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (typeof query.articleId === "number" && entry.articleId === query.articleId) {
    score += 6;
    reasons.push("article");
  }

  if (query.category && entry.cases.some((item) => item.categories.includes(query.category!))) {
    score += 4;
    reasons.push("category");
  }

  const haystack = [
    entry.articleTitle,
    entry.titleAr,
    entry.reviewerExplanation,
    ...entry.gcamReasoning,
    ...entry.culturalReasoning,
    ...entry.cases.flatMap((item) => [
      item.id,
      item.title,
      item.summary,
      item.reviewerDecision,
      item.evidence.join(" "),
      item.concepts.join(" "),
      item.reviewerExplanation,
    ]),
  ].join(" ");

  if (includesCaseLibraryText(haystack, query.concept)) {
    score += 3;
    reasons.push("concept");
  }

  if (includesCaseLibraryText(haystack, query.keyword)) {
    score += 2;
    reasons.push("keyword");
  }

  return {
    score,
    reasons: Object.freeze([...new Set(reasons)].sort((left, right) => left.localeCompare(right))),
  };
}

function computeValidation(entries: readonly CaseLibraryEntry[]): CaseLibraryValidationResult {
  const issues: CaseLibraryValidationIssue[] = [];
  const seen = new Set<number>();

  for (const entry of entries) {
    if (seen.has(entry.articleId)) {
      pushIssue(issues, "error", "article.duplicate", `articles[${entry.articleId}]`, `Duplicate article entry: ${entry.articleId}`);
    }
    seen.add(entry.articleId);
    if (entry.cases.length === 0) {
      pushIssue(issues, "warning", "cases.empty", `articles[${entry.articleId}]`, "Case library entry has no cases.");
    }
  }

  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(issues),
    hash: hashStableCaseLibraryValue(entries.map((entry) => ({
      articleId: entry.articleId,
      caseIds: entry.cases.map((item) => item.id),
      categories: entry.cases.map((item) => item.categories),
    }))),
  });
}

export function createCaseLibraryRegistry(inputs: Partial<{ gcamRecords: readonly GcamKnowledgeRecord[]; decisionRecords: readonly DecisionRecord[] }> = {}): CaseLibraryRegistry {
  const gcamRegistry = createGcamKnowledgeRegistry();
  const gcamRecords = inputs.gcamRecords ?? gcamRegistry.listAll();
  const decisionRecords = inputs.decisionRecords ?? createDecisionRecordRegistry().list();
  const entries = buildCaseEntries(gcamRecords, decisionRecords);
  const validation = computeValidation(entries);

  return Object.freeze({
    entries,
    validation,
    hash: hashStableCaseLibraryValue({
      entries: entries.map((entry) => ({
        articleId: entry.articleId,
        caseCount: entry.cases.length,
        positive: entry.positiveExamples.length,
        negative: entry.negativeExamples.length,
        borderline: entry.borderlineExamples.length,
      })),
      validation,
    }),
    list: () => entries,
    get: (articleId: number) => entries.find((entry) => entry.articleId === articleId) ?? null,
    search: (query: CaseLibrarySearchQuery) =>
      Object.freeze(
        entries
          .map((entry) => {
            const scored = scoreEntry(entry, query);
            return Object.freeze({
              entry,
              score: scored.score,
              reasons: scored.reasons,
            }) as CaseLibrarySearchResult;
          })
          .filter((result) => result.score > 0)
          .sort((left, right) => right.score - left.score || left.entry.articleId - right.entry.articleId),
      ),
  });
}

export function createDefaultCaseLibraryRegistry(): CaseLibraryRegistry {
  return createCaseLibraryRegistry();
}
