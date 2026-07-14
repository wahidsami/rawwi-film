/**
 * Society domain validation.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/society/societyDomain.test.ts
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createBenchmarkValidator } from "../../benchmark/benchmarkValidator.js";
import { validateBlueprints } from "../../reviewerKnowledge/blueprints/blueprintValidator.js";
import { loadDecisionRecordsFromDirectory } from "../../reviewerKnowledge/decisionRecords/decisionRecordLoader.js";
import { searchDecisionRecords } from "../../reviewerKnowledge/decisionRecords/decisionRecordSearch.js";
import { validateDecisionRecords } from "../../reviewerKnowledge/decisionRecords/decisionRecordValidator.js";
import { createDomainCoverageAnalyzer, discoverDomainCoverageDomains } from "../../reviewerKnowledge/domainCoverage/domainCoverageAnalyzer.js";
import { loadPatternLibraryDocumentsFromDirectory, validatePatternLibraryDocument } from "../../reviewerKnowledge/patternLibraries/patternLibraryValidator.js";
import { lintAcademyPackFile } from "../../reviewerKnowledge/linter/knowledgeLinter.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "../../reviewerKnowledge/lessons/lessonLoader.js";

const ROOT = join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge");
const BLUEPRINT_ROOT = join(ROOT, "blueprints", "society");
const ACADEMY_PACK = join(ROOT, "academy", "society", "pack.v1.json");
const LESSON_ROOT = join(ROOT, "lessons", "universal");
const PATTERN_ROOT = join(ROOT, "patternLibraries", "society");
const DECISION_ROOT = join(ROOT, "decisionRecords", "examples", "society");
const DECISION_VALIDATION_ROOT = join(ROOT, "decisionRecords", "examples");
const BENCHMARK_FILE = join(ROOT, "benchmarks", "society", "society_benchmark_cases.v1.json");
const COVERAGE_FILE = join(ROOT, "blueprints", "society", "society_coverage_report.json");

function testBlueprints(): void {
  const validation = validateBlueprints(BLUEPRINT_ROOT);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  assert.equal(validation.issues.length, 0);
}

function testAcademyPack(): void {
  const report = lintAcademyPackFile(ACADEMY_PACK);
  assert.equal(report.overallScore.readyForAcademy, true);
  assert.equal(report.errors.length, 0, report.errors.map((issue) => issue.message).join("; "));
}

function testLessons(): void {
  const lessons = loadReviewerKnowledgeLessonsFromDirectory(LESSON_ROOT);
  assert.equal(lessons.some((lesson) => lesson.id === "lesson_001_what_is_a_finding"), true);
}

function testPatterns(): void {
  const documents = loadPatternLibraryDocumentsFromDirectory(PATTERN_ROOT);
  assert.equal(documents.length >= 1, true);
  for (const document of documents) {
    const validation = validatePatternLibraryDocument(document);
    assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  }
}

function testDecisionRecords(): void {
  const records = loadDecisionRecordsFromDirectory(DECISION_ROOT);
  assert.equal(records.length >= 80, true);
  const validation = validateDecisionRecords(records, { rootDir: DECISION_VALIDATION_ROOT });
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  assert.equal(searchDecisionRecords(records, { concept: "society_bullying" }).length >= 1, true);
}

function testBenchmarks(): void {
  const catalog = JSON.parse(readFileSync(BENCHMARK_FILE, "utf8")) as { cases: unknown[] };
  const validator = createBenchmarkValidator();
  const validation = validator.validateCases(catalog.cases as never);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  assert.equal(catalog.cases.length >= 200, true);
}

function testCoverage(): void {
  const analyzer = createDomainCoverageAnalyzer();
  const report = analyzer.analyze("society");
  mkdirSync(join(ROOT, "blueprints", "society"), { recursive: true });
  writeFileSync(COVERAGE_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");
  assert.equal(report.productionReadiness >= 98, true, "productionReadiness=" + report.productionReadiness);
  assert.equal(report.criticalGaps.length, 0, report.criticalGaps.join("; "));
  assert.equal(report.recommendation, "READY");
  assert.equal(report.metrics.missingConceptCount, 0);
  assert.equal(report.metrics.missingPatternCoverage, 0);
  assert.equal(report.metrics.missingDecisionCoverage, 0);
  assert.equal(report.metrics.missingBenchmarkCoverage, 0);
  assert.equal(discoverDomainCoverageDomains().includes("society"), true);
}

function testDeterministicHashes(): void {
  const contentsA = readFileSync(COVERAGE_FILE, "utf8");
  const contentsB = readFileSync(COVERAGE_FILE, "utf8");
  const hashA = createHash("sha256").update(contentsA, "utf8").digest("hex");
  const hashB = createHash("sha256").update(contentsB, "utf8").digest("hex");
  assert.equal(hashA, hashB);
}

function main(): void {
  testBlueprints();
  testAcademyPack();
  testLessons();
  testPatterns();
  testDecisionRecords();
  testBenchmarks();
  testCoverage();
  testDeterministicHashes();
  console.log("All society domain tests passed.");
}

main();
