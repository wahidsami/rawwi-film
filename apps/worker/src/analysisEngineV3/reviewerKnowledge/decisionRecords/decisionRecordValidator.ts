import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadReviewerKnowledgeLessonsFromDirectory } from "../lessons/lessonLoader.js";
import { loadPatternLibraryDocuments } from "../patternLibraries/patternLibraryLoader.js";
import type {
  DecisionRecord,
  DecisionRecordValidationIssue,
  DecisionRecordValidationResult,
} from "./decisionRecordTypes.js";

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

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

export function hashDecisionRecordValue(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

function pushIssue(
  issues: DecisionRecordValidationIssue[],
  severity: DecisionRecordValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function discoverJsonFiles(rootDir: string): readonly string[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);
  const files: string[] = [];
  const entries = readdirSync(rootDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...discoverJsonFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

function loadKnownLessonIds(rootDir: string): Set<string> {
  const lessonsRoot = join(rootDir, "..", "..", "lessons");
  return new Set(loadReviewerKnowledgeLessonsFromDirectory(lessonsRoot).map((lesson) => lesson.id));
}

function loadKnownPatternIds(rootDir: string): Set<string> {
  const patternRoot = join(rootDir, "..", "..", "patternLibraries");
  return new Set(loadPatternLibraryDocuments(patternRoot).flatMap((document) => document.entries.map((entry) => entry.id)));
}

function loadKnownBlueprintConceptIds(rootDir: string): Set<string> {
  const blueprintRoot = join(rootDir, "..", "..", "blueprints");
  const ids = new Set<string>();
  if (!isDirectory(blueprintRoot)) return ids;

  for (const folder of readdirSync(blueprintRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!folder.isDirectory()) continue;
    const folderPath = join(blueprintRoot, folder.name);
    for (const fileName of readdirSync(folderPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!fileName.isFile() || !fileName.name.toLowerCase().endsWith(".json")) continue;
      const fullPath = join(folderPath, fileName.name);
      const parsed = JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
      if (!isPlainObject(parsed) || !Array.isArray(parsed.entries)) continue;
      for (const entry of parsed.entries) {
        if (isPlainObject(entry) && typeof entry.id === "string" && normalizeText(entry.id)) {
          ids.add(normalizeText(entry.id));
        }
      }
    }
  }
  return ids;
}

function validateAllowedConfidence(confidence: string): boolean {
  return new Set(["very_low", "low", "medium", "high", "very_high", "needs_review", "no_finding"]).has(
    normalizeText(confidence).toLowerCase(),
  );
}

export function validateDecisionRecord(
  record: DecisionRecord,
  context: { rootDir: string } = {
    rootDir: join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge", "decisionRecords"),
  },
): DecisionRecordValidationResult {
  const issues: DecisionRecordValidationIssue[] = [];

  if (record.id.length === 0) pushIssue(issues, "error", "required.id", "id", "Decision record id is required.");
  if (record.title.length === 0) pushIssue(issues, "error", "required.title", "title", "Decision record title is required.");
  if (record.summary.length === 0) pushIssue(issues, "error", "required.summary", "summary", "Decision record summary is required.");
  if (record.originalScenario.length === 0) pushIssue(issues, "warning", "required.originalScenario", "originalScenario", "Original scenario is recommended.");
  if (record.reviewQuestion.length === 0) pushIssue(issues, "warning", "required.reviewQuestion", "reviewQuestion", "Review question is recommended.");

  if (!/^\d+\.\d+\.\d+$/.test(record.version)) {
    pushIssue(issues, "error", "version.invalid", "version", "Version must be a normalized semantic version.");
  }

  if (!validateAllowedConfidence(record.confidence)) {
    pushIssue(issues, "error", "confidence.invalid", "confidence", "Invalid confidence value.");
  }

  const duplicateCheck = <T extends string>(values: readonly T[], path: string, code: string, severity: "error" | "warning" = "error"): void => {
    const seen = new Set<string>();
    for (const [index, value] of values.entries()) {
      const normalized = normalizeText(value).toLowerCase();
      if (seen.has(normalized)) {
        pushIssue(issues, severity, code, `${path}[${index}]`, `Duplicate ${path} entry.`);
      }
      seen.add(normalized);
    }
  };

  duplicateCheck(record.possibleConcepts, "possibleConcepts", "possibleConcepts.duplicate");
  duplicateCheck(record.supportingEvidence, "supportingEvidence", "supportingEvidence.duplicate");
  duplicateCheck(record.contradictingEvidence, "contradictingEvidence", "contradictingEvidence.duplicate");
  duplicateCheck(record.requiredMissingEvidence, "requiredMissingEvidence", "requiredMissingEvidence.duplicate");
  duplicateCheck(record.reasoningSteps, "reasoningSteps", "reasoningSteps.duplicate");
  duplicateCheck(record.benchmarkTags, "benchmarkTags", "benchmarkTags.duplicate", "warning");
  duplicateCheck(record.relatedLessons, "relatedLessons", "relatedLessons.duplicate", "warning");
  duplicateCheck(record.relatedPatterns, "relatedPatterns", "relatedPatterns.duplicate", "warning");
  duplicateCheck(record.relatedBlueprintConcepts, "relatedBlueprintConcepts", "relatedBlueprintConcepts.duplicate", "warning");

  const knownLessons = loadKnownLessonIds(context.rootDir);
  const knownPatterns = loadKnownPatternIds(context.rootDir);
  const knownBlueprintConcepts = loadKnownBlueprintConceptIds(context.rootDir);

  for (const [index, lessonId] of record.relatedLessons.entries()) {
    if (!knownLessons.has(lessonId)) {
      pushIssue(issues, "error", "relatedLessons.invalid", `relatedLessons[${index}]`, `Invalid lesson reference: ${lessonId}.`);
    }
  }

  for (const [index, patternId] of record.relatedPatterns.entries()) {
    if (!knownPatterns.has(patternId)) {
      pushIssue(issues, "error", "relatedPatterns.invalid", `relatedPatterns[${index}]`, `Invalid pattern reference: ${patternId}.`);
    }
  }

  for (const [index, conceptId] of record.relatedBlueprintConcepts.entries()) {
    if (knownBlueprintConcepts.size > 0 && !knownBlueprintConcepts.has(conceptId)) {
      pushIssue(issues, "warning", "relatedBlueprintConcepts.unknown", `relatedBlueprintConcepts[${index}]`, `Unknown blueprint concept reference: ${conceptId}.`);
    }
  }

  const mappingKeys = new Set<string>();
  for (const [index, mapping] of record.gcamMappings.entries()) {
    if (!Number.isFinite(mapping.article_id) || mapping.article_id <= 0) {
      pushIssue(issues, "error", "gcamMappings.article_id.invalid", `gcamMappings[${index}].article_id`, "GCAM mapping article_id must be a positive number.");
    }
    if (mapping.atom_ids.length === 0) {
      pushIssue(issues, "warning", "gcamMappings.atom_ids.empty", `gcamMappings[${index}].atom_ids`, "GCAM mapping atom_ids should not be empty.");
    }
    const key = `${mapping.article_id}:${mapping.atom_ids.join("|")}`;
    if (mappingKeys.has(key)) {
      pushIssue(issues, "error", "gcamMappings.duplicate", `gcamMappings[${index}]`, "Duplicate GCAM mapping.");
    }
    mappingKeys.add(key);
  }

  const hash = hashDecisionRecordValue(record);
  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(
      [...issues].sort((left, right) =>
        left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message),
      ),
    ),
    hash,
  });
}

