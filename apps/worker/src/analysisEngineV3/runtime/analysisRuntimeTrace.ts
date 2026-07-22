import { supabase } from "../../db.js";
import { logger } from "../../logger.js";
import { recordRuntimeDiagnosticArtifact, shouldPersistDeveloperDiagnostic } from "../../diagnosticPersistence.js";
import type { V3InspectionRecord, V3InspectionTimeline, V3InspectionTimelineFinding } from "../inspection/inspectionTypes.js";
import { buildV3ReasoningReplayFromInspectionRecords } from "../reasoningTrace/reasoningReplay.js";

type TraceStageName =
  | "router"
  | "provider"
  | "runtime_adapter"
  | "reviewer_scope_validator"
  | "finding_mapper"
  | "persistence"
  | "report_builder"
  | "api_payload";

type TraceFindingSection = Readonly<{
  findingKey: string;
  chunkId: string | null;
  stageOrder: number | null;
  inputCount: number | null;
  outputCount: number | null;
  rejectionCount: number | null;
  elapsedMs: number | null;
  reason: string | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type V3AnalysisRuntimeTrace = Readonly<{
  jobId: string;
  createdAt: string;
  firstDivergence: Readonly<Record<string, unknown>> | null;
  routerTrace: readonly TraceFindingSection[];
  providerTrace: readonly TraceFindingSection[];
  runtimeAdapterTrace: readonly TraceFindingSection[];
  reviewerScopeTrace: readonly TraceFindingSection[];
  findingMapperTrace: readonly TraceFindingSection[];
  persistenceTrace: readonly TraceFindingSection[];
  reportBuilderTrace: Readonly<Record<string, unknown>>;
  apiPayloadTrace: Readonly<Record<string, unknown>>;
  traceJson: Readonly<Record<string, unknown>>;
  traceHtml: string;
}>;

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stagePayload(records: readonly V3InspectionRecord[], stageName: string): Readonly<Record<string, unknown>> | null {
  const record = records.find((item) => item.stageName === stageName);
  return record ? Object.freeze({ ...record.payloadJson }) : null;
}

function buildSection(
  finding: V3InspectionTimelineFinding,
  stageName: string,
  stageOrder: number,
  inputCount: number | null,
  outputCount: number | null,
  rejectionCount: number | null,
  payload: Readonly<Record<string, unknown>> | null,
): TraceFindingSection {
  const body = payload ?? Object.freeze({});
  return Object.freeze({
    findingKey: finding.findingKey,
    chunkId: finding.records[0]?.chunkId ?? null,
    stageOrder,
    inputCount,
    outputCount,
    rejectionCount,
    elapsedMs: numberOrNull((asRecord(body).stage_duration_ms ?? asRecord(body).duration_ms) as unknown),
    reason: stringOrNull((asRecord(body).reason ?? asRecord(body).routing_reason ?? asRecord(body).decision_reason) as unknown),
    payload: Object.freeze({
      stage: stageName,
      ...body,
    }),
  });
}

function buildHtml(trace: Readonly<{
  jobId: string;
  createdAt: string;
  firstDivergence: Readonly<Record<string, unknown>> | null;
  traceJson: Readonly<Record<string, unknown>>;
}>): string {
  const payload = JSON.stringify(trace.traceJson, null, 2);
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "<title>V3 Analysis Trace</title>",
    "<style>",
    "body{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;background:#0b1020;color:#e5e7eb;padding:24px;line-height:1.5}",
    "h1,h2,h3{color:#f8fafc}",
    "pre{white-space:pre-wrap;word-break:break-word;background:#111827;border:1px solid #334155;border-radius:12px;padding:16px;overflow:auto}",
    ".meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px}",
    ".card{background:#111827;border:1px solid #334155;border-radius:12px;padding:12px}",
    ".label{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.08em}",
    ".value{color:#e5e7eb;font-weight:600;word-break:break-word}",
    "</style>",
    "</head>",
    "<body>",
    "<h1>V3 Analysis Trace</h1>",
    `<div class=\"meta\">`,
    `<div class=\"card\"><div class=\"label\">Job</div><div class=\"value\">${trace.jobId}</div></div>`,
    `<div class=\"card\"><div class=\"label\">Created</div><div class=\"value\">${trace.createdAt}</div></div>`,
    `<div class=\"card\"><div class=\"label\">First Divergence</div><div class=\"value\">${trace.firstDivergence ? "Yes" : "No"}</div></div>`,
    `<div class=\"card\"><div class=\"label\">Findings</div><div class=\"value\">${(asRecord(trace.traceJson).summary as Record<string, unknown> | undefined)?.totalFindings ?? "n/a"}</div></div>`,
    `</div>`,
    "<h2>Trace JSON</h2>",
    `<pre>${payload.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char] ?? char))}</pre>`,
    "</body>",
    "</html>",
  ].join("\n");
}

