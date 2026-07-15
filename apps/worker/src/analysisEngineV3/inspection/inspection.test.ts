/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/inspection/inspection.test.ts
 */
import { strict as assert } from "node:assert";
import { createV3InspectionRecorder } from "./inspectionRecorder.js";
import { buildV3InspectionTimeline, groupV3InspectionRecords, sortV3InspectionRecords } from "./inspectionLoader.js";
import { renderV3InspectionTimeline } from "./inspectionRenderer.js";
import type { V3InspectionRecord } from "./inspectionTypes.js";

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
      stageName: "semantic_output",
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
    stageName: "intelligence_context",
    payloadJson: { nested: { value: 1 } },
  });

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(persisted[0]?.stageName, "intelligence_context");
}

function testOrderingAndRendering(): void {
  const records = [
    buildRecord({
      jobId: "job-1",
      chunkId: "chunk-1",
      findingKey: "finding-b",
      stageOrder: 2,
      stageName: "intelligence_context",
      payloadJson: { b: 2 },
      createdAt: "2026-01-01T00:00:02.000Z",
    }),
    buildRecord({
      jobId: "job-1",
      chunkId: "chunk-1",
      findingKey: "finding-a",
      stageOrder: 1,
      stageName: "semantic_output",
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
  assert(rendered.includes("semantic_output"));
}

async function main(): Promise<void> {
  await testRecorderDisabledIsNoOp();
  await testRecorderEnabledPersistsRecords();
  testOrderingAndRendering();
  console.log("✓ V3 inspection recorder, loader, and renderer behave correctly");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
