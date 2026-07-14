import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadDecisionRecordsFromDirectory } from "../../decisionRecords/decisionRecordLoader.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "../../lessons/lessonLoader.js";
import { loadPatternLibraryDocuments } from "../../patternLibraries/patternLibraryLoader.js";
import { parseReviewerKnowledgeDocumentText } from "../../reviewerKnowledgeIO.js";
import type { BenchmarkCase } from "../../../benchmark/benchmarkTypes.js";
import { normalizeKnowledgeAcquisitionText } from "./knowledgeAcquisitionVersioning.js";
import {
  deriveKnowledgeAcquisitionId,
  hashKnowledgeAcquisitionValue,
  parseKnowledgeAcquisitionRecord,
} from "./knowledgeAcquisitionSchema.js";
import type {
  KnowledgeAcquisitionRecord,
  KnowledgeAcquisitionValidationIssue,
  KnowledgeAcquisitionValidationResult,
} from "./knowledgeAcquisitionTypes.js";

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(
  issues: KnowledgeAcquisitionValidationIssue[],
  severity: KnowledgeAcquisitionValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function normalizeList(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeKnowledgeAcquisitionText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && normalizeKnowledgeAcquisitionText(value).length > 0;
}

function validateRequiredList(
  issues: KnowledgeAcquisitionValidationIssue[],
  path: string,
  values: readonly string[],
  codePrefix: string,
): void {
  if (!Array.isArray(values) || values.length === 0) {
    pushIssue(issues, "error", `${codePrefix}.missing`, path, "must contain at least one item");
    return;
  }
  values.forEach((value, index) => {
    if (!hasNonEmptyString(value)) {
      pushIssue(issues, "error", `${codePrefix}.item`, `${path}[${index}]`, "must be a non-empty string");
    }
  });
}

function validateNoDuplicates(issues: KnowledgeAcquisitionValidationIssue[], path: string, values: readonly string[], codePrefix: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const normalized = normalizeKnowledgeAcquisitionText(value).toLowerCase();
    if (seen.has(normalized)) {
      pushIssue(issues, "error", `${codePrefix}.duplicate`, `${path}[${index}]`, `Duplicate entry "${value}".`);
    }
    seen.add(normalized);
  });
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function discoverJsonLikeFiles(rootDir: string): readonly string[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);
  const files: string[] = [];
  const stack: string[] = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !isDirectory(current)) continue;
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && /\.(?:json|ya?ml)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return Object.freeze(files.sort(compareStrings));
}

