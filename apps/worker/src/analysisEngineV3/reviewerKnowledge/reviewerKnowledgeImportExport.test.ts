/**
 * Compatibility test shim for the V3 reviewer knowledge import/export system.
 *
 * Why this file exists:
 * - Verifies that current reviewer-knowledge documents and legacy raw pack shapes both still import safely.
 *
 * Active V3 reviewer pipeline participation:
 * - Test-only compatibility coverage; no runtime participation.
 *
 * Backward compatibility:
 * - Retained intentionally to protect legacy import/export behavior.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and after legacy reviewer-knowledge formats are fully retired.
 *
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/reviewerKnowledgeImportExport.test.ts
 */
import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import { selectReviewerKnowledgePacks } from "./reviewerKnowledgeSelector.js";
import { PROFANITY_REVIEWER_KNOWLEDGE_PACK } from "./packs/profanityPack.js";
import { SECURITY_REVIEWER_KNOWLEDGE_PACK } from "./packs/securityPack.js";
import { createReviewerKnowledgePackBundle, createReviewerKnowledgePackDocument, importReviewerKnowledgeDocument, loadReviewerKnowledgeDocumentsFromDirectory, saveReviewerKnowledgeDocumentToFile, serializeReviewerKnowledgePackBundle, serializeReviewerKnowledgePackDocument } from "./reviewerKnowledgeIO.js";
import { createReviewerKnowledgeRegistryFromDirectory } from "./reviewerKnowledgeRegistry.js";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeAssessment(): ReviewerAssessment {
  return {
    methodologyId: "universal_reviewer_methodology_v1",
    methodologyTitle: "Universal Reviewer Methodology",
    narrativeUnderstanding: "dialogue",
    speaker: "A",
    target: null,
    victim: null,
    narrativeIntent: "neutral",
    evidenceStrength: 0.9,
    contextClassification: "dialogue",
    literalVsImpliedMeaning: "literal",
    exceptionSignals: Object.freeze([]),
    confidence: 0.9,
    applicableConceptIds: Object.freeze(["profanity", "government"]),
    conceptConfidence: 0.9,
    conceptCount: 2,
    reasoningTrace: Object.freeze([]),
    stageResults: Object.freeze([]),
  } as ReviewerAssessment;
}

function makeConceptContext(): ConceptContext {
  return {
    concepts: Object.freeze([]),
    conceptIds: Object.freeze(["profanity", "government"]),
    primaryConceptId: "profanity",
    confidence: 0.9,
    conceptCount: 2,
  } as ConceptContext;
}

function testVersionedPackDocuments(): void {
  const document = createReviewerKnowledgePackDocument(PROFANITY_REVIEWER_KNOWLEDGE_PACK, "1.2.0");
  assert.equal(document.schema_version, 1);
  assert.equal(document.pack_version, "1.2.0");
  assert.equal(document.pack.id, "v4_11_profanity");
  console.log("✓ versioned pack documents are created deterministically");
}

function testJsonRoundTrip(): void {
  const bundle = createReviewerKnowledgePackBundle([PROFANITY_REVIEWER_KNOWLEDGE_PACK, SECURITY_REVIEWER_KNOWLEDGE_PACK], "2.0.0", "1.0.0");
  const serialized = serializeReviewerKnowledgePackBundle(bundle);
  const imported = importReviewerKnowledgeDocument(JSON.parse(serialized));

  assert.equal(imported.length, 2);
  assert.equal(imported[0]?.id, "v3_03_security");
  assert.equal(imported[1]?.id, "v4_11_profanity");
  console.log("✓ JSON bundle round-trips through the import/export system");
}

function testLegacyBackwardCompatibility(): void {
  const serialized = serializeReviewerKnowledgePackDocument(createReviewerKnowledgePackDocument(PROFANITY_REVIEWER_KNOWLEDGE_PACK));
  const legacyInput = JSON.parse(serialized).pack;
  const imported = importReviewerKnowledgeDocument(legacyInput);

  assert.equal(imported.length, 1);
  assert.equal(imported[0]?.module_id, "v4_11_profanity");
  console.log("✓ legacy raw pack objects still import successfully");
}

async function testDirectoryHotLoad(): Promise<void> {
  const workingDir = await mkdtemp(join(tmpdir(), "raawi-reviewer-knowledge-"));
  try {
    const profanityPath = join(workingDir, "profanity.pack.json");
    const securityPath = join(workingDir, "security.pack.yaml");

    await saveReviewerKnowledgeDocumentToFile(profanityPath, createReviewerKnowledgePackDocument(PROFANITY_REVIEWER_KNOWLEDGE_PACK, "1.0.0"));
    await saveReviewerKnowledgeDocumentToFile(securityPath, createReviewerKnowledgePackDocument(SECURITY_REVIEWER_KNOWLEDGE_PACK, "1.0.0"), "yaml");

    const loaded = await loadReviewerKnowledgeDocumentsFromDirectory(workingDir);
    assert.equal(loaded.packs.length, 2);
    assert.equal(loaded.documents.length, 2);

    const registry = await createReviewerKnowledgeRegistryFromDirectory(workingDir);
    assert.equal(registry.load("v4_11_profanity")?.id, "v4_11_profanity");
    assert.equal(registry.load("v3_03_security")?.id, "v3_03_security");

    const packs = selectReviewerKnowledgePacks(makeAssessment(), makeConceptContext(), registry);
    assert.equal(packs.length, 2);
    assertCondition(packs.some((pack) => pack.id === "v4_11_profanity"), "hot-loaded registry should include the profanity pack");
    assertCondition(packs.some((pack) => pack.id === "v3_03_security"), "hot-loaded registry should include the security pack");
    console.log("✓ knowledge packs hot-load from versioned JSON/YAML files");
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  testVersionedPackDocuments();
  testJsonRoundTrip();
  testLegacyBackwardCompatibility();
  await testDirectoryHotLoad();
  console.log("\nAll V3 reviewer knowledge import/export tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
