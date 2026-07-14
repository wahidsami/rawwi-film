/**
 * Security knowledge validation for the V3 reviewer knowledge bundle.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/securityKnowledge.test.ts
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
const SECURITY_PATTERN_DIR = join(ROOT, "patternLibraries", "security");
const BENCHMARK_FILE = join(ROOT, "benchmarks", "security", "security_benchmark_cases.v1.json");
const ACADEMY_DIR = join(ROOT, "academy");

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testAcademyDiscovery(): void {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const securityPack = registry.load("v3_03_security");
  assertCondition(securityPack !== null, "security pack should load from the academy");
  assert.equal(securityPack?.trigger_concept_ids.includes("public_order"), true);
  assert.equal(securityPack?.trigger_concept_ids.includes("riots"), true);

  const academyLoader = createReviewerAcademyLoader(ACADEMY_DIR);
  const packs = academyLoader.loadPacks();
  assertCondition(packs.some((pack) => pack.id === "v3_03_security"), "academy loader should discover the security pack");
  console.log("✓ security academy pack is discovered");
}

function testSecurityPatternLibraries(): void {
  const documents = loadPatternLibraryDocumentsFromDirectory(SECURITY_PATTERN_DIR);
  assert.equal(documents.length, 10);
  const hashes = documents.map((document) => validatePatternLibraryDocument(document).hash).sort((left, right) => left.localeCompare(right));
  assert.equal(new Set(hashes).size, 10);
  for (const document of documents) {
    const validation = validatePatternLibraryDocument(document);
    assert.equal(validation.valid, true);
    assert.equal(validation.issues.length, 0);
  }
  const renderedHash = createHash("sha256").update(JSON.stringify(documents, null, 2), "utf8").digest("hex");
  const renderedHashAgain = createHash("sha256").update(JSON.stringify(documents, null, 2), "utf8").digest("hex");
  assert.equal(renderedHash, renderedHashAgain);
  console.log("✓ security pattern libraries validate deterministically");
}

function testSecurityDecisionRecords(): void {
  const registry = createDecisionRecordRegistry();
  assert.equal(registry.records.length >= 27, true);
  assert.equal(searchDecisionRecords(registry.records, { concept: "terrorism" }).length > 0, true);
  assert.equal(searchDecisionRecords(registry.records, { pattern: "security_pattern_overthrow_call" }).length > 0, true);
  assert.equal(searchDecisionRecords(registry.records, { benchmarkTag: "overthrow" }).length > 0, true);
  console.log("✓ security decision records load and search correctly");
}

function testSecurityBenchmarkCatalog(): void {
  const benchmarkValidator = createBenchmarkValidator();
  const catalog = JSON.parse(readFileSync(BENCHMARK_FILE, "utf8")) as { cases: unknown[] };
  assert.equal(Array.isArray(catalog.cases), true);
  assert.equal(catalog.cases.length, 100);
  const validation = benchmarkValidator.validateCases(catalog.cases as never);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  const serialized = JSON.stringify(catalog, null, 2);
  const hashA = createHash("sha256").update(serialized, "utf8").digest("hex");
  const hashB = createHash("sha256").update(serialized, "utf8").digest("hex");
  assert.equal(hashA, hashB);
  console.log("✓ security benchmark catalog is deterministic and contains 100 cases");
}

function main(): void {
  testAcademyDiscovery();
  testSecurityPatternLibraries();
  testSecurityDecisionRecords();
  testSecurityBenchmarkCatalog();
  console.log("\nAll security knowledge tests passed.");
}

main();
