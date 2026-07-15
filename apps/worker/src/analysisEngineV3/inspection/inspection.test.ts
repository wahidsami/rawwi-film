/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/inspection/inspection.test.ts
 */
import { strict as assert } from "node:assert";
import { createV3InspectionRecorder } from "./inspectionRecorder.js";
import { buildV3InspectionTimeline, groupV3InspectionRecords, sortV3InspectionRecords } from "./inspectionLoader.js";
import { renderV3InspectionTimeline } from "./inspectionRenderer.js";
import type { V3InspectionRecord } from "./inspectionTypes.js";
import {
  buildV3AggregationInspectionRecord,
  buildV3FinalReportInspectionRecord,
  buildV3LegalReviewInspectionRecord,
  buildV3SemanticGenerationInspectionRecord,
} from "./inspectionStageBuilders.js";

function buildRecord(input: Partial<V3InspectionRecord> & Pick<V3InspectionRecord, "findingKey" | "stageOrder" | "stageName" | "jobId" | "chunkId" | "payloadJson" | "createdAt">): V3InspectionRecord {
  return Object.freeze({
    id: input.id,
    jobId: input.jobId,
    chunkId: input.chunkId,
    findingKey: input.findingKey,
    stageOrder: input.stageOrder,
    stageName: input.stageName,
    payloadJson: Object.freeze(input.payloadJson),
    createdAt: input.createdAt,
  });
}

async function testRecorderDisabledIsNoOp(): Promise<void> {
  let called = 0;
  const recorder = createV3InspectionRecorder({
    enabled: false,
    persist: async () => {
      called += 1;
    },
    now: () => "2026-01-01T00:00:00.000Z",
  });

  await recorder.recordStages([
    {
      jobId: "job-1",
      chunkId: "chunk-1",
      findingKey: "finding-1",
      stageOrder: 1,
      stageName: "semantic_generation",
      payloadJson: { ok: true },
    },
  ]);

  assert.equal(called, 0);
}

async function testRecorderEnabledPersistsRecords(): Promise<void> {
  let persisted: readonly V3InspectionRecord[] = [];
  const recorder = createV3InspectionRecorder({
    enabled: true,
    persist: async (records) => {
      persisted = records;
    },
    now: () => "2026-01-01T00:00:00.000Z",
  });

  await recorder.recordStage({
    jobId: "job-1",
    chunkId: null,
    findingKey: "finding-1",
    stageOrder: 2,
    stageName: "knowledge_matching",
    payloadJson: { nested: { value: 1 } },
  });

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(persisted[0]?.stageName, "knowledge_matching");
}

function testOrderingAndRendering(): void {
  const records = [
    buildRecord({
      jobId: "job-1",
      chunkId: "chunk-1",
      findingKey: "finding-b",
      stageOrder: 2,
      stageName: "knowledge_matching",
      payloadJson: { b: 2 },
      createdAt: "2026-01-01T00:00:02.000Z",
    }),
    buildRecord({
      jobId: "job-1",
      chunkId: "chunk-1",
      findingKey: "finding-a",
      stageOrder: 1,
      stageName: "semantic_generation",
      payloadJson: { a: 1 },
      createdAt: "2026-01-01T00:00:01.000Z",
    }),
  ] as const;

  const ordered = sortV3InspectionRecords(records);
  assert.equal(ordered[0]?.findingKey, "finding-a");
  assert.equal(ordered[1]?.findingKey, "finding-b");

  const timeline = buildV3InspectionTimeline("job-1", records);
  assert.equal(timeline.records.length, 2);
  assert.equal(groupV3InspectionRecords(records).length, 2);

  const rendered = renderV3InspectionTimeline(timeline);
  assert(rendered.includes("V3 Inspection Timeline"));
  assert(rendered.includes("finding-a"));
  assert(rendered.includes("semantic_generation"));
}

async function testStageBuildersHandleZeroCounts(): Promise<void> {
  const semanticRecord = buildV3SemanticGenerationInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: "chunk-zero",
      findingKey: "job:job-zero:chunk:chunk-zero",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    provider: "openai",
    model: "gpt-4.1",
    promptHash: "prompt",
    semanticHash: "semantic",
    semanticOutput: {},
    semanticConfidence: 0,
    concepts: [],
    entities: [],
    sceneInformation: {},
    candidateCount: 0,
    candidates: [],
    stageTimings: [],
  });

  const legalRecord = buildV3LegalReviewInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: "chunk-zero",
      findingKey: "job:job-zero:chunk:chunk-zero",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    moduleId: "profanity",
    moduleTitle: "Profanity",
    status: "reject",
    reason: "no findings",
    confidence: 0,
    articleIds: [],
    finding: null,
    exceptions: [],
    trace: [],
    candidateCount: 0,
    acceptedCount: 0,
    rejectedCount: 1,
    needsReviewCount: 0,
  });

  const aggregationRecord = buildV3AggregationInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: null,
      findingKey: "job:job-zero:summary",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    canonicalFindings: [],
    findingsCount: 0,
    reportHintsCount: 0,
    severityCounts: { low: 0, medium: 0, high: 0, critical: 0 },
    reportOverview: null,
  });

  const finalReportRecord = buildV3FinalReportInspectionRecord({
    base: {
      jobId: "job-zero",
      chunkId: null,
      findingKey: "job:job-zero:summary",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    analysisEngine: "v3",
    pipelineVersion: "v2",
    finalFindingCount: 0,
    observationCount: 0,
    reportStatus: "completed",
    jobStatus: "completed",
    reportSummary: {},
    reportHtml: "<html />",
  });

  assert.equal(semanticRecord.payloadJson.semantic_candidate_count, 0);
  assert.equal((semanticRecord.payloadJson.semantic_candidates as readonly unknown[]).length, 0);
  assert.equal(legalRecord.payloadJson.accepted_count, 0);
  assert.equal(legalRecord.payloadJson.rejected_count, 1);
  assert.equal(aggregationRecord.payloadJson.clustered_findings, 0);
  assert.equal(aggregationRecord.payloadJson.report_findings, 0);
  assert.equal(finalReportRecord.payloadJson.final_finding_count, 0);
  assert.equal(finalReportRecord.payloadJson.observation_count, 0);

  const recorder = createV3InspectionRecorder({
    enabled: true,
    persist: async (records) => {
      assert.equal(records.length, 4);
    },
    now: () => "2026-01-01T00:00:00.000Z",
  });

  await recorder.recordStages([semanticRecord, legalRecord, aggregationRecord, finalReportRecord]);
}

async function main(): Promise<void> {
  await testRecorderDisabledIsNoOp();
  await testRecorderEnabledPersistsRecords();
  testOrderingAndRendering();
  await testStageBuildersHandleZeroCounts();
  console.log("✓ V3 inspection recorder, loader, and renderer behave correctly");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