function collectBenchmarkIds(benchmarkRoot: string): readonly string[] {
  if (!isDirectory(benchmarkRoot)) return Object.freeze([]);
  const ids: string[] = [];
  for (const filePath of discoverJsonLikeFiles(benchmarkRoot)) {
    const parsed = parseReviewerKnowledgeDocumentText(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const cases = Array.isArray(parsed.cases) ? parsed.cases : [];
    for (const candidate of cases) {
      if (isPlainObject(candidate) && hasNonEmptyString(candidate.id)) {
        ids.push(normalizeKnowledgeAcquisitionText(candidate.id));
      }
    }
  }
  return Object.freeze([...new Set(ids)].sort(compareStrings));
}

function collectKnownReferences(rootDir: string): Readonly<{
  lessons: readonly string[];
  patterns: readonly string[];
  decisionRecords: readonly string[];
  benchmarks: readonly string[];
}> {
  const lessonsRoot = join(rootDir, "..", "lessons");
  const patternsRoot = join(rootDir, "..", "patternLibraries");
  const decisionRecordsRoot = join(rootDir, "..", "decisionRecords", "examples");
  const benchmarkRoot = join(rootDir, "..", "benchmarks");
  return Object.freeze({
    lessons: Object.freeze(loadReviewerKnowledgeLessonsFromDirectory(lessonsRoot).map((lesson) => lesson.id).sort(compareStrings)),
    patterns: Object.freeze(loadPatternLibraryDocuments(patternsRoot).flatMap((document) => document.entries.map((entry) => entry.id)).sort(compareStrings)),
    decisionRecords: Object.freeze(loadDecisionRecordsFromDirectory(decisionRecordsRoot).map((record) => record.id).sort(compareStrings)),
    benchmarks: collectBenchmarkIds(benchmarkRoot),
  });
}

function validateRecordConfidence(record: KnowledgeAcquisitionRecord, issues: KnowledgeAcquisitionValidationIssue[]): void {
  if (!Number.isFinite(record.reviewerConfidence) || record.reviewerConfidence < 0 || record.reviewerConfidence > 1) {
    pushIssue(issues, "error", "reviewerConfidence.range", "reviewerConfidence", "Reviewer confidence must be between 0 and 1.");
  }
}

function validateDate(record: KnowledgeAcquisitionRecord, issues: KnowledgeAcquisitionValidationIssue[]): void {
  if (!hasNonEmptyString(record.date) || Number.isNaN(Date.parse(record.date))) {
    pushIssue(issues, "error", "date.invalid", "date", "Date must be a valid ISO-like date string.");
  }
}

function validateReferenceLists(
  record: KnowledgeAcquisitionRecord,
  issues: KnowledgeAcquisitionValidationIssue[],
  knownReferences: Readonly<{
    lessons: readonly string[];
    patterns: readonly string[];
    decisionRecords: readonly string[];
    benchmarks: readonly string[];
  }>,
): void {
  for (const [index, lessonId] of record.relatedLessons.entries()) {
    if (!knownReferences.lessons.includes(lessonId)) {
      pushIssue(issues, "error", "relatedLessons.invalid", `relatedLessons[${index}]`, `Unknown lesson reference: ${lessonId}.`);
    }
  }

  for (const [index, patternId] of record.relatedPatterns.entries()) {
    if (!knownReferences.patterns.includes(patternId)) {
      pushIssue(issues, "error", "relatedPatterns.invalid", `relatedPatterns[${index}]`, `Unknown pattern reference: ${patternId}.`);
    }
  }

  for (const [index, recordId] of record.relatedDecisionRecords.entries()) {
    if (!knownReferences.decisionRecords.includes(recordId)) {
      pushIssue(issues, "error", "relatedDecisionRecords.invalid", `relatedDecisionRecords[${index}]`, `Unknown decision record reference: ${recordId}.`);
    }
  }

  for (const [index, benchmarkId] of record.relatedBenchmarks.entries()) {
    if (!knownReferences.benchmarks.includes(benchmarkId)) {
      pushIssue(issues, "error", "relatedBenchmarks.invalid", `relatedBenchmarks[${index}]`, `Unknown benchmark reference: ${benchmarkId}.`);
    }
  }
}

function validateRecordIdentity(record: KnowledgeAcquisitionRecord, issues: KnowledgeAcquisitionValidationIssue[]): void {
  const expectedId = deriveKnowledgeAcquisitionId(record);
  if (normalizeKnowledgeAcquisitionText(record.id) !== expectedId) {
    pushIssue(issues, "error", "id.mismatch", "id", `Record id must be deterministic. Expected ${expectedId}.`);
  }
}

function validateEvolutionLinks(record: KnowledgeAcquisitionRecord, issues: KnowledgeAcquisitionValidationIssue[]): void {
  if (record.supersedesId && record.supersededById && normalizeKnowledgeAcquisitionText(record.supersedesId) === normalizeKnowledgeAcquisitionText(record.supersededById)) {
    pushIssue(issues, "error", "evolution.self_reference", "supersedesId", "A record cannot supersede itself.");
  }
}

export function validateKnowledgeAcquisitionRecord(
  record: KnowledgeAcquisitionRecord,
  context: { rootDir?: string; knownRecordIds?: readonly string[] } = {},
): KnowledgeAcquisitionValidationResult {
  const issues: KnowledgeAcquisitionValidationIssue[] = [];
  const knownReferences = collectKnownReferences(context.rootDir ?? join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge", "knowledgeAcquisition"));
  const knownRecordIds = new Set((context.knownRecordIds ?? []).map((value) => normalizeKnowledgeAcquisitionText(value)));

  if (!hasNonEmptyString(record.id)) pushIssue(issues, "error", "id.missing", "id", "Record id is required.");
  if (!/^\d+\.\d+\.\d+$/.test(normalizeKnowledgeAcquisitionText(record.version))) pushIssue(issues, "error", "version.invalid", "version", "Version must be a semantic version.");
  if (!hasNonEmptyString(record.source)) pushIssue(issues, "error", "source.missing", "source", "Source is required.");
  if (!hasNonEmptyString(record.knowledgeType)) pushIssue(issues, "error", "knowledgeType.missing", "knowledgeType", "Knowledge type is required.");
  if (!hasNonEmptyString(record.domain)) pushIssue(issues, "error", "domain.missing", "domain", "Domain is required.");
  if (!hasNonEmptyString(record.storyContext)) pushIssue(issues, "error", "storyContext.missing", "storyContext", "Story context is required.");
  if (!hasNonEmptyString(record.decision)) pushIssue(issues, "error", "decision.missing", "decision", "Decision is required.");
  if (!hasNonEmptyString(record.knowledgeDebtReference)) pushIssue(issues, "warning", "knowledgeDebtReference.missing", "knowledgeDebtReference", "Knowledge debt reference is recommended.");

  validateRecordIdentity(record, issues);
  validateRecordConfidence(record, issues);
  validateDate(record, issues);
  validateEvolutionLinks(record, issues);

  validateRequiredList(issues, "concepts", record.concepts, "concepts");
  validateRequiredList(issues, "evidence", record.evidence, "evidence");
  validateRequiredList(issues, "reasoning", record.reasoning, "reasoning");
  validateNoDuplicates(issues, "concepts", record.concepts, "concepts");
  validateNoDuplicates(issues, "evidence", record.evidence, "evidence");
  validateNoDuplicates(issues, "reasoning", record.reasoning, "reasoning");
  validateNoDuplicates(issues, "alternativeDecisions", record.alternativeDecisions, "alternativeDecisions");
  validateNoDuplicates(issues, "rejectedInterpretations", record.rejectedInterpretations, "rejectedInterpretations");
  validateNoDuplicates(issues, "relatedLessons", record.relatedLessons, "relatedLessons");
  validateNoDuplicates(issues, "relatedPatterns", record.relatedPatterns, "relatedPatterns");
  validateNoDuplicates(issues, "relatedDecisionRecords", record.relatedDecisionRecords, "relatedDecisionRecords");
  validateNoDuplicates(issues, "relatedBenchmarks", record.relatedBenchmarks, "relatedBenchmarks");
  validateNoDuplicates(issues, "relatedRecordIds", record.relatedRecordIds, "relatedRecordIds");

  if (record.reviewerId && !hasNonEmptyString(record.reviewerId)) {
    pushIssue(issues, "error", "reviewerId.invalid", "reviewerId", "Reviewer id must be a non-empty string when provided.");
  }
  if (record.reviewerName && !hasNonEmptyString(record.reviewerName)) {
    pushIssue(issues, "error", "reviewerName.invalid", "reviewerName", "Reviewer name must be a non-empty string when provided.");
  }
  if (record.disagreementGroupId && !hasNonEmptyString(record.disagreementGroupId)) {
    pushIssue(issues, "error", "disagreementGroupId.invalid", "disagreementGroupId", "Disagreement group id must be a non-empty string when provided.");
  }
  if (record.supersedesId && !hasNonEmptyString(record.supersedesId)) {
    pushIssue(issues, "error", "supersedesId.invalid", "supersedesId", "Supersedes id must be a non-empty string when provided.");
  }
  if (record.supersededById && !hasNonEmptyString(record.supersededById)) {
    pushIssue(issues, "error", "supersededById.invalid", "supersededById", "Superseded by id must be a non-empty string when provided.");
  }

  validateReferenceLists(record, issues, knownReferences);

  for (const [index, relatedId] of record.relatedRecordIds.entries()) {
    if (knownRecordIds.size > 0 && !knownRecordIds.has(normalizeKnowledgeAcquisitionText(relatedId))) {
      pushIssue(issues, "error", "relatedRecordIds.invalid", `relatedRecordIds[${index}]`, `Unknown related record reference: ${relatedId}.`);
    }
  }

  const hash = hashKnowledgeAcquisitionValue(record);
  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(
      [...issues].sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message)),
    ),
    hash,
    recordHashes: Object.freeze([hash]),
  });
}

