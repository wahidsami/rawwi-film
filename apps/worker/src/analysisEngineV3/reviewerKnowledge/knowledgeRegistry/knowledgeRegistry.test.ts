/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/knowledgeRegistry/knowledgeRegistry.test.ts
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";

import { createKnowledgeRegistry, createKnowledgeRegistryFromEntries, defaultKnowledgeRegistryRoot } from "./index.js";
import type { KnowledgeRegistryEntry } from "./knowledgeRegistryTypes.js";

function testDefaultRegistryLoads(): void {
  const registry = createKnowledgeRegistry(defaultKnowledgeRegistryRoot());
  assert.equal(registry.list().length > 0, true);
  assert.equal(registry.validation.valid, true);
  assert.equal(registry.hash.length, 64);
  assert.equal(registry.statistics.totalCount, registry.list().length);
  assert.equal(Object.keys(registry.statistics.kindCounts).length > 0, true);
  console.log("✓ default knowledge registry loads deterministically");
}

function testRegistryValidation(): void {
  const entry: KnowledgeRegistryEntry = Object.freeze({
    registryKey: "lesson:lesson-test",
    metadata: Object.freeze({
      id: "lesson-test",
      title: "Lesson Test",
      description: "Lesson description",
      version: "1.0.0",
      kind: "lesson",
      domain: "test",
      category: "lesson",
      tags: Object.freeze(["test"]),
      aliases: Object.freeze([]),
      relatedIds: Object.freeze(["lesson:lesson-other"]),
      createdAt: null,
      updatedAt: null,
      hash: "hash",
    }),
    traceability: Object.freeze({
      source: "test",
      sourceKind: "lesson",
      sourcePath: "lessons/lesson-test.json",
      sourceDocumentId: null,
      sourcePage: null,
      reviewer: null,
      meeting: null,
      date: null,
    }),
    explainability: Object.freeze({
      summary: "Lesson summary",
      evidence: Object.freeze(["evidence"]),
      reasoning: Object.freeze(["reasoning"]),
      decision: "decision",
      confidence: 0.9,
      alternativeInterpretations: Object.freeze([]),
      rejectedInterpretations: Object.freeze([]),
    }),
    payload: Object.freeze({}),
  });

  const duplicate = Object.freeze({ ...entry, registryKey: "lesson:lesson-test-duplicate" });
  const registry = createKnowledgeRegistryFromEntries([entry, duplicate], defaultKnowledgeRegistryRoot());
  assert.equal(registry.validation.valid, false);
  assert.equal(registry.validation.issues.some((issue) => issue.code === "metadata.id.duplicate"), true);
  assert.equal(registry.statistics.duplicateIdCount >= 1, true);
  console.log("✓ knowledge registry validation catches duplicate metadata ids");
}

function testMissingGCAMResourcesFailFast(): void {
  const missingRoot = join(defaultKnowledgeRegistryRoot(), "__missing_gcam_resources__");
  assert.throws(() => createKnowledgeRegistry(missingRoot), /Required GCAM knowledge directory is missing/i);
  console.log("✓ missing GCAM knowledge resources fail fast");
}

async function main(): Promise<void> {
  testDefaultRegistryLoads();
  testRegistryValidation();
  testMissingGCAMResourcesFailFast();
  console.log("\nAll knowledge registry tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
