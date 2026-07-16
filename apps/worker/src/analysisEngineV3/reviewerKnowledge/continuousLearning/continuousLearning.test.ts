/**
 * Tests for the V3 Continuous Learning framework.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/continuousLearning/continuousLearning.test.ts
 */
import { strict as assert } from "node:assert";

import { createContinuousLearningCoverageReport, renderContinuousLearningCoverageReport } from "./continuousLearningCoverage.js";
import { createContinuousLearningRegistry, createDefaultContinuousLearningRegistry } from "./continuousLearningRegistry.js";
import { deriveContinuousLearningRecordId, normalizeContinuousLearningRecord } from "./continuousLearningRegistry.js";
import type { ContinuousLearningRecord } from "./continuousLearningTypes.js";

function makeRecord(overrides: Partial<ContinuousLearningRecord> = {}): ContinuousLearningRecord {
  const base: ContinuousLearningRecord = Object.freeze({
    id: "placeholder",
    version: "1.0.0",
    source: "production_analysis",
    date: "2026-07-15",
    signalKind: "false_positive",
    domain: "religion",
    concepts: Object.freeze(["religion", "false positive"]),
    evidence: Object.freeze(["A cautious rejection was approved after review."]),
    reasoning: Object.freeze(["The reviewer adjusted the decision based on corrected precedent."]),
    decision: "Record the correction and teach the reviewer.",
    confidence: 0.94,
    artifacts: Object.freeze({
      lessons: Object.freeze([
        Object.freeze({
          id: "lesson_cl_001",
          version: "1.0.0",
          title: "Teach from correction",
          description: "Convert board and GCAM corrections into reusable guidance.",
          confidence: 0.95,
          sourceIds: Object.freeze(["board_correction_001"]),
        }),
      ]),
      cases: Object.freeze([
        Object.freeze({
          id: "case_cl_001",
          version: "1.0.0",
          title: "Approved finding case",
          description: "A corrected approved finding with supporting evidence.",
          confidence: 0.9,
          sourceIds: Object.freeze(["approved_finding_001"]),
        }),
      ]),
      patterns: Object.freeze([
        Object.freeze({
          id: "pattern_cl_001",
          version: "1.0.0",
          title: "False positive suppression",
          description: "Avoid repeating the same false positive after override.",
          confidence: 0.92,
          sourceIds: Object.freeze(["false_positive_001"]),
        }),
      ]),
      knowledgeUpdates: Object.freeze([
        Object.freeze({
          id: "ku_cl_001",
          version: "1.0.0",
          title: "Knowledge update for corrected finding",
          description: "Update reviewer memory after correction.",
          confidence: 0.93,
          sourceIds: Object.freeze(["gcam_correction_001"]),
        }),
      ]),
      decisionMemories: Object.freeze([
        Object.freeze({
          id: "dm_cl_001",
          version: "1.0.0",
          title: "Decision memory for rejected finding",
          description: "Store the reason the finding was rejected.",
          confidence: 0.91,
          sourceIds: Object.freeze(["rejected_finding_001"]),
        }),
      ]),
      reviewerImprovements: Object.freeze([
        Object.freeze({
          id: "ri_cl_001",
          version: "1.0.0",
          title: "Reviewer improvement",
          description: "Strengthen false negative detection in future reviews.",
          confidence: 0.89,
          sourceIds: Object.freeze(["human_override_001"]),
        }),
      ]),
    }),
    knowledgeAcquisitionRecordIds: Object.freeze(["ka_reviewed_script_religion_001"]),
    reviewerId: "reviewer-a",
    reviewerName: "Reviewer A",
    agreementState: "consensus",
    disagreementGroupId: null,
    supersedesId: null,
    supersededById: null,
    relatedRecordIds: Object.freeze([]),
  });

  const merged = Object.freeze({ ...base, ...overrides }) as ContinuousLearningRecord;
  const normalized = normalizeContinuousLearningRecord(merged);
  return Object.freeze({
    ...normalized,
    id: deriveContinuousLearningRecordId(normalized),
  });
}

function testNormalizationAndRegistry(): void {
  const record = makeRecord();
  assert.equal(record.id.length > 0, true);
  assert.equal(record.artifacts.lessons[0]?.id.length > 0, true);
  assert.equal(createDefaultContinuousLearningRegistry().records.length, 0);

  const registry = createContinuousLearningRegistry([record]);
  assert.equal(registry.records.length, 1);
  assert.equal(registry.validation.valid, true);
  assert.equal(registry.get(record.id)?.id, record.id);
  assert.equal(registry.search({ signalKind: "false_positive" }).length, 1);
  assert.equal(registry.search({ concept: "religion" }).length, 1);
  assert.equal(registry.search({ lesson: "teach from correction" }).length, 1);
  assert.equal(registry.search({ case: "approved finding case" }).length, 1);
  assert.equal(registry.search({ pattern: "false positive suppression" }).length, 1);
  assert.equal(registry.search({ decisionMemory: "decision memory for rejected finding" }).length, 1);
  assert.equal(registry.search({ reviewerImprovement: "Reviewer improvement" }).length, 1);
  console.log("✓ continuous learning registry is deterministic");
}

function testRegisterAndCoverage(): void {
  const registry = createContinuousLearningRegistry([makeRecord()]);
  const second = makeRecord({
    id: "placeholder-2",
    version: "1.0.1",
    signalKind: "new_precedent",
    domain: "security",
    concepts: Object.freeze(["security", "precedent"]),
    decision: "Store the new precedent and improve reviewer memory.",
    knowledgeAcquisitionRecordIds: Object.freeze(["ka_new_precedent_security_002"]),
    reviewerId: "reviewer-b",
    reviewerName: "Reviewer B",
    disagreementGroupId: "group-1",
  });
  registry.register(second);
  assert.equal(registry.records.length, 2);
  assert.equal(registry.validation.valid, true);

  const coverage = createContinuousLearningCoverageReport(registry);
  assert.equal(coverage.readyForLearning, true);
  assert.equal(coverage.coveragePercent, 100);
  assert.equal(coverage.lessonCount > 0, true);
  assert.equal(coverage.caseCount > 0, true);
  assert.equal(coverage.patternCount > 0, true);
  assert.equal(coverage.knowledgeUpdateCount > 0, true);
  assert.equal(coverage.decisionMemoryCount > 0, true);
  assert.equal(coverage.reviewerImprovementCount > 0, true);
  const rendered = renderContinuousLearningCoverageReport(coverage);
  assert.equal(rendered, renderContinuousLearningCoverageReport(coverage));
  assert.equal(rendered.includes("GCAM Continuous Learning Framework"), true);
  assert.equal(rendered.includes("Ready For Learning: YES"), true);
  console.log("✓ continuous learning coverage is deterministic");
}

function testNormalizationIsDeterministic(): void {
  const record = makeRecord();
  const normalizedA = normalizeContinuousLearningRecord(record);
  const normalizedB = normalizeContinuousLearningRecord(record);
  assert.equal(JSON.stringify(normalizedA), JSON.stringify(normalizedB));
  assert.equal(normalizedA.id, normalizedB.id);
  console.log("✓ continuous learning normalization is deterministic");
}

async function main(): Promise<void> {
  testNormalizationIsDeterministic();
  testNormalizationAndRegistry();
  testRegisterAndCoverage();
  console.log("\nAll continuous learning tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
