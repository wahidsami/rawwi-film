/**
 * Tests for the external knowledge registry.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/knowledge/knowledgeRegistry.test.ts
 */
import { strict as assert } from "node:assert";

import { ensureKnowledgeRegistry, reloadKnowledgeRegistry } from "./knowledgeRegistry.js";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testRegistryLoadsKnowledgeMarkdown(): void {
  const first = ensureKnowledgeRegistry();
  const second = ensureKnowledgeRegistry();

  assert.strictEqual(first, second);
  assert.equal(first.fileCount, 24);
  assert.equal(first.markdownCount, 24);
  assert.equal(first.knowledgeDomainCount, 24);
  assertCondition(first.documents.length === 24, "all knowledge documents should load");
  assertCondition(first.documents.some((document) => document.metadata.knowledgeDomain === "religion"), "religion knowledge should load");
  assertCondition(first.documents.some((document) => document.metadata.knowledgeDomain === "media_credibility"), "media credibility knowledge should load");
  assertCondition(first.documents.some((document) => document.metadata.knowledgeDomain === "misinformation_rumors"), "misinformation knowledge should load");
  assertCondition(first.documents.some((document) => document.metadata.knowledgeDomain === "public_order"), "public order knowledge should load");
  assertCondition(first.documents.some((document) => document.metadata.knowledgeDomain === "clothing_modesty"), "clothing modesty knowledge should load");
  assertCondition(first.documents.some((document) => document.metadata.reviewType === "Verification"), "verification knowledge should be inferred");
  assertCondition(first.documents.some((document) => document.metadata.primaryEvidence === "StoryContext"), "story-context evidence should be inferred");
  assertCondition(first.documents.some((document) => document.metadata.primaryEvidence === "SceneDescription"), "scene-description evidence should be inferred");
  assertCondition(first.documents.some((document) => document.metadata.primaryEvidence === "Dialogue"), "dialogue evidence should be inferred");
  assertCondition((first.documentsByDomain.religion?.length ?? 0) === 1, "religion domain should have one document");
  assertCondition((first.filesByDomain.religion?.[0] ?? "").includes("Article_01_Religion.md"), "religion file should be indexed");

  const refreshed = reloadKnowledgeRegistry();
  assertCondition(refreshed !== first, "reload should create a fresh registry instance");
  assert.equal(refreshed.fileCount, first.fileCount);
  assert.equal(refreshed.knowledgeDomainCount, first.knowledgeDomainCount);

  console.log("✓ external knowledge registry loads, caches, and reloads deterministically");
}

function main(): void {
  testRegistryLoadsKnowledgeMarkdown();
  console.log("\nAll knowledge registry tests passed.");
}

main();
