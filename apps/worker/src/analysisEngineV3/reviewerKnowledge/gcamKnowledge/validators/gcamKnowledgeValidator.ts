import { hashGcamKnowledgeValue, normalizeGcamKnowledgeKey, normalizeGcamKnowledgeText, deriveGcamKnowledgeRecordId } from "../schemas/gcamKnowledgeSchema.js";
import type {
  GcamKnowledgeCatalog,
  GcamKnowledgeRecord,
  GcamKnowledgeReferenceContext,
  GcamKnowledgeValidationIssue,
  GcamKnowledgeValidationResult,
} from "../schemas/gcamKnowledgeTypes.js";
import { validateGcamKnowledgeReferences } from "./gcamKnowledgeReferenceValidator.js";

function pushIssue(
  issues: GcamKnowledgeValidationIssue[],
  severity: GcamKnowledgeValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function validateStringList(issues: GcamKnowledgeValidationIssue[], path: string, values: readonly string[], allowEmpty = false): void {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    pushIssue(issues, "error", `${path}.missing`, path, allowEmpty ? "must be an array" : "must contain at least one item");
    return;
  }
  values.forEach((value, index) => {
    if (typeof value !== "string" || normalizeGcamKnowledgeText(value).length === 0) {
      pushIssue(issues, "error", `${path}.item`, `${path}[${index}]`, "must be a non-empty string");
    }
  });
}

function validateRecordCore(record: GcamKnowledgeRecord, issues: GcamKnowledgeValidationIssue[]): void {
  if (normalizeGcamKnowledgeText(record.id).length === 0) pushIssue(issues, "error", "id.missing", "id", "id is required");
  if (!/^\d+\.\d+\.\d+$/.test(normalizeGcamKnowledgeText(record.version))) pushIssue(issues, "error", "version.invalid", "version", "version must be semantic version");
  if (normalizeGcamKnowledgeText(record.title).length === 0) pushIssue(issues, "error", "title.missing", "title", "title is required");
  if (normalizeGcamKnowledgeText(record.description).length === 0) pushIssue(issues, "warning", "description.missing", "description", "description should be present");
  if (!Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 100) pushIssue(issues, "error", "confidence.range", "confidence", "confidence must be between 0 and 100");
  if (normalizeGcamKnowledgeText(record.source.documentId).length === 0) pushIssue(issues, "error", "source.document.missing", "source.documentId", "source document is required");
}

function validateDuplicates(issues: GcamKnowledgeValidationIssue[], path: string, values: readonly string[], code: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const normalized = normalizeGcamKnowledgeKey(value);
    if (seen.has(normalized)) {
      pushIssue(issues, "error", `${code}.duplicate`, `${path}[${index}]`, `duplicate entry: ${value}`);
    }
    seen.add(normalized);
  });
}

function validateRecord(record: GcamKnowledgeRecord, context: GcamKnowledgeReferenceContext, issues: GcamKnowledgeValidationIssue[]): void {
  validateRecordCore(record, issues);

  const expectedId = deriveGcamKnowledgeRecordId(record);
  if (normalizeGcamKnowledgeKey(record.id) !== normalizeGcamKnowledgeKey(expectedId)) {
    pushIssue(issues, "warning", "id.deterministic_mismatch", "id", `deterministic id suggestion: ${expectedId}`);
  }

  validateStringList(issues, "concepts", record.concepts, true);
  validateStringList(issues, "domains", record.domains, true);
  validateStringList(issues, "relatedLessons", record.relatedLessons, true);
  validateStringList(issues, "relatedPatternLibraries", record.relatedPatternLibraries, true);
  validateStringList(issues, "relatedDecisionRecords", record.relatedDecisionRecords, true);
  validateStringList(issues, "relatedBenchmarks", record.relatedBenchmarks, true);
  validateStringList(issues, "relatedMethodologies", record.relatedMethodologies, true);
  validateStringList(issues, "relatedKnowledgeAcquisitionRecords", record.relatedKnowledgeAcquisitionRecords, true);
  validateStringList(issues, "evidence", record.evidence, true);
  validateStringList(issues, "reasoning", record.reasoning, true);
  validateStringList(issues, "alternativeInterpretations", record.alternativeInterpretations, true);
  validateStringList(issues, "rejectedInterpretations", record.rejectedInterpretations, true);
  validateStringList(issues, "knowledgeDebtLinks", record.knowledgeDebtLinks, true);
  validateStringList(issues, "futureReviewNotes", record.futureReviewNotes, true);
  validateDuplicates(issues, "concepts", record.concepts, "concepts");
  validateDuplicates(issues, "domains", record.domains, "domains");
  validateDuplicates(issues, "relatedLessons", record.relatedLessons, "relatedLessons");
  validateDuplicates(issues, "relatedPatternLibraries", record.relatedPatternLibraries, "relatedPatternLibraries");
  validateDuplicates(issues, "relatedDecisionRecords", record.relatedDecisionRecords, "relatedDecisionRecords");
  validateDuplicates(issues, "relatedBenchmarks", record.relatedBenchmarks, "relatedBenchmarks");
  validateDuplicates(issues, "relatedMethodologies", record.relatedMethodologies, "relatedMethodologies");
  validateDuplicates(issues, "relatedKnowledgeAcquisitionRecords", record.relatedKnowledgeAcquisitionRecords, "relatedKnowledgeAcquisitionRecords");
  validateDuplicates(issues, "evidence", record.evidence, "evidence");
  validateDuplicates(issues, "reasoning", record.reasoning, "reasoning");
  validateDuplicates(issues, "alternativeInterpretations", record.alternativeInterpretations, "alternativeInterpretations");
  validateDuplicates(issues, "rejectedInterpretations", record.rejectedInterpretations, "rejectedInterpretations");
  validateDuplicates(issues, "knowledgeDebtLinks", record.knowledgeDebtLinks, "knowledgeDebtLinks");
  validateDuplicates(issues, "futureReviewNotes", record.futureReviewNotes, "futureReviewNotes");
  for (const issue of validateGcamKnowledgeReferences(record, context)) {
    issues.push(issue);
  }
}

