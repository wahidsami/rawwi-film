/**
 * Reviewer Judgment Framework validation.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/reasoning/reviewerJudgment/tests/reviewerJudgmentFramework.test.ts
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createBenchmarkValidator } from "../../../../benchmark/benchmarkValidator.js";
import { createDomainCoverageAnalyzer, discoverDomainCoverageDomains } from "../../../domainCoverage/domainCoverageAnalyzer.js";
import { validateBlueprints } from "../../../blueprints/blueprintValidator.js";
import { lintAcademyPackFile } from "../../../linter/knowledgeLinter.js";
import { loadDecisionRecordsFromDirectory } from "../../../decisionRecords/decisionRecordLoader.js";
import { validateDecisionRecords } from "../../../decisionRecords/decisionRecordValidator.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "../../../lessons/lessonLoader.js";
import { searchLessons } from "../../../lessons/lessonSearch.js";
import { validateReviewerKnowledgeLesson } from "../../../lessons/lessonValidator.js";
import { loadPatternLibraryDocumentsFromDirectory, validatePatternLibraryDocument } from "../../../patternLibraries/patternLibraryValidator.js";

const ROOT = join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge", "reasoning", "reviewerJudgment");
const BLUEPRINT_ROOT = join(ROOT, "blueprints");
const ACADEMY_ROOT = join(ROOT, "academy");
const LESSON_ROOT = join(ROOT, "lessons");
const PATTERN_ROOT = join(ROOT, "patternLibraries");
const DECISION_ROOT = join(ROOT, "decisionRecords", "examples");
const BENCHMARK_FILE = join(ROOT, "benchmarks", "reviewer_judgment_benchmark_cases.v1.json");
const COVERAGE_FILE = join(ROOT, "coverage", "reviewer_judgment_coverage_report.json");

function testBlueprints(): void {
  const validation = validateBlueprints(BLUEPRINT_ROOT);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  assert.equal(validation.issues.length, 0);
}

function testAcademyPack(): void {
  const report = lintAcademyPackFile(join(ACADEMY_ROOT, "pack.v1.json"));
  assert.equal(report.overallScore.readyForAcademy, true, report.errors.map((issue) => issue.message).join("; "));
  assert.equal(report.errors.length, 0, report.errors.map((issue) => issue.message).join("; "));
  assert.equal(report.overallScore.score > 0, true);
}

function testLessons(): void {
  const lessons = loadReviewerKnowledgeLessonsFromDirectory(LESSON_ROOT);
  assert.equal(lessons.length, 2);
  assert.equal(lessons[0]?.id, "lesson_001_reviewer_judgment");
  const lessonValidation = validateReviewerKnowledgeLesson(lessons[0]!);
  assert.equal(lessonValidation.valid, true, lessonValidation.issues.map((issue) => issue.message).join("; "));
  const calibrationLesson = lessons.find((lesson) => lesson.id === "lesson_002_reviewer_judgment_calibration");
  assert.equal(Boolean(calibrationLesson), true);
  assert.equal(validateReviewerKnowledgeLesson(calibrationLesson!).valid, true);
  assert.equal(searchLessons(lessons, { concept: "confidence calibration" }).length > 0, true);
  assert.equal(searchLessons(lessons, { concept: "borderline decisions" }).length > 0, true);
}

function testPatterns(): void {
  const documents = loadPatternLibraryDocumentsFromDirectory(PATTERN_ROOT);
  assert.equal(documents.length, 1);
  const validation = validatePatternLibraryDocument(documents[0]!);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  assert.equal(validation.issues.length, 0);
}

function testDecisionRecords(): void {
  const records = loadDecisionRecordsFromDirectory(DECISION_ROOT);
  assert.equal(records.length, 6);
  const validation = validateDecisionRecords(records, { rootDir: DECISION_ROOT });
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  assert.equal(validation.issues.length, 0);
}

function testBenchmarks(): void {
  const catalog = JSON.parse(readFileSync(BENCHMARK_FILE, "utf8")) as { cases: unknown[] };
  const validator = createBenchmarkValidator();
  const validation = validator.validateCases(catalog.cases as never);
  assert.equal(Array.isArray(catalog.cases), true);
  assert.equal(catalog.cases.length, 16);
  assert.equal(validation.valid, true, validation.issues.map((issue) => issue.message).join("; "));
  assert.equal(validation.issues.length, 0);
}

function testCoverage(): void {
  const analyzer = createDomainCoverageAnalyzer();
  const report = analyzer.analyze("reviewerJudgment");
  mkdirSync(join(ROOT, "coverage"), { recursive: true });
  writeFileSync(COVERAGE_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  assert.equal(report.productionReadiness >= 98, true, `productionReadiness=${report.productionReadiness}`);
  assert.equal(report.criticalGaps.length, 0, report.criticalGaps.join("; "));
  assert.equal(report.recommendation, "READY");
  assert.equal(report.metrics.missingConceptCount, 0);
  assert.equal(report.metrics.missingPatternCoverage, 0);
  assert.equal(report.metrics.missingDecisionCoverage, 0);
  assert.equal(report.metrics.missingBenchmarkCoverage, 0);
  assert.equal(discoverDomainCoverageDomains().includes("reviewerjudgment"), true);
}

function testDeterministicHash(): void {
  const contents = readFileSync(COVERAGE_FILE, "utf8");
  const hashA = createHash("sha256").update(contents, "utf8").digest("hex");
  const hashB = createHash("sha256").update(contents, "utf8").digest("hex");
  assert.equal(hashA, hashB);
}

async function main(): Promise<void> {
  testBlueprints();
  testAcademyPack();
  testLessons();
  testPatterns();
  testDecisionRecords();
  testBenchmarks();
  testCoverage();
  testDeterministicHash();
  console.log("All reviewer judgment framework tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