export function validateKnowledgeAcquisitionRecords(
  records: readonly KnowledgeAcquisitionRecord[],
  context: { rootDir?: string } = {},
): KnowledgeAcquisitionValidationResult {
  const issues: KnowledgeAcquisitionValidationIssue[] = [];
  const recordHashes: string[] = [];
  const seenIds = new Map<string, number>();
  const normalizedIds = records.map((record) => normalizeKnowledgeAcquisitionText(record.id));

  for (const [index, record] of records.entries()) {
    const recordResult = validateKnowledgeAcquisitionRecord(record, { rootDir: context.rootDir, knownRecordIds: normalizedIds });
    recordHashes.push(recordResult.hash);
    issues.push(...recordResult.issues.map((issue) => Object.freeze({ ...issue, path: `records[${index}].${issue.path}` })));

    const normalizedId = normalizeKnowledgeAcquisitionText(record.id);
    const seen = seenIds.get(normalizedId) ?? 0;
    if (seen > 0) {
      pushIssue(issues, "error", "id.duplicate", `records[${index}].id`, `Duplicate record id: ${record.id}.`);
    }
    seenIds.set(normalizedId, seen + 1);
  }

  const adjacency = new Map<string, Set<string>>();
  for (const record of records) {
    if (!record.supersedesId) continue;
    const source = normalizeKnowledgeAcquisitionText(record.id);
    const target = normalizeKnowledgeAcquisitionText(record.supersedesId);
    const bucket = adjacency.get(source) ?? new Set<string>();
    bucket.add(target);
    adjacency.set(source, bucket);
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const cycles: string[][] = [];

  function visit(node: string, trail: string[]): void {
    if (active.has(node)) {
      const start = trail.indexOf(node);
      cycles.push(start >= 0 ? trail.slice(start).concat(node) : [...trail, node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.add(node);
    for (const next of adjacency.get(node) ?? []) {
      visit(next, [...trail, node]);
    }
    active.delete(node);
  }

  for (const id of adjacency.keys()) {
    visit(id, []);
  }

  for (const cycle of cycles) {
    pushIssue(issues, "error", "evolution.cycle", "records", `Circular knowledge evolution detected: ${cycle.join(" -> ")}.`);
  }

  const hash = createHash("sha256")
    .update(
      hashKnowledgeAcquisitionValue({
        recordHashes: [...recordHashes].sort((left, right) => left.localeCompare(right)),
        issues: issues
          .map((issue) => `${issue.severity}:${issue.code}:${issue.path}:${issue.message}`)
          .sort((left, right) => left.localeCompare(right)),
      }),
      "utf8",
    )
    .digest("hex");

  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(
      [...issues].sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message)),
    ),
    hash,
    recordHashes: Object.freeze(recordHashes),
  });
}