function collectAllRecords(catalog: GcamKnowledgeCatalog): readonly GcamKnowledgeRecord[] {
  return [
    ...catalog.articles,
    ...catalog.atoms,
    ...catalog.reviewerExamples,
    ...catalog.reviewerComments,
    ...catalog.reviewerObservations,
    ...catalog.reviewerInterpretations,
    ...catalog.reviewerExceptions,
    ...catalog.reviewerCorrections,
    ...catalog.reviewerDisagreements,
    ...catalog.reviewerNotes,
    ...catalog.knowledgeDebt,
  ];
}

export function validateGcamKnowledgeCatalog(
  catalog: GcamKnowledgeCatalog,
  context: GcamKnowledgeReferenceContext = {
    lessonIds: [],
    patternLibraryIds: [],
    decisionRecordIds: [],
    benchmarkIds: [],
    methodologyIds: [],
    knowledgeAcquisitionRecordIds: [],
  },
): GcamKnowledgeValidationResult {
  const issues: GcamKnowledgeValidationIssue[] = [];
  const seenIds = new Set<string>();
  const articleIds = new Set<number>();
  const atomIds = new Set<string>();

  for (const article of catalog.articles) {
    if (articleIds.has(article.articleId)) {
      pushIssue(issues, "error", "duplicate.articleId", article.id, `duplicate article id: ${article.articleId}`);
    }
    articleIds.add(article.articleId);
  }

  for (const atom of catalog.atoms) {
    if (atomIds.has(atom.atomId)) {
      pushIssue(issues, "error", "duplicate.atomId", atom.id, `duplicate atom id: ${atom.atomId}`);
    }
    atomIds.add(atom.atomId);
  }

  for (const record of collectAllRecords(catalog)) {
    const normalizedId = normalizeGcamKnowledgeKey(record.id);
    if (seenIds.has(normalizedId)) {
      pushIssue(issues, "error", "duplicate.id", record.id, `duplicate record id: ${record.id}`);
    }
    seenIds.add(normalizedId);
    validateRecord(record, context, issues);
  }

  const hash = hashGcamKnowledgeValue({
    articles: catalog.articles,
    atoms: catalog.atoms,
    reviewerExamples: catalog.reviewerExamples,
    reviewerComments: catalog.reviewerComments,
    reviewerObservations: catalog.reviewerObservations,
    reviewerInterpretations: catalog.reviewerInterpretations,
    reviewerExceptions: catalog.reviewerExceptions,
    reviewerCorrections: catalog.reviewerCorrections,
    reviewerDisagreements: catalog.reviewerDisagreements,
    reviewerNotes: catalog.reviewerNotes,
    knowledgeDebt: catalog.knowledgeDebt,
  });

  return Object.freeze({
    valid: issues.filter((issue) => issue.severity === "error").length === 0,
    issues: Object.freeze(issues),
    hash,
  });
}
