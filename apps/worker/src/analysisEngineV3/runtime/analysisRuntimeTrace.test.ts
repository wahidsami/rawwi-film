import assert from "node:assert/strict";

import { buildV3InspectionTimeline } from "../inspection/inspectionLoader.js";
import type { V3InspectionRecord } from "../inspection/inspectionTypes.js";
import { buildV3AnalysisRuntimeTrace } from "./analysisRuntimeTrace.js";

function buildRecord(input: Omit<V3InspectionRecord, "payloadJson"> & { payloadJson: Record<string, unknown> }): V3InspectionRecord {
  return Object.freeze({
    id: input.id,
    jobId: input.jobId,
    chunkId: input.chunkId,
    findingKey: input.findingKey,
    stageOrder: input.stageOrder,
    stageName: input.stageName,
    payloadJson: Object.freeze({ ...input.payloadJson }),
    createdAt: input.createdAt,
  });
}

const records = [
  buildRecord({
    jobId: "job-1",
    chunkId: "chunk-1",
    findingKey: "job-1::chunk-1",
    stageOrder: 1,
    stageName: "semantic_generation",
    payloadJson: {
      semantic_candidate_count: 2,
      stage_duration_ms: 12,
    },
    createdAt: "2026-07-18T00:00:00.000Z",
  }),
  buildRecord({
    jobId: "job-1",
    chunkId: "chunk-1",
    findingKey: "job-1::chunk-1",
    stageOrder: 2,
    stageName: "knowledge_matching",
    payloadJson: {
      selected_reviewers: ["Profanity"],
      rejected_reviewers: ["Religion"],
      loaded_academy_count: 1,
      skipped_academy_count: 1,
      knowledge_reduction_percent: 50,
      routing_confidence: 0.91,
      routing_reason: "Profanity evidence matched the reviewer scope.",
    },
    createdAt: "2026-07-18T00:00:01.000Z",
  }),
  buildRecord({
    jobId: "job-1",
    chunkId: "chunk-1",
    findingKey: "job-1::chunk-1",
    stageOrder: 3,
    stageName: "legal_review",
    payloadJson: {
      status: "reject",
      reason: "Evidence is condemnatory and therefore exempt.",
      confidence: 0.74,
      article_ids: [8],
      grounding_validation: { valid: true, issues: [] },
      scope_validation: { valid: true, rejectedFindingsByScopeCount: 0 },
      accepted_count: 0,
      rejected_count: 1,
      needs_review_count: 0,
    },
    createdAt: "2026-07-18T00:00:02.000Z",
  }),
  buildRecord({
    jobId: "job-1",
    chunkId: "chunk-1",
    findingKey: "job-1::chunk-1",
    stageOrder: 4,
    stageName: "finding_mapper",
    payloadJson: {
      mapped_count: 1,
      dropped_count: 0,
      title: "UNMAPPED",
      description: "No official GCAM mapping exists.",
    },
    createdAt: "2026-07-18T00:00:03.000Z",
  }),
  buildRecord({
    jobId: "job-1",
    chunkId: "chunk-1",
    findingKey: "job-1::chunk-1",
    stageOrder: 5,
    stageName: "persistence",
    payloadJson: {
      findings_attempted: 1,
      rows_inserted: 1,
      rows_skipped: 0,
    },
    createdAt: "2026-07-18T00:00:04.000Z",
  }),
  buildRecord({
    jobId: "job-1",
    chunkId: null,
    findingKey: "job-1",
    stageOrder: 7,
    stageName: "final_report",
    payloadJson: {
      final_finding_count: 1,
      report_status: "completed",
      job_status: "completed",
      report_summary: { findings_count: 1 },
      report_html: "<p>report</p>",
    },
    createdAt: "2026-07-18T00:00:05.000Z",
  }),
] satisfies readonly V3InspectionRecord[];

const timeline = buildV3InspectionTimeline("job-1", records);
const trace = buildV3AnalysisRuntimeTrace({
  jobId: "job-1",
  timeline,
  reportSummary: { totals: { findings_count: 1 } },
  reportHtml: "<p>report</p>",
  reportId: "report-1",
});

assert.equal(trace.jobId, "job-1");
assert.equal(trace.routerTrace.length, 1);
assert.equal(trace.providerTrace.length, 1);
assert.equal(trace.runtimeAdapterTrace.length, 1);
assert.equal(trace.findingMapperTrace.length, 1);
assert.equal(trace.persistenceTrace.length > 0, true);
assert.equal(trace.firstDivergence?.stage, "provider_response");
assert.equal((trace.traceJson.summary as { totalFindings?: number }).totalFindings, 2);
assert.equal(trace.traceHtml.includes("V3 Analysis Trace"), true);

console.log("✓ V3 analysis runtime trace builder captures a full job-level trace");
