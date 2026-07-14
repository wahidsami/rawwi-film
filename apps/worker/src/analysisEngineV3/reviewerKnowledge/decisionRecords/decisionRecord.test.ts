/**
 * Tests for reviewer decision records.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/decisionRecords/decisionRecord.test.ts
 */
import { strict as assert } from "node:assert";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadReviewerKnowledgeLessonsFromDirectory } from "../lessons/lessonLoader.js";
import { loadPatternLibraryDocuments } from "../patternLibraries/patternLibraryLoader.js";
import { createDecisionRecordRegistry } from "./decisionRecordRegistry.js";
import { renderDecisionRecord } from "./decisionRecordRenderer.js";
import { parseDecisionRecord } from "./decisionRecordSchema.js";
import { searchDecisionRecords } from "./decisionRecordSearch.js";
import { hashDecisionRecordValue, validateDecisionRecord } from "./decisionRecordValidator.js";

function decisionRecordsRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function examplesDir(): string {
  return join(decisionRecordsRoot(), "examples");
}

function tempRoot(): string {
  const base = join(process.cwd(), ".tmp", "decision-records");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, "run-"));
}

function cloneExamples(): string {
  const root = tempRoot();
  cpSync(examplesDir(), root, { recursive: true });
  return root;
}

function loadRecord(fileName: string) {
  return parseDecisionRecord(JSON.parse(readFileSync(join(examplesDir(), fileName), "utf8")));
}

function testValidation(): void {
  const registry = createDecisionRecordRegistry(examplesDir());
  assert.equal(registry.validation.valid, true);
  assert.equal(registry.records.length, 979);
  assert.equal(registry.hash.length, 64);
  console.log("✓ decision record registry loads example records");
}

function testDeterministicSerialization(): void {
  const record = loadRecord("decision_001_bribery_phrase.v1.json");
  const rendered = renderDecisionRecord(record);
  assert.equal(rendered, renderDecisionRecord(record));
  assert.equal(hashDecisionRecordValue(record).length, 64);
  console.log("✓ decision record rendering and hashing are deterministic");
}

function testSearch(): void {
  const registry = createDecisionRecordRegistry(examplesDir());
  assert.equal(searchDecisionRecords(registry.records, { concept: "bribery" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { lesson: "lesson_014_cross_sentence_reasoning" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { pattern: "pattern_bribery_exchange" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { article: 4 }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { benchmarkTag: "no_finding" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { confidence: "low" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { target: "official" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { intent: "observational" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { concept: "sexual_reference" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { benchmarkTag: "sexual_reference" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { concept: "travel_reference" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { benchmarkTag: "travel" }).length >= 1, true);
  console.log("✓ decision record search is deterministic");
}

function testDuplicateIds(): void {
  const root = cloneExamples();
  try {
    const filePath = join(root, "decision_002_travel_observation.v1.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    document.id = "decision_001_bribery_phrase";
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const registry = createDecisionRecordRegistry(root);
    assert.equal(registry.validation.valid, false);
    assert.equal(registry.validation.issues.some((issue) => issue.code === "id.duplicate"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log("✓ duplicate ids are rejected");
}

function testDuplicateReasoningSteps(): void {
  const root = cloneExamples();
  try {
    const filePath = join(root, "decision_001_bribery_phrase.v1.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    document.reasoningSteps = [
      ...(Array.isArray(document.reasoningSteps) ? document.reasoningSteps : []),
      "Keep confidence below a finding threshold until corroboration appears.",
    ];
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const record = parseDecisionRecord(JSON.parse(readFileSync(filePath, "utf8")));
    const result = validateDecisionRecord(record, { rootDir: root });
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.code === "reasoningSteps.duplicate"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log("✓ duplicate reasoning steps are rejected");
}

function testMissingReferences(): void {
  const root = cloneExamples();
  try {
    const filePath = join(root, "decision_001_bribery_phrase.v1.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    document.relatedLessons = ["lesson_missing"];
    document.relatedPatterns = ["pattern_missing"];
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const record = parseDecisionRecord(JSON.parse(readFileSync(filePath, "utf8")));
    const result = validateDecisionRecord(record, { rootDir: root });
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.code === "relatedLessons.invalid"), true);
    assert.equal(result.issues.some((issue) => issue.code === "relatedPatterns.invalid"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log("✓ missing references are rejected");
}

function testStableSearchAndRegistryMutation(): void {
  const registry = createDecisionRecordRegistry(examplesDir());
  registry.register(loadRecord("decision_001_bribery_phrase.v1.json"));
  assert.equal(registry.list().length >= 2, true);
  registry.unregister("decision_001_bribery_phrase");
  assert.equal(registry.get("decision_001_bribery_phrase"), null);
  console.log("✓ registry mutation is deterministic");
}

function testLessonAndPatternAwareness(): void {
  const lessons = loadReviewerKnowledgeLessonsFromDirectory(join(decisionRecordsRoot(), "..", "lessons"));
  const patterns = loadPatternLibraryDocuments(join(decisionRecordsRoot(), "..", "patternLibraries"));
  assert.equal(lessons.length > 0, true);
  assert.equal(patterns.length > 0, true);
  console.log("✓ registry can reference existing lessons and patterns");
}

async function main(): Promise<void> {
  testValidation();
  testDeterministicSerialization();
  testSearch();
  testDuplicateIds();
  testDuplicateReasoningSteps();
  testMissingReferences();
  testStableSearchAndRegistryMutation();
  testLessonAndPatternAwareness();
  console.log("\nAll decision record tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
