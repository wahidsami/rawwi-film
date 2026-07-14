import { hashGcamKnowledgeValue, normalizeGcamKnowledgeKey, normalizeGcamKnowledgeText } from "./gcamKnowledgeUtils.js";
import type { GcamKnowledgeCatalog, GcamKnowledgeRecord, GcamKnowledgeValidationIssue, GcamKnowledgeValidationResult } from "./gcamKnowledgeTypes.js";

function pushIssue(issues: GcamKnowledgeValidationIssue[], severity: GcamKnowledgeValidationIssue["severity"], code: string, path: string, message: string): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function validateRecordReferences(record: GcamKnowledgeRecord, issues: GcamKnowledgeValidationIssue[], articleIds: ReadonlySet<number>, atomIds: ReadonlySet<string>): void {
  for (const [index, articleId] of record.links.articleIds.entries()) {
    if (!articleIds.has(articleId)) {
      pushIssue(issues, "error", "reference.article.missing", `${record.id}.links.articleIds[${index}]`, `Unknown article reference: ${articleId}`);
    }
  }
  for (const [index, atomId] of record.links.atomIds.entries()) {
    if (!atomIds.has(atomId)) {
      pushIssue(issues, "error", "reference.atom.missing", `${record.id}.links.atomIds[${index}]`, `Unknown atom reference: ${atomId}`);
    }
  }
}

function validateRecord(record: GcamKnowledgeRecord, issues: GcamKnowledgeValidationIssue[]): void {
  if (normalizeGcamKnowledgeText(record.id).length === 0) pushIssue(issues, "error", "id.missing", `${record.id}.id`, "id is required");
  if (normalizeGcamKnowledgeText(record.title).length === 0) pushIssue(issues, "error", "title.missing", `${record.id}.title`, "title is required");
  if (normalizeGcamKnowledgeText(record.summary).length === 0) pushIssue(issues, "warning", "summary.missing", `${record.id}.summary`, "summary should be present");
  if (!Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 100) {
    pushIssue(issues, "error", "confidence.range", `${record.id}.confidence`, "confidence must be between 0 and 100");
  }

  const duplicates = new Map<string, number>();
  for (const [field, values] of Object.entries({
    evidence: record.evidence,
    alternativeInterpretations: record.alternativeInterpretations,
    rejectedInterpretations: record.rejectedInterpretations,
    articleIds: record.links.articleIds.map((value) => String(value)),
    atomIds: record.links.atomIds,
    conceptRefs: record.links.conceptRefs,
    methodologyRefs: record.links.methodologyRefs,
    patternRefs: record.links.patternRefs,
    decisionRecordRefs: record.links.decisionRecordRefs,
    benchmarkRefs: record.links.benchmarkRefs,
    knowledgeAcquisitionRecordRefs: record.links.knowledgeAcquisitionRecordRefs,
  })) {
    duplicates.clear();
    for (const [index, value] of values.entries()) {
      const normalized = normalizeGcamKnowledgeKey(value);
      const seen = duplicates.get(normalized);
      if (seen !== undefined) {
        pushIssue(issues, "error", "duplicate.value", `${record.id}.${field}[${index}]`, `Duplicate value "${value}"`);
      } else {
        duplicates.set(normalized, index);
      }
    }
  }
}

export function validateGcamKnowledgeCatalog(catalog: GcamKnowledgeCatalog): GcamKnowledgeValidationResult {
  const issues: GcamKnowledgeValidationIssue[] = [];
  const seenIds = new Set<string>();
  const articleIds = new Set(catalog.articles.map((article) => article.articleId));
  const atomIds = new Set(catalog.atoms.map((atom) => atom.atomId));

  for (const record of [
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
  ]) {
    const normalizedId = normalizeGcamKnowledgeKey(record.id);
    if (seenIds.has(normalizedId)) {
      pushIssue(issues, "error", "duplicate.id", record.id, `Duplicate record id: ${record.id}`);
    }
    seenIds.add(normalizedId);
    validateRecord(record, issues);
    validateRecordReferences(record, issues, articleIds, atomIds);
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