function reportFindingsCount(reportSummary: Readonly<Record<string, unknown>> | null): number {
  if (!reportSummary) return 0;
  const candidates = [
    reportSummary.findings_count,
    asRecord(reportSummary.totals ?? null).findings_count,
    asRecord(reportSummary.report_overview ?? null).final_findings_count,
    asRecord(reportSummary.report_overview ?? null).findings_count,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return 0;
}

function buildStageSections(
  timeline: V3InspectionTimeline,
  reportSummary: Readonly<Record<string, unknown>> | null,
): Readonly<{
  router: readonly TraceFindingSection[];
  provider: readonly TraceFindingSection[];
  runtimeAdapter: readonly TraceFindingSection[];
  reviewerScope: readonly TraceFindingSection[];
  findingMapper: readonly TraceFindingSection[];
  persistence: readonly TraceFindingSection[];
  reportBuilder: readonly TraceFindingSection[];
  apiPayload: readonly TraceFindingSection[];
  reportBuilderSummary: Readonly<Record<string, unknown>>;
}> {
  const router: TraceFindingSection[] = [];
  const provider: TraceFindingSection[] = [];
  const runtimeAdapter: TraceFindingSection[] = [];
  const reviewerScope: TraceFindingSection[] = [];
  const findingMapper: TraceFindingSection[] = [];
  const persistence: TraceFindingSection[] = [];
  const reportBuilderStages: TraceFindingSection[] = [];
  const apiPayloadStages: TraceFindingSection[] = [];

  for (const finding of timeline.findings) {
    const records = finding.records;
    const semantic = stagePayload(records, "semantic_generation");
    const knowledge = stagePayload(records, "knowledge_matching");
    const legal = stagePayload(records, "legal_review");
    const mapper = stagePayload(records, "finding_mapper");
    const persist = stagePayload(records, "persistence");
    const aggregation = stagePayload(records, "aggregation");
    const finalReport = stagePayload(records, "final_report");

    if (knowledge) {
      const selectedReviewers = Array.isArray(knowledge.selected_reviewers) ? knowledge.selected_reviewers.length : 0;
      const rejectedReviewers = Array.isArray(knowledge.rejected_reviewers) ? knowledge.rejected_reviewers.length : 0;
      router.push(buildSection(finding, "router", 2, selectedReviewers + rejectedReviewers, selectedReviewers, rejectedReviewers, knowledge));
    }

    if (semantic) {
      const candidateCount = numberOrNull(semantic.semantic_candidate_count);
      runtimeAdapter.push(buildSection(finding, "runtime_adapter", 1, candidateCount, candidateCount, 0, semantic));
    }

    if (legal) {
      const acceptedCount = numberOrNull(legal.accepted_count);
      const rejectedCount = numberOrNull(legal.rejected_count);
      const needsReviewCount = numberOrNull(legal.needs_review_count);
      provider.push(buildSection(finding, "provider", 3, acceptedCount ?? 0, acceptedCount ?? 0, rejectedCount ?? 0, legal));
      reviewerScope.push(buildSection(finding, "reviewer_scope_validator", 3, acceptedCount ?? 0, acceptedCount ?? 0, rejectedCount ?? 0, Object.freeze({
        ...legal,
        grounding_validation: asRecord(legal.grounding_validation ?? null),
        scope_validation: asRecord(legal.scope_validation ?? null),
        needs_review_count: needsReviewCount,
      })));
    }

    if (mapper) {
      const mappedCount = numberOrNull(mapper.mapped_count);
      const droppedCount = numberOrNull(mapper.dropped_count);
      findingMapper.push(buildSection(finding, "finding_mapper", 4, mappedCount, mappedCount, droppedCount, mapper));
    }

    if (persist) {
      const inserted = numberOrNull(persist.rows_inserted);
      const skipped = numberOrNull(persist.rows_skipped);
      persistence.push(buildSection(finding, "persistence", 5, numberOrNull(persist.findings_attempted), inserted, skipped, persist));
    }

    if (aggregation || finalReport) {
      const payload = Object.freeze({
        aggregation: aggregation ?? null,
        final_report: finalReport ?? null,
      });
      const reportCount = Math.max(timeline.findings.length, reportFindingsCount(reportSummary));
      reportBuilderStages.push(buildSection(finding, "report_builder", 7, reportCount, reportCount, 0, payload));
      apiPayloadStages.push(buildSection(finding, "api_payload", 8, reportCount, reportCount, 0, finalReport ?? payload));
    }
  }

  const reportBuilderSummary = Object.freeze({
    stage: "report_builder",
    findingsCount: timeline.findings.length,
    findingKeys: timeline.findings.map((finding) => finding.findingKey),
  });

  return Object.freeze({
    router: Object.freeze(router),
    provider: Object.freeze(provider),
    runtimeAdapter: Object.freeze(runtimeAdapter),
    reviewerScope: Object.freeze(reviewerScope),
    findingMapper: Object.freeze(findingMapper),
    persistence: Object.freeze(persistence),
    reportBuilder: Object.freeze(reportBuilderStages),
    apiPayload: Object.freeze(apiPayloadStages),
    reportBuilderSummary,
  });
}

function summarizeStageCount(sections: readonly TraceFindingSection[]): Readonly<{ inputCount: number; outputCount: number; rejectionCount: number }> {
  const inputCount = sections.reduce((sum, section) => sum + (section.inputCount ?? 0), 0);
  const outputCount = sections.reduce((sum, section) => sum + (section.outputCount ?? 0), 0);
  const rejectionCount = sections.reduce((sum, section) => sum + (section.rejectionCount ?? 0), 0);
  return Object.freeze({ inputCount, outputCount, rejectionCount });
}

export function buildV3AnalysisRuntimeTrace(input: Readonly<{
  jobId: string;
  timeline: V3InspectionTimeline;
  reportSummary: Readonly<Record<string, unknown>> | null;
  reportHtml: string | null;
  reportId: string | null;
}>): V3AnalysisRuntimeTrace {
  const sections = buildStageSections(input.timeline, input.reportSummary);
  const firstDivergenceFinding = input.timeline.findings.find((finding) => {
    const replay = buildV3ReasoningReplayFromInspectionRecords(input.jobId, finding.findingKey, finding.records);
    return replay.firstIncorrectDecision !== null;
  }) ?? null;
  const replay = firstDivergenceFinding
    ? buildV3ReasoningReplayFromInspectionRecords(input.jobId, firstDivergenceFinding.findingKey, firstDivergenceFinding.records)
    : null;
  const firstDivergence = replay?.firstIncorrectDecision
    ? Object.freeze({
        findingKey: replay.findingKey,
        ...replay.firstIncorrectDecision,
      })
    : null;

  const traceJson = Object.freeze({
    jobId: input.jobId,
    createdAt: new Date().toISOString(),
    summary: Object.freeze({
      totalFindings: Math.max(input.timeline.findings.length, reportFindingsCount(input.reportSummary)),
      router: summarizeStageCount(sections.router),
      provider: summarizeStageCount(sections.provider),
      runtimeAdapter: summarizeStageCount(sections.runtimeAdapter),
      reviewerScope: summarizeStageCount(sections.reviewerScope),
      findingMapper: summarizeStageCount(sections.findingMapper),
      persistence: summarizeStageCount(sections.persistence),
      reportBuilder: summarizeStageCount(sections.reportBuilder),
      apiPayload: summarizeStageCount(sections.apiPayload),
    }),
    timeline: input.timeline,
    firstDivergence,
    report: {
      reportId: input.reportId,
      reportSummary: input.reportSummary,
      reportHtml: input.reportHtml,
    },
    routerTrace: sections.router,
    providerTrace: sections.provider,
    runtimeAdapterTrace: sections.runtimeAdapter,
    reviewerScopeTrace: sections.reviewerScope,
    findingMapperTrace: sections.findingMapper,
    persistenceTrace: sections.persistence,
    reportBuilderTrace: {
      reportId: input.reportId,
      reportSummary: input.reportSummary,
      reportHtml: input.reportHtml,
      findingCount: Math.max(input.timeline.findings.length, reportFindingsCount(input.reportSummary)),
      stageSummary: sections.reportBuilderSummary,
    },
    apiPayloadTrace: {
      reportId: input.reportId,
      payload: input.reportSummary,
      reportHtml: input.reportHtml,
      stageSummary: sections.apiPayload,
    },
  });

  const trace: V3AnalysisRuntimeTrace = Object.freeze({
    jobId: input.jobId,
    createdAt: String(asRecord(traceJson).createdAt ?? new Date().toISOString()),
    firstDivergence,
    routerTrace: sections.router,
    providerTrace: sections.provider,
    runtimeAdapterTrace: sections.runtimeAdapter,
    reviewerScopeTrace: sections.reviewerScope,
    findingMapperTrace: sections.findingMapper,
    persistenceTrace: sections.persistence,
    reportBuilderTrace: Object.freeze({
      reportId: input.reportId,
      reportSummary: input.reportSummary,
      reportHtml: input.reportHtml,
      findingCount: Math.max(input.timeline.findings.length, reportFindingsCount(input.reportSummary)),
      stageSummary: sections.reportBuilderSummary,
    }),
    apiPayloadTrace: Object.freeze({
      reportId: input.reportId,
      payload: input.reportSummary,
      reportHtml: input.reportHtml,
      stageSummary: sections.apiPayload,
    }),
    traceJson,
    traceHtml: buildHtml(Object.freeze({
      jobId: input.jobId,
      createdAt: String(asRecord(traceJson).createdAt ?? new Date().toISOString()),
      firstDivergence,
      routerTrace: sections.router,
      providerTrace: sections.provider,
      runtimeAdapterTrace: sections.runtimeAdapter,
      reviewerScopeTrace: sections.reviewerScope,
      findingMapperTrace: sections.findingMapper,
      persistenceTrace: sections.persistence,
      reportBuilderTrace: Object.freeze({
        reportId: input.reportId,
        reportSummary: input.reportSummary,
        reportHtml: input.reportHtml,
        findingCount: Math.max(input.timeline.findings.length, reportFindingsCount(input.reportSummary)),
        stageSummary: sections.reportBuilderSummary,
      }),
      apiPayloadTrace: Object.freeze({
        reportId: input.reportId,
        payload: input.reportSummary,
        reportHtml: input.reportHtml,
        stageSummary: sections.apiPayload,
      }),
      traceJson,
    })),
  });

  return trace;
}

export async function persistV3AnalysisRuntimeTrace(input: Readonly<{
  trace: V3AnalysisRuntimeTrace;
}>): Promise<string | null> {
  try {
    recordRuntimeDiagnosticArtifact(input.trace.jobId, {
      tableName: "analysis_runtime_traces",
      operation: "upsert",
      payload: input.trace,
      metadata: {
        report_id: input.trace.reportBuilderTrace.reportId ?? null,
      },
    });

    if (!shouldPersistDeveloperDiagnostic("analysis_runtime_traces")) return null;

    const { data, error } = await supabase
      .from("analysis_runtime_traces")
      .upsert({
        job_id: input.trace.jobId,
        router_trace: input.trace.routerTrace,
        provider_trace: input.trace.providerTrace,
        runtime_adapter_trace: input.trace.runtimeAdapterTrace,
        reviewer_scope_trace: input.trace.reviewerScopeTrace,
        finding_mapper_trace: input.trace.findingMapperTrace,
        persistence_trace: input.trace.persistenceTrace,
        report_builder_trace: input.trace.reportBuilderTrace,
        api_payload_trace: input.trace.apiPayloadTrace,
        first_divergence: input.trace.firstDivergence,
        trace_json: input.trace.traceJson,
        trace_html: input.trace.traceHtml,
      }, { onConflict: "job_id" })
      .select("id")
      .single();

    if (error) {
      logger.warn("V3 analysis runtime trace insert failed", {
        jobId: input.trace.jobId,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
      });
      return null;
    }

    return typeof data?.id === "string" ? data.id : null;
  } catch (error) {
    logger.warn("V3 analysis runtime trace insert failed", {
      jobId: input.trace.jobId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
    return null;
  }
}
