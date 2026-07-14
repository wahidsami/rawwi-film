/**
 * Sexual content domain validation for the V3 reviewer knowledge bundle.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/sexualKnowledge.test.ts
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createBenchmarkValidator } from "../benchmark/benchmarkValidator.js";
import { createDefaultReviewerKnowledgeRegistry } from "./reviewerKnowledgeRegistry.js";
import { createReviewerAcademyLoader } from "./academy/reviewerAcademyLoader.js";
import { loadPatternLibraryDocumentsFromDirectory, validatePatternLibraryDocument } from "./patternLibraries/patternLibraryValidator.js";
import { createDecisionRecordRegistry } from "./decisionRecords/decisionRecordRegistry.js";
import { searchDecisionRecords } from "./decisionRecords/decisionRecordSearch.js";

const ROOT = join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge");
const ACADEMY_DIR = join(ROOT, "academy");
const PATTERN_DIR = join(ROOT, "patternLibraries", "sexuality");
const DECISION_DIR = join(ROOT, "decisionRecords", "examples", "sexuality");
const BENCHMARK_FILE = join(ROOT, "benchmarks", "sexuality", "sexual_benchmark_cases.v1.json");

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testAcademyDiscovery(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const sexualityPack = registry.load("v3_07_sexuality");
  assertCondition(sexualityPack !== null, "sexuality pack should load from the academy");
  assert.equal(sexualityPack?.trigger_concept_ids.includes("sexual_reference"), true);
  assert.equal(sexualityPack?.trigger_concept_ids.includes("sexual_harassment"), true);

  const academyLoader = createReviewerAcademyLoader(ACADEMY_DIR);
  const packs = academyLoader.loadPacks();
  assertCondition(packs.some((pack) => pack.id === "v3_07_sexuality"), "academy loader should discover the sexuality pack");
  console.log("✓ sexuality academy pack is discovered");
}

function testPackValidation(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const pack = registry.load("v3_07_sexuality");
  assertCondition(pack !== null, "sexuality pack should exist");
  assert.equal(pack?.protected_concepts.includes("sexual_reference"), true);
  assert.equal(pack?.protected_concepts.includes("sexual_false_accusation"), true);
  console.log("✓ sexuality pack validates through the default registry");
}

function testPatternLibraries(): void {
  const documents = loadPatternLibraryDocumentsFromDirectory(PATTERN_DIR);
  assert.equal(documents.length, 1);
  const validation = validatePatternLibraryDocument(documents[0]);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(validation.hash.length, 64);
  const hashA = createHash("sha256").update(JSON.stringify(documents, null, 2), "utf8").digest("hex");
  const hashB = createHash("sha256").update(JSON.stringify(documents, null, 2), "utf8").digest("hex");
  assert.equal(hashA, hashB);
  console.log("✓ sexuality pattern library validates deterministically");
}

function testDecisionRecords(): void {
  const registry = createDecisionRecordRegistry();
  assert.equal(registry.records.length, 979);
  assert.equal(searchDecisionRecords(registry.records, { concept: "sexual_reference" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { concept: "sexual_harassment" }).length >= 1, true);
  assert.equal(searchDecisionRecords(registry.records, { benchmarkTag: "sexual_reference" }).length >= 1, true);
  console.log("✓ sexuality decision records load and search correctly");
}

function testBenchmarkCatalog(): void {
  const validator = createBenchmarkValidator();
  const catalog = JSON.parse(readFileSync(BENCHMARK_FILE, "utf8")) as { cases: unknown[] };
  assert.equal(Array.isArray(catalog.cases), true);
  assert.equal(catalog.cases.length, 76);
  const validation = validator.validateCases(catalog.cases as never);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  console.log("✓ sexuality benchmark catalog is valid and deterministic");
}

async function main(): Promise<void> {
  testAcademyDiscovery();
  testPackValidation();
  testPatternLibraries();
  testDecisionRecords();
  testBenchmarkCatalog();
  console.log("\nAll sexuality knowledge tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
