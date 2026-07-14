/**
 * Tests for reviewer knowledge pattern libraries.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/patternLibraries/patternLibrary.test.ts
 */
import { strict as assert } from "node:assert";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPatternLibraryRegistry } from "./patternLibraryRegistry.js";
import { renderPatternLibraryDocument } from "./patternLibraryRenderer.js";
import { validatePatternLibraryDocument } from "./patternLibraryValidator.js";

function blueprintRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "corruption");
}

function tempRoot(): string {
  const root = join(process.cwd(), ".tmp", "pattern-libraries");
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, "run-"));
}

function cloneBlueprint(): string {
  const root = tempRoot();
  cpSync(blueprintRoot(), root, { recursive: true });
  return root;
}

function testRegistry(): void {
  const registry = createPatternLibraryRegistry(dirname(blueprintRoot()));
  assert.equal(registry.documents.length, 21);
  assert.equal(registry.listEntries().length, 327);
  assert.equal(registry.validation.valid, true);
  assert.equal(registry.hash.length, 64);
}

function testValidator(): void {
  const document = JSON.parse(readFileSync(join(blueprintRoot(), "corruption_semantic_patterns.v1.json"), "utf8")) as any;
  const result = validatePatternLibraryDocument(document);
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.hash.length, 64);
  assert.equal(createPatternLibraryRegistry(dirname(blueprintRoot())).getEntry("sexual_pattern_01_sexual_reference")?.id, "sexual_pattern_01_sexual_reference");
  assert.equal(createPatternLibraryRegistry(dirname(blueprintRoot())).getEntry("travel_pattern_travel_reference")?.id, "travel_pattern_travel_reference");
  assert.equal(renderPatternLibraryDocument(document) === renderPatternLibraryDocument(document), true);
}

function testDeterministicHash(): void {
  const registryA = createPatternLibraryRegistry(dirname(blueprintRoot()));
  const registryB = createPatternLibraryRegistry(dirname(blueprintRoot()));
  assert.equal(registryA.hash, registryB.hash);
}

function testDuplicateExpressions(): void {
  const root = cloneBlueprint();
  try {
    const filePath = join(root, "corruption_semantic_patterns.v1.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const entries = Array.isArray(document.entries) ? [...document.entries] : [];
    const first = entries[0] as Record<string, unknown>;
    const existingDirects = Array.isArray(first.direct_expressions) ? [...first.direct_expressions] : [];
    first.direct_expressions = [...existingDirects, existingDirects[0] ?? "خذ الظرف"];
    entries[0] = first;
    document.entries = entries;
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const result = validatePatternLibraryDocument(JSON.parse(readFileSync(filePath, "utf8")));
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.code.includes("direct_expressions")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testMissingConceptReference(): void {
  const root = cloneBlueprint();
  try {
    const filePath = join(root, "corruption_semantic_patterns.v1.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const entries = Array.isArray(document.entries) ? [...document.entries] : [];
    const first = entries[0] as Record<string, unknown>;
    first.primary_concept_id = "missing_concept";
    entries[0] = first;
    document.entries = entries;
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const result = validatePatternLibraryDocument(JSON.parse(readFileSync(filePath, "utf8")));
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.message.includes("Missing concept reference")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testCircularRelationships(): void {
  const root = cloneBlueprint();
  try {
    const filePath = join(root, "corruption_semantic_patterns.v1.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const entries = Array.isArray(document.entries) ? [...document.entries] : [];
    const first = entries[0] as Record<string, unknown>;
    first.glossary_relationships = [
      ...(Array.isArray(first.glossary_relationships) ? first.glossary_relationships : []),
      { id: "cycle_a", from_concept_id: "corruption", to_concept_id: "bribery", relation: "related" },
      { id: "cycle_b", from_concept_id: "bribery", to_concept_id: "corruption", relation: "related" },
    ];
    entries[0] = first;
    document.entries = entries;
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    const result = validatePatternLibraryDocument(JSON.parse(readFileSync(filePath, "utf8")));
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.code === "relationships.cycle"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  testRegistry();
  testValidator();
  testDeterministicHash();
  testDuplicateExpressions();
  testMissingConceptReference();
  testCircularRelationships();
  console.log("All pattern library tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
