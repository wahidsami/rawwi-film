/**
 * Determinism tests for the V3 reviewer question framework.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerQuestions/reviewerQuestions.test.ts
 */
import { strict as assert } from "node:assert";
import { createDefaultReviewerQuestionRegistry, getDefaultReviewerQuestionSet } from "./reviewerQuestionRegistry.js";
import { renderReviewerQuestionSetSection } from "./reviewerQuestionRenderer.js";
import { validateReviewerQuestionSet } from "./reviewerQuestionValidator.js";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testRegistryAndValidation(): void {
  const registry = createDefaultReviewerQuestionRegistry();
  const questionSet = registry.load("v3_00_universal_questions_v1");

  assert(questionSet);
  assert.equal(questionSet?.id, getDefaultReviewerQuestionSet().id);

  const validation = validateReviewerQuestionSet(getDefaultReviewerQuestionSet());
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  console.log("✓ reviewer question registry and validation work deterministically");
}

function testRenderer(): void {
  const questionSet = getDefaultReviewerQuestionSet();
  const renderedA = renderReviewerQuestionSetSection(questionSet);
  const renderedB = renderReviewerQuestionSetSection(questionSet);

  assert.equal(renderedA, renderedB);
  assertCondition(renderedA.includes("Reviewer Questions"), "question section should render");
  assertCondition(renderedA.includes("Default Reviewer Question Set"), "default question set title should render");
  assertCondition(renderedA.includes("narrative-01"), "narrative question should render");
  assertCondition(renderedA.includes("confidence-01"), "confidence question should render");
  console.log("✓ reviewer question renderer is deterministic");
}

async function main(): Promise<void> {
  testRegistryAndValidation();
  testRenderer();
  console.log("\nAll V3 reviewer question tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