export function validateDecisionRecords(
  records: readonly DecisionRecord[],
  context: { rootDir: string } = {
    rootDir: join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge", "decisionRecords"),
  },
): DecisionRecordValidationResult {
  const issues: DecisionRecordValidationIssue[] = [];
  const recordHashes: string[] = [];
  const seenIds = new Map<string, number>();

  for (const [index, record] of records.entries()) {
    const result = validateDecisionRecord(record, context);
    recordHashes.push(result.hash);
    issues.push(...result.issues.map((issue) => Object.freeze({ ...issue, path: `records[${index}].${issue.path}` })));

    const seenCount = seenIds.get(record.id) ?? 0;
    if (seenCount > 0) {
      pushIssue(issues, "error", "id.duplicate", `records[${index}].id`, `Duplicate decision record id: ${record.id}.`);
    }
    seenIds.set(record.id, seenCount + 1);
  }

  const hash = hashDecisionRecordValue({
    recordHashes: [...recordHashes].sort((left, right) => left.localeCompare(right)),
    issues: issues
      .map((issue) => `${issue.severity}:${issue.code}:${issue.path}:${issue.message}`)
      .sort((left, right) => left.localeCompare(right)),
  });

  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(
      [...issues].sort((left, right) =>
        left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message),
      ),
    ),
    hash,
  });
}
