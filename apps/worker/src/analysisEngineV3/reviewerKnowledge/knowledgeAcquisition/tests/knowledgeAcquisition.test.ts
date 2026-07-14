/**
 * Tests for the GCAM Knowledge Acquisition Framework.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/knowledgeAcquisition/tests/knowledgeAcquisition.test.ts
 */
import { strict as assert } from "node:assert";

import { createKnowledgeAcquisitionCoverageReport, renderKnowledgeAcquisitionCoverageReport } from "../coverage/knowledgeAcquisitionCoverage.js";
import { classifyKnowledgeAcquisitionType, extractKnowledgeAcquisitionRecord } from "../extractors/knowledgeAcquisitionExtractor.js";
import { createKnowledgeAssetRegistry } from "../knowledgeAssets/knowledgeAssetRegistry.js";
import { createReviewerCorrectionsRegistry } from "../reviewerCorrections/reviewerCorrectionsRegistry.js";
import { createReviewerDisagreementsRegistry } from "../reviewerDisagreements/reviewerDisagreementsRegistry.js";
import { createReviewerExamplesRegistry } from "../reviewerExamples/reviewerExamplesRegistry.js";
import { createKnowledgeEvolutionRegistry } from "../knowledgeEvolution/knowledgeEvolutionRegistry.js";
import { createReviewerObservationsRegistry } from "../reviewerObservations/reviewerObservationsRegistry.js";
import { createReviewerNotesRegistry } from "../reviewerNotes/reviewerNotesRegistry.js";
import { deriveKnowledgeAcquisitionId, hashKnowledgeAcquisitionValue, normalizeKnowledgeAcquisitionRecord, parseKnowledgeAcquisitionDocument } from "../schema/knowledgeAcquisitionSchema.js";
import { validateKnowledgeAcquisitionRecord, validateKnowledgeAcquisitionRecords } from "../schema/knowledgeAcquisitionValidator.js";
import type { KnowledgeAcquisitionRecord } from "../schema/knowledgeAcquisitionTypes.js";

function makeRecord(overrides: Partial<KnowledgeAcquisitionRecord> = {}): KnowledgeAcquisitionRecord {
  const base: KnowledgeAcquisitionRecord = Object.freeze({
    id: "placeholder",
    version: "1.0.0",
    source: "reviewer_meeting",
    date: "2026-07-14",
    reviewerConfidence: 0.93,
    knowledgeType: "reviewer_observation",
    domain: "security",
    concepts: Object.freeze(["security", "power imbalance"]),
    storyContext: "A discussion about a possible overthrow call in a meeting.",
    evidence: Object.freeze(["The speaker asks for the overthrow call to be understood literally."]),
    reasoning: Object.freeze(["The reference ties to an explicit political call rather than a benign remark."]),
    decision: "Store as a reviewer observation tied to security reasoning.",
    alternativeDecisions: Object.freeze(["Treat it as a generic political comment."]),
    rejectedInterpretations: Object.freeze(["It is unrelated to the security domain."]),
    relatedLessons: Object.freeze(["lesson_004_speaker_identification", "lesson_011_multiple_findings"]),
    relatedPatterns: Object.freeze(["security_pattern_overthrow_call"]),
    relatedDecisionRecords: Object.freeze(["decision_005_overthrow_phrase_neutral"]),
    relatedBenchmarks: Object.freeze(["security-bench-001"]),
    knowledgeDebtReference: "KD-SEC-001",
    futureReviewNotes: Object.freeze(["Re-check when more meeting notes are added."]),
    reviewerId: "reviewer-a",
    reviewerName: "Reviewer A",
    agreementState: "consensus",
    disagreementGroupId: null,
    supersedesId: null,
    supersededById: null,
    relatedRecordIds: Object.freeze([]),
  });

  const merged = Object.freeze({ ...base, ...overrides }) as KnowledgeAcquisitionRecord;
  const normalized = normalizeKnowledgeAcquisitionRecord(merged);
  return Object.freeze({
    ...normalized,
    id: deriveKnowledgeAcquisitionId(normalized),
  });
}

function testExtractionAndHashing(): void {
  const record = makeRecord();
  assert.equal(record.id.length > 0, true);
  assert.equal(hashKnowledgeAcquisitionValue(record).length, 64);
  assert.equal(deriveKnowledgeAcquisitionId(record), record.id);
  assert.equal(classifyKnowledgeAcquisitionType("Reviewer Correction Note"), "reviewer_correction");
  assert.equal(classifyKnowledgeAcquisitionType("Symbolic note"), "reviewer_symbolism_note");
  console.log("✓ extraction, classification, and hashing are deterministic");
}

function testValidation(): void {
  const record = makeRecord();
  const validation = validateKnowledgeAcquisitionRecord(record);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  console.log("✓ a valid knowledge acquisition record passes validation");
}

function testDuplicateIds(): void {
  const record = makeRecord();
  const validation = validateKnowledgeAcquisitionRecords([record, record]);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.code === "id.duplicate"), true);
  console.log("✓ duplicate ids are rejected");
}

