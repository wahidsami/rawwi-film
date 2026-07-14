import assert from "node:assert/strict";

import { createEmptyGcamKnowledgeRegistry } from "../registries/gcamKnowledgeRegistry.js";
import { computeGcamKnowledgeCoverageReport } from "../coverage/gcamKnowledgeCoverage.js";
import { renderGcamKnowledgeCoverageReport } from "../renderers/gcamKnowledgeRenderer.js";
import { serializeGcamKnowledgeDocument } from "../schemas/gcamKnowledgeSchema.js";

const registry = createEmptyGcamKnowledgeRegistry();

assert.equal(registry.catalog.articles.length, 0);
assert.equal(registry.catalog.atoms.length, 0);
assert.equal(registry.catalog.reviewerExamples.length, 0);
assert.equal(registry.validation.valid, true);
assert.equal(registry.validation.issues.length, 0);

const coverageA = computeGcamKnowledgeCoverageReport(registry.catalog, "EMPTY", []);
const coverageB = computeGcamKnowledgeCoverageReport(registry.catalog, "EMPTY", []);

assert.equal(coverageA.hash, coverageB.hash);
assert.equal(coverageA.validationStatus, "EMPTY");
assert.equal(coverageA.readyForGcamImport, true);

const rendered = renderGcamKnowledgeCoverageReport(coverageA);
assert.equal(rendered.includes("GCAM Knowledge Acquisition Infrastructure"), true);
assert.equal(rendered.includes("Ready For GCAM Import: YES"), true);

const exported = registry.exportDocument();
const serializedA = serializeGcamKnowledgeDocument(exported);
const serializedB = serializeGcamKnowledgeDocument(exported);
assert.equal(serializedA, serializedB);

console.log(rendered);
console.log("GCAM knowledge infrastructure tests passed.");

