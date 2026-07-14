/**
 * Relationships framework validation.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/reasoning/relationships/relationshipsFramework.test.ts
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createBenchmarkValidator } from "../../../benchmark/benchmarkValidator.js";
import { validateBlueprints } from "../../../reviewerKnowledge/blueprints/blueprintValidator.js";
import { loadDecisionRecordsFromDirectory } from "../../../reviewerKnowledge/decisionRecords/decisionRecordLoader.js";
import { validateDecisionRecords } from "../../../reviewerKnowledge/decisionRecords/decisionRecordValidator.js";
import { createDomainCoverageAnalyzer, discoverDomainCoverageDomains } from "../../../reviewerKnowledge/domainCoverage/domainCoverageAnalyzer.js";
import { loadPatternLibraryDocumentsFromDirectory, validatePatternLibraryDocument } from "../../../reviewerKnowledge/patternLibraries/patternLibraryValidator.js";
import { lintAcademyPackFile } from "../../../reviewerKnowledge/linter/knowledgeLinter.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "../../../reviewerKnowledge/lessons/lessonLoader.js";

const ROOT = join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge", "reasoning", "relationships");
const BLUEPRINT_ROOT = join(ROOT, "blueprints");
const ACADEMY_PACK = join(ROOT, "academy", "pack.v1.json");
const LESSON_ROOT = join(ROOT, "lessons");
const PATTERN_ROOT = join(ROOT, "patternLibraries");
const DECISION_ROOT = join(ROOT, "decisionRecords");
const BENCHMARK_FILE = join(ROOT, "benchmarks", "relationship_benchmark_cases.v1.json");
const COVERAGE_FILE = join(ROOT, "coverage", "relationships_coverage_report.json");

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
  assert.equal(lessons.some((lesson) => lesson.id === "lesson_001_relationship_framework"), true);
}

function testPatterns(): void {
  const documents = loadPatternLibraryDocumentsFromDirectory(PATTERN_ROOT);
  assert.equal(documents.length, 1);
  for (const document of documents) {
    const validation = validatePatternLibraryDocument(document);
    assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  }
}

function testDecisionRecords(): void {
  const records = loadDecisionRecordsFromDirectory(join(DECISION_ROOT, "examples"));
  assert.equal(records.length, 50);
  const validation = validateDecisionRecords(records, { rootDir: join(DECISION_ROOT, "examples") });
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
}

function testBenchmarks(): void {
  const catalog = JSON.parse(readFileSync(BENCHMARK_FILE, "utf8")) as { cases: unknown[] };
  const validator = createBenchmarkValidator();
  const validation = validator.validateCases(catalog.cases as never);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  assert.equal(catalog.cases.length >= 150, true);
}

function testCoverage(): void {
  const analyzer = createDomainCoverageAnalyzer();
  const report = analyzer.analyze("relationships");
  mkdirSync(join(ROOT, "coverage"), { recursive: true });
  writeFileSync(COVERAGE_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  assert.equal(report.productionReadiness >= 98, true, `productionReadiness=${report.productionReadiness}`);
  assert.equal(report.criticalGaps.length, 0, report.criticalGaps.join("; "));
  assert.equal(report.recommendation, "READY");
  assert.equal(report.metrics.missingConceptCount, 0);
  assert.equal(report.metrics.missingPatternCoverage, 0);
  assert.equal(report.metrics.missingDecisionCoverage, 0);
  assert.equal(report.metrics.missingBenchmarkCoverage, 0);
  assert.equal(discoverDomainCoverageDomains().includes("relationships"), true);
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
  console.log("All relationships framework tests passed.");
}

main();