function testBrokenReferences(): void {
  const record = makeRecord({
    relatedLessons: Object.freeze(["lesson_missing"]),
    relatedPatterns: Object.freeze(["pattern_missing"]),
    relatedDecisionRecords: Object.freeze(["decision_missing"]),
    relatedBenchmarks: Object.freeze(["benchmark_missing"]),
  });
  const validation = validateKnowledgeAcquisitionRecord(record);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.code === "relatedLessons.invalid"), true);
  assert.equal(validation.issues.some((issue) => issue.code === "relatedPatterns.invalid"), true);
  assert.equal(validation.issues.some((issue) => issue.code === "relatedDecisionRecords.invalid"), true);
  assert.equal(validation.issues.some((issue) => issue.code === "relatedBenchmarks.invalid"), true);
  console.log("✓ broken references are rejected");
}

function testRegistryAndSearch(): void {
  const observation = makeRecord();
  const correction = makeRecord({
    id: "placeholder",
    knowledgeType: "reviewer_correction",
    decision: "Correction note about the prior observation.",
    concepts: Object.freeze(["security"]),
    relatedLessons: Object.freeze(["lesson_012_evidence_prioritization"]),
    relatedPatterns: Object.freeze(["security_pattern_terrorism_glorification"]),
    relatedDecisionRecords: Object.freeze(["decision_006_terrorism_glorification_direct"]),
    relatedBenchmarks: Object.freeze(["security-bench-002"]),
    supersedesId: observation.id,
    disagreementGroupId: "meeting-1",
    agreementState: "consensus",
  });
  const disagreement = makeRecord({
    id: "placeholder",
    knowledgeType: "reviewer_disagreement",
    decision: "Disagreement about the observation.",
    concepts: Object.freeze(["security", "interpretation"]),
    relatedLessons: Object.freeze(["lesson_012_evidence_prioritization"]),
    relatedPatterns: Object.freeze(["security_pattern_overthrow_call"]),
    relatedDecisionRecords: Object.freeze(["decision_007_terrorism_glorification_quoted"]),
    relatedBenchmarks: Object.freeze(["security-bench-003"]),
    supersedesId: observation.id,
    disagreementGroupId: "meeting-1",
    agreementState: "disagreement",
  });

  const registry = createKnowledgeAssetRegistry([observation, correction, disagreement]);
  assert.equal(registry.list().length, 3);
  assert.equal(registry.get(observation.id)?.id, observation.id);
  assert.equal(registry.search({ concept: "security" }).length >= 3, true);
  assert.equal(registry.search({ lesson: "lesson_012_evidence_prioritization" }).length >= 1, true);

  const notesRegistry = createReviewerNotesRegistry([observation, correction, disagreement]);
  const observationsRegistry = createReviewerObservationsRegistry([observation, correction, disagreement]);
  const correctionsRegistry = createReviewerCorrectionsRegistry([observation, correction, disagreement]);
  const disagreementsRegistry = createReviewerDisagreementsRegistry([observation, correction, disagreement]);
  const examplesRegistry = createReviewerExamplesRegistry([observation, correction, disagreement]);
  const evolutionRegistry = createKnowledgeEvolutionRegistry([observation, correction, disagreement]);

  assert.equal(notesRegistry.list().length, 0);
  assert.equal(observationsRegistry.list().length, 1);
  assert.equal(correctionsRegistry.list().length, 1);
  assert.equal(disagreementsRegistry.list().length, 1);
  assert.equal(examplesRegistry.list().length, 0);
  assert.equal(evolutionRegistry.list().length, 3);
  console.log("✓ category registries remain deterministic");
}

function testBundleParsing(): void {
  const record = makeRecord();
  const parsed = parseKnowledgeAcquisitionDocument(record);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.id, record.id);
  console.log("✓ raw record parsing works deterministically");
}

function testCoverageReport(): void {
  const records = [makeRecord(), makeRecord({
    id: "placeholder",
    knowledgeType: "reviewer_comment",
    source: "internal_note",
    decision: "Another stable note for the acquisition framework.",
    concepts: Object.freeze(["security", "narrative"]),
    relatedLessons: Object.freeze(["lesson_004_speaker_identification"]),
    relatedPatterns: Object.freeze(["security_pattern_overthrow_call"]),
    relatedDecisionRecords: Object.freeze(["decision_007_terrorism_glorification_quoted"]),
    relatedBenchmarks: Object.freeze(["security-bench-003"]),
    knowledgeDebtReference: "KD-SEC-002",
    reviewerId: "reviewer-b",
    reviewerName: "Reviewer B",
  })];

  const coverage = createKnowledgeAcquisitionCoverageReport(records);
  assert.equal(coverage.readyForAcademy, true);
  assert.equal(coverage.coveragePercent, 100);
  assert.equal(coverage.hash.length, 64);
  const rendered = renderKnowledgeAcquisitionCoverageReport(coverage);
  assert.equal(rendered, renderKnowledgeAcquisitionCoverageReport(coverage));
  assert.equal(rendered.includes("GCAM Knowledge Acquisition Framework"), true);
  console.log("✓ coverage report is deterministic");
}

async function main(): Promise<void> {
  testExtractionAndHashing();
  testValidation();
  testDuplicateIds();
  testBrokenReferences();
  testRegistryAndSearch();
  testBundleParsing();
  testCoverageReport();
  console.log("\nAll GCAM knowledge acquisition tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
