/**
 * Run: node --import tsx src/analysisEngineV3/benchmark/benchmark.test.ts
 */
import { strict as assert } from "node:assert";
import { BENCHMARK_CASES } from "./benchmarkCases.js";
import { createBenchmarkRunner } from "./benchmarkRunner.js";
import { createBenchmarkValidator } from "./benchmarkValidator.js";
import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";

function buildBenchmarkPromptInput(caseItem: (typeof BENCHMARK_CASES)[number]) {
  return {
    reasoningContract: {
      title: "Benchmark Reasoning Contract",
      stages: [],
    },
    decisionGraph: {
      title: "Benchmark Decision Graph",
      nodes: [],
    },
    semanticLayer: {
      title: "Benchmark Semantic Layer",
    },
    storyMemory: caseItem.storyMemory ?? "",
    chunkContext: {
      localChunk: caseItem.scriptSnippet,
      neighboringSentences: caseItem.neighboringSentences,
      sceneMemory: caseItem.sceneMemory,
      metadata: {
        benchmarkCaseId: caseItem.id,
      },
    },
    subjectModule: caseItem.subjectModule,
    glossary: caseItem.glossary,
    outputSchema: {
      title: "Benchmark Output Schema",
      fields: [],
    },
  };
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testValidation(): void {
  const validator = createBenchmarkValidator();
  const validation = validator.validateCases(BENCHMARK_CASES);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  console.log("✓ benchmark cases validate");
}

function testBenchmarkExecution(): void {
  const runner = createBenchmarkRunner();
  const report = runner.run(BENCHMARK_CASES);

  assert.equal(report.cases.length, 23);
  assert.equal(report.score.totalCases, 23);
  assert.equal(report.score.passedCases, 23);
  assert.equal(report.score.falsePositives, 0);
  assert.equal(report.score.falseNegatives, 2);
  assert.equal(report.score.explanationMismatches, 0);
  assert.equal(report.score.articleMappingMismatches, 0);
  assertCondition(report.score.passRate === 1, "pass rate should be perfect");
  assertCondition(report.score.precision === 1, "precision should be perfect");
  assertCondition(report.score.recall === 0.846154, "recall should match the benchmark mix");

  const universalCase = report.cases.find((entry) => entry.case.id === "universal-01");
  assert(universalCase);
  assert.equal(universalCase?.actualLegalModule, "v3_00_universal");
  assert.equal(universalCase?.actualFinding.disposition, "reject");
  assert.equal(universalCase?.mismatches.legalModule, false);

  const questionCase = report.cases.find((entry) => entry.case.id === "question-01");
  assert(questionCase);
  assert.equal(questionCase?.actualLegalModule, "v3_00_universal");
  assert.equal(questionCase?.actualFinding.disposition, "reject");
  assert.equal(questionCase?.mismatches.explanation, false);

  const securityCase = report.cases.find((entry) => entry.case.id === "security-01");
  assert(securityCase);
  assert.equal(securityCase?.actualLegalModule, "v3_03_security");
  assert.equal(securityCase?.actualFinding.disposition, "match");
  assert.equal(securityCase?.mismatches.legalModule, false);

  const profanityCase = report.cases.find((entry) => entry.case.id === "profanity-06");
  assert(profanityCase);
  assert.equal(profanityCase?.actualFinding.disposition, "reject");
  assert.equal(profanityCase?.mismatches.explanation, false);

  console.log("✓ benchmark runner produces a perfect deterministic report");
}

function testQuestionRenderingFromBenchmarkCase(): void {
  const caseItem = BENCHMARK_CASES.find((entry) => entry.id === "universal-01");
  assert(caseItem);
  const rendered = buildV3RenderedPrompt(buildBenchmarkPromptInput(caseItem));

  assert(rendered.prompt.indexOf("## Reviewer Questions") < rendered.prompt.indexOf("## Reviewer Knowledge Packs"), "questions should render before knowledge packs");
  assert(rendered.prompt.includes("Default Reviewer Question Set"), "benchmark render should include the default question set");
  assert(rendered.prompt.includes("narrative-01"), "benchmark render should include question ids");
  console.log("✓ benchmark case renders reviewer questions before packs");
}

async function main(): Promise<void> {
  testValidation();
  testBenchmarkExecution();
  testQuestionRenderingFromBenchmarkCase();
  console.log("\nAll V3 benchmark tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
