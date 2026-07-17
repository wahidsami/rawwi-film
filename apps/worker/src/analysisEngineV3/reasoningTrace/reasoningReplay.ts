import { buildV3InspectionTimeline, loadV3InspectionTimelineByJobId } from "../inspection/inspectionLoader.js";
import type { V3InspectionRecord, V3InspectionTimeline } from "../inspection/inspectionTypes.js";
import type { V3ReasoningReplay, V3ReasoningReplayFirstIncorrectDecision, V3ReasoningTraceFinding, V3ReasoningTraceStage, V3ReasoningTraceTimelineEntry } from "./reasoningTypes.js";

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeStageName(stageName: string): V3ReasoningTraceStage["stage"] {
  const normalized = stageName.toLowerCase();
  if (normalized === "semantic_generation") return "scene";
  if (normalized === "knowledge_matching") return "reviewer_candidates";
  if (normalized === "legal_review") return "provider_response";
  if (normalized === "finding_mapper") return "validator_decisions";
  if (normalized === "persistence") return "final_finding";
  if (normalized === "aggregation") return "final_finding";
  if (normalized === "final_report") return "final_finding";
  if (normalized === "reviewer_debate") return "reviewer_selection";
  if (normalized === "arbitration") return "article_selection";
  if (normalized === "explanation") return "final_finding";
  return "final_finding";
}

function buildStagePayload(record: V3InspectionRecord): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...record.payloadJson,
  });
}

function inferFirstIncorrectDecision(records: readonly V3InspectionRecord[]): V3ReasoningReplayFirstIncorrectDecision | null {
  for (const record of records) {
    const payload = asRecord(record.payloadJson);
    const stageName = normalizeStageName(record.stageName);

    if (record.stageName === "legal_review") {
      const status = String(payload.status ?? "");
      if (status === "reject" || Number(payload.rejected_count ?? 0) > 0) {
        return Object.freeze({
          stage: stageName,
          reason: String(payload.reason ?? "Legal review rejected the candidate."),
          payload,
        });
      }
    }

    if (record.stageName === "finding_mapper") {
      if (Number(payload.dropped_count ?? 0) > 0 || (Array.isArray(payload.output_findings) && payload.output_findings.length === 0)) {
        return Object.freeze({
          stage: stageName,
          reason: "Finding mapper dropped the decision or returned no findings.",
          payload,
        });
      }
    }

    if (record.stageName === "persistence") {
      if (Number(payload.rows_skipped ?? 0) > 0) {
        return Object.freeze({
          stage: stageName,
          reason: "Persistence skipped at least one row.",
          payload,
        });
      }
    }
  }

  return null;
}

function buildReplayFromTimeline(jobId: string, findingId: string, timeline: V3InspectionTimeline): V3ReasoningReplay {
  const findingRecords = timeline.findings.find((finding) => {
    const joinedPayload = finding.records.map((record) => JSON.stringify(record.payloadJson)).join(" | ");
    return finding.findingKey === findingId || joinedPayload.includes(findingId);
  }) ?? timeline.findings[0] ?? null;

  const records = findingRecords?.records ?? [];
  const stages: readonly V3ReasoningTraceStage[] = Object.freeze(
    records.map((record) => Object.freeze({
      stage: normalizeStageName(record.stageName),
      order: record.stageOrder,
      title: record.stageName,
      why: String(asRecord(record.payloadJson).reason ?? asRecord(record.payloadJson).routing_reason ?? asRecord(record.payloadJson).decision_reason ?? "Replay stage."),
      inputCount: null,
      outputCount: null,
      payload: buildStagePayload(record),
    })),
  );
  const timelineEntries: readonly V3ReasoningTraceTimelineEntry[] = Object.freeze(
    records.map((record) => Object.freeze({
      stage: normalizeStageName(record.stageName),
      order: record.stageOrder,
      durationMs: null,
      note: String(asRecord(record.payloadJson).reason ?? asRecord(record.payloadJson).scope_reason ?? asRecord(record.payloadJson).decision_reason ?? "Replay stage."),
    })),
  );

  return Object.freeze({
    jobId,
    findingId,
    findingKey: findingRecords?.findingKey ?? findingId,
    timeline: timelineEntries,
    stages,
    firstIncorrectDecision: inferFirstIncorrectDecision(records),
    trace: null,
  });
}

export async function loadV3ReasoningReplayByJobIdAndFindingId(jobId: string, findingId: string): Promise<V3ReasoningReplay> {
  const timeline = await loadV3InspectionTimelineByJobId(jobId);
  return buildReplayFromTimeline(jobId, findingId, timeline);
}

export function buildV3ReasoningReplayFromInspectionRecords(jobId: string, findingId: string, records: readonly V3InspectionRecord[]): V3ReasoningReplay {
  const timeline = buildV3InspectionTimeline(jobId, records);
  return buildReplayFromTimeline(jobId, findingId, timeline);
}

