/**
 * Tests for the V3 Reviewer Academy loader and manifest.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/academy/reviewerAcademy.test.ts
 */
import { strict as assert } from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultReviewerKnowledgeRegistry } from "../reviewerKnowledgeRegistry.js";
import { createReviewerAcademyLoader, loadReviewerAcademyIndex } from "./reviewerAcademyLoader.js";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function getAcademyRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)));
}

function testAcademyIndexDiscovery(): void {
  const rootDir = getAcademyRoot();
  const index = loadReviewerAcademyIndex(rootDir);

  assert.equal(index.manifest.entries.length, 14);
  assert.equal(index.metadata.length, 14);
  assert.equal(index.packs.length, 13);
  assert.equal(index.manifest.entries[0]?.metadata.id, "v3_00_universal");
  assertCondition(index.manifest.entries.some((entry) => entry.metadata.id === "v3_13_travel" && entry.hasPack), "travel pack should be a full academy pack");
  assert.equal(index.manifest.entries[index.manifest.entries.length - 1]?.metadata.id, "v4_11_profanity");
  assertCondition(index.manifest.entries.some((entry) => entry.metadata.id === "v3_03_security" && entry.hasPack), "security pack should be a full academy pack");
  assertCondition(index.manifest.entries.some((entry) => entry.metadata.id === "v3_01_religion" && entry.hasPack), "religion pack should be a full academy pack");
  assertCondition(index.manifest.entries.some((entry) => entry.metadata.id === "v3_05_children" && entry.hasPack), "children pack should be a full academy pack");
  assertCondition(index.manifest.entries.some((entry) => entry.metadata.id === "v3_08_violence" && entry.hasPack), "violence pack should be a full academy pack");
  assertCondition(index.manifest.entries.some((entry) => entry.metadata.id === "v3_07_sexuality" && entry.hasPack), "sexuality pack should be a full academy pack");
  assertCondition(index.manifest.entries.some((entry) => entry.metadata.id === "v3_09_glossary" && !entry.hasPack), "glossary pack should be metadata-only");
  console.log("✓ academy index discovers all pack folders deterministically");
}

function testLoaderAndRegistry(): void {
  const rootDir = getAcademyRoot();
  const loader = createReviewerAcademyLoader(rootDir);
  const index = loader.loadIndex();
  const registry = createDefaultReviewerKnowledgeRegistry();

  assert.equal(index.packs.length, 13);
  assert.equal(registry.load("v3_00_universal")?.id, "v3_00_universal");
  assert.equal(registry.load("v3_01_religion")?.id, "v3_01_religion");
  assert.equal(registry.load("v3_03_security")?.id, "v3_03_security");
  assert.equal(registry.load("v3_13_travel")?.id, "v3_13_travel");
  assert.equal(registry.load("v3_05_children")?.id, "v3_05_children");
  assert.equal(registry.load("v3_08_violence")?.id, "v3_08_violence");
  assert.equal(registry.load("v3_07_sexuality")?.id, "v3_07_sexuality");
  assert.equal(registry.load("v4_11_profanity")?.id, "v4_11_profanity");
  console.log("✓ academy loader feeds the default registry without hardcoded imports");
}

async function main(): Promise<void> {
  testAcademyIndexDiscovery();
  testLoaderAndRegistry();
  console.log("\nAll V3 reviewer academy tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
