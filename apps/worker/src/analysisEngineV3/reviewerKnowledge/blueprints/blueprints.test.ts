/**
 * Tests for reviewer knowledge blueprints.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/blueprints/blueprints.test.ts
 */
import { strict as assert } from "node:assert";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBlueprints } from "./blueprintValidator.js";

function securityRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "security");
}

function tempRoot(): string {
  const root = join(process.cwd(), ".tmp", "blueprints");
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, "run-"));
}

function cloneSecurityBlueprints(): string {
  const root = tempRoot();
  cpSync(securityRoot(), root, { recursive: true });
  return root;
}

function testValidation(): void {
  const result = validateBlueprints(securityRoot());
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.hash.length, 64);
}

function testDeterministicHash(): void {
  const first = validateBlueprints(securityRoot());
  const second = validateBlueprints(securityRoot());
  assert.equal(first.hash, second.hash);
}

function testVersionValidation(): void {
  const root = cloneSecurityBlueprints();
  try {
    const filePath = join(root, "domain.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    document.version = "2.0.0";
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

    const result = validateBlueprints(root);
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.code === "document.0.version"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testDuplicateIds(): void {
  const root = cloneSecurityBlueprints();
  try {
    const filePath = join(root, "concepts.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const entries = Array.isArray(document.entries) ? [...document.entries] : [];
    entries.push({ id: "security_terrorism", title: "Duplicate Terrorism", description: "duplicate" });
    document.entries = entries;
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

    const result = validateBlueprints(root);
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.code.includes("duplicate") || issue.message.includes("Duplicate entry id")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testMissingReferences(): void {
  const root = cloneSecurityBlueprints();
  try {
    const filePath = join(root, "relationships.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const entries = Array.isArray(document.entries) ? [...document.entries] : [];
    entries.push({ from: "terrorism", to: "missing_concept", type: "related" });
    document.entries = entries;
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

    const result = validateBlueprints(root);
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.message.includes("Missing relationship target reference")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testCircularRelationships(): void {
  const root = cloneSecurityBlueprints();
  try {
    const filePath = join(root, "relationships.json");
    const document = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const entries = Array.isArray(document.entries) ? [...document.entries] : [];
    entries.push({ from: "security_extremism", to: "security_terrorism", type: "related" });
    entries.push({ from: "security_terrorism", to: "security_extremism", type: "related" });
    document.entries = entries;
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

    const result = validateBlueprints(root);
    assert.equal(result.valid, false);
    assert.equal(result.issues.some((issue) => issue.code === "relationships.cycle"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  testValidation();
  testDeterministicHash();
  testVersionValidation();
  testDuplicateIds();
  testMissingReferences();
  testCircularRelationships();
  console.log("All blueprint tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
