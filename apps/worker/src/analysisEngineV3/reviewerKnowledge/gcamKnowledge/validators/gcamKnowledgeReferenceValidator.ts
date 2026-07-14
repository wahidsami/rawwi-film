import type { GcamKnowledgeRecord, GcamKnowledgeReferenceContext, GcamKnowledgeValidationIssue } from "../schemas/gcamKnowledgeTypes.js";
import { normalizeGcamKnowledgeKey } from "../schemas/gcamKnowledgeSchema.js";

function pushIssue(
  issues: GcamKnowledgeValidationIssue[],
  severity: GcamKnowledgeValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function validateReferenceList(
  issues: GcamKnowledgeValidationIssue[],
  path: string,
  values: readonly string[],
  knownValues: readonly string[],
  code: string,
): void {
  const known = new Set(knownValues.map((value) => normalizeGcamKnowledgeKey(value)));
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const normalized = normalizeGcamKnowledgeKey(value);
    if (seen.has(normalized)) {
      pushIssue(issues, "error", `${code}.duplicate`, `${path}[${index}]`, `Duplicate reference: ${value}`);
    }
    seen.add(normalized);
    if (known.size > 0 && !known.has(normalized)) {
      pushIssue(issues, "error", `${code}.missing`, `${path}[${index}]`, `Unknown reference: ${value}`);
    }
  });
}

export function validateGcamKnowledgeReferences(
  record: GcamKnowledgeRecord,
  context: GcamKnowledgeReferenceContext,
): readonly GcamKnowledgeValidationIssue[] {
  const issues: GcamKnowledgeValidationIssue[] = [];
  validateReferenceList(issues, "relatedLessons", record.relatedLessons, context.lessonIds, "reference.lesson");
  validateReferenceList(issues, "relatedPatternLibraries", record.relatedPatternLibraries, context.patternLibraryIds, "reference.patternLibrary");
  validateReferenceList(issues, "relatedDecisionRecords", record.relatedDecisionRecords, context.decisionRecordIds, "reference.decisionRecord");
  validateReferenceList(issues, "relatedBenchmarks", record.relatedBenchmarks, context.benchmarkIds, "reference.benchmark");
  validateReferenceList(issues, "relatedMethodologies", record.relatedMethodologies, context.methodologyIds, "reference.methodology");
  validateReferenceList(issues, "relatedKnowledgeAcquisitionRecords", record.relatedKnowledgeAcquisitionRecords, context.knowledgeAcquisitionRecordIds, "reference.knowledgeAcquisition");
  return Object.freeze(issues);
}

