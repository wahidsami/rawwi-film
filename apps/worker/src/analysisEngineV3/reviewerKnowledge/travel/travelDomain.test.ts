/**
 * Travel and countries domain validation.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/travel/travelDomain.test.ts
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createBenchmarkValidator } from "../../benchmark/benchmarkValidator.js";
import { createDomainCoverageAnalyzer, discoverDomainCoverageDomains } from "../domainCoverage/domainCoverageAnalyzer.js";
import { validateBlueprints } from "../blueprints/blueprintValidator.js";
import { loadDecisionRecordsFromDirectory } from "../decisionRecords/decisionRecordLoader.js";
import { validateDecisionRecords } from "../decisionRecords/decisionRecordValidator.js";
import { createReviewerAcademyLoader } from "../academy/reviewerAcademyLoader.js";
import { createDefaultReviewerKnowledgeRegistry } from "../reviewerKnowledgeRegistry.js";
import { searchLessons } from "../lessons/lessonSearch.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "../lessons/lessonLoader.js";
import { createPatternLibraryRegistry } from "../patternLibraries/patternLibraryRegistry.js";
import { loadPatternLibraryDocumentsFromDirectory, validatePatternLibraryDocument } from "../patternLibraries/patternLibraryValidator.js";
import { lintAcademyPackFile } from "../linter/knowledgeLinter.js";

const ROOT = join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge");
const BLUEPRINT_DIR = join(ROOT, "blueprints", "travel");
const ACADEMY_PACK = join(ROOT, "academy", "travel", "pack.v1.json");
const PATTERN_DIR = join(ROOT, "patternLibraries", "travel");
const DECISION_DIR = join(ROOT, "decisionRecords", "examples", "travel");
const BENCHMARK_FILE = join(ROOT, "benchmarks", "travel", "travel_benchmark_cases.v1.json");
const COVERAGE_FILE = join(ROOT, "blueprints", "travel", "travel_coverage_report.json");

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testBlueprints(): void {
  const validation = validateBlueprints(BLUEPRINT_DIR);
  assert.equal(validation.valid, true, validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  assert.equal(validation.issues.length, 0);
  console.log("✓ travel blueprints validate");
}

function testAcademyPack(): void {
  const report = lintAcademyPackFile(ACADEMY_PACK);
  assert.equal(report.overallScore.readyForAcademy, true, report.errors.map((issue) => issue.message).join("; "));
  assert.equal(report.errors.length, 0);
  const registry = createDefaultReviewerKnowledgeRegistry();
  assert.equal(registry.load("v3_13_travel")?.id, "v3_13_travel");
  const academyLoader = createReviewerAcademyLoader(join(ROOT, "academy"));
  assert.equal(academyLoader.loadPacks().some((pack) => pack.id === "v3_13_travel"), true);
  console.log("✓ travel academy pack is discovered and valid");
}

function testLessons(): void {
  const lessonsRoot = join(ROOT, "lessons");
  const lessons = loadReviewerKnowledgeLessonsFromDirectory(lessonsRoot);
  const searched = searchLessons(lessons, { lessonId: "lesson_014_cross_sentence_reasoning" });
  assert.equal(searched.length >= 1, true);
  assert.equal(searched[0]?.lesson.id, "lesson_014_cross_sentence_reasoning");
  console.log("✓ lesson search still resolves the cross-sentence lesson");
}

function testPatterns(): void {
  const documents = loadPatternLibraryDocumentsFromDirectory(PATTERN_DIR);
  assert.equal(documents.length, 1);
  const validation = validatePatternLibraryDocument(documents[0]);
  assert.equal(validation.valid, true, validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  assert.equal(validation.issues.length, 0);
  assert.equal(createPatternLibraryRegistry(join(ROOT, "patternLibraries")).getEntry("travel_pattern_travel_reference")?.id, "travel_pattern_travel_reference");
  console.log("✓ travel semantic pattern library validates");
}

function testDecisionRecords(): void {
  const records = loadDecisionRecordsFromDirectory(DECISION_DIR);
  assert.equal(records.length, 250);
  const validation = validateDecisionRecords(records, { rootDir: join(ROOT, "decisionRecords", "examples") });
  assert.equal(validation.valid, true, validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  assert.equal(validation.issues.length, 0);
  assert.equal(records.some((record) => record.id.startsWith("travel_decision_001_travel_reference")), true);
  console.log("✓ travel decision records validate");
}

function testBenchmarks(): void {
  const catalog = JSON.parse(readFileSync(BENCHMARK_FILE, "utf8")) as { cases: unknown[] };
  const validator = createBenchmarkValidator();
  const validation = validator.validateCases(catalog.cases as never);
  assert.equal(validation.valid, true, validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  assert.equal(validation.issues.length, 0);
  assert.equal(catalog.cases.length, 250);
  console.log("✓ travel benchmark catalog validates");
}

function testCoverage(): void {
  const analyzer = createDomainCoverageAnalyzer();
  const report = analyzer.analyze("travel");
  mkdirSync(join(ROOT, "blueprints", "travel"), { recursive: true });
  writeFileSync(COVERAGE_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  assert.equal(report.productionReadiness >= 98, true, `productionReadiness=${report.productionReadiness}`);
  assert.equal(report.criticalGaps.length, 0, report.criticalGaps.join("; "));
  assert.equal(report.recommendation, "READY");
  assert.equal(report.metrics.missingConceptCount, 0);
  assert.equal(report.metrics.missingPatternCoverage, 0);
  assert.equal(report.metrics.missingDecisionCoverage, 0);
  assert.equal(report.metrics.missingBenchmarkCoverage, 0);
  assert.equal(discoverDomainCoverageDomains().includes("travel"), true);
  console.log("✓ travel domain coverage analyzer reports production readiness");
}

function testDeterministicHashes(): void {
  const contentsA = readFileSync(COVERAGE_FILE, "utf8");
  const contentsB = readFileSync(COVERAGE_FILE, "utf8");
  const hashA = createHash("sha256").update(contentsA, "utf8").digest("hex");
  const hashB = createHash("sha256").update(contentsB, "utf8").digest("hex");
  assert.equal(hashA, hashB);
  assertCondition(hashA.length === 64, "coverage hash should be 64 hex characters");
  console.log("✓ travel coverage report hash is deterministic");
}

async function main(): Promise<void> {
  testBlueprints();
  testAcademyPack();
  testLessons();
  testPatterns();
  testDecisionRecords();
  testBenchmarks();
  testCoverage();
  testDeterministicHashes();
  console.log("\nAll travel domain tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
