import type { DecisionProvenanceCollection } from "../provenance/decisionProvenanceTypes.js";
import type { VerifiedFindingCollection } from "../judge/qualityJudgeTypes.js";
import type { V3RuntimeFinding } from "../../analysisEngineV3/runtime/runtimeTypes.js";
import { createNodeTruthVerification, type FindingTruth } from "../truthVerification.js";
import { logger } from "../../logger.js";

export type V4AnalysisReportRow = Readonly<{
  sceneId: string;
  jobId: string | null;
  scriptId: string | null;
  versionId: string | null;
  chunkId: string | null;
  findingsCount: number;
  severityCounts: Readonly<{
    low: number;
    medium: number;
    high: number;
    critical: number;
  }>;
  summaryJson: Readonly<Record<string, unknown>>;
  reportHtml: string;
}>;

export type V4ReportAdapterInput = Readonly<{
  sceneId: string;
  jobId: string | null;
  scriptId: string | null;
  versionId: string | null;
  chunkId: string | null;
  findings: readonly V3RuntimeFinding[];
  verifiedFindingCollection: VerifiedFindingCollection | null;
  decisionProvenanceCollection: DecisionProvenanceCollection | null;
  findingTruth?: FindingTruth | null;
}>;

export type V4ReportAdapterResult = Readonly<{
  analysisFindings: readonly V3RuntimeFinding[];
  analysisReport: V4AnalysisReportRow;
  reportDocument: Readonly<{
    sceneId: string;
    jobId: string | null;
    scriptId: string | null;
    versionId: string | null;
    chunkId: string | null;
    analysisFindings: readonly V3RuntimeFinding[];
    analysisReport: V4AnalysisReportRow;
    verifiedFindingReport: VerifiedFindingCollection["report"] | null;
    decisionProvenanceReport: DecisionProvenanceCollection["report"] | null;
    executionTimeMs: number;
  }>;
  truthLayerMeta: Readonly<Record<string, unknown>>;
}>;

function uniqueSortedNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left - right));
}

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => value.trim() !== ""))].sort((left, right) => left.localeCompare(right)));
}

function severityCounts(findings: readonly V3RuntimeFinding[]): Readonly<{
  low: number;
  medium: number;
  high: number;
  critical: number;
}> {
  const counts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const finding of findings) {
    const severity = String(finding.severity ?? "").toLowerCase();
    if (severity === "low" || severity === "medium" || severity === "high" || severity === "critical") {
      counts[severity]++;
    }
  }
  return Object.freeze(counts);
}

function renderReportHtml(input: V4ReportAdapterResult["reportDocument"]): string {
  const findingItems = input.analysisFindings
    .map((finding) => `<li><strong>${finding.title_ar}</strong> | article ${finding.article_id} | atom ${finding.atom_id ?? "n/a"} | ${finding.severity}</li>`)
    .join("");

  const provenanceSummary = input.decisionProvenanceReport
    ? `<p>Provenance: ${input.decisionProvenanceReport.totalFindings} findings, ${input.decisionProvenanceReport.graphNodeCount} nodes, ${input.decisionProvenanceReport.graphEdgeCount} edges.</p>`
    : "<p>Provenance: unavailable.</p>";

  return [
    "<section class=\"v4-report\">",
    `<h1>V4 Analysis Report</h1>`,
    `<p>Scene: ${input.sceneId}</p>`,
    `<p>Job: ${input.jobId ?? "n/a"} | Script: ${input.scriptId ?? "n/a"} | Version: ${input.versionId ?? "n/a"} | Chunk: ${input.chunkId ?? "n/a"}</p>`,
    `<p>Findings: ${input.analysisFindings.length}</p>`,
    provenanceSummary,
    "<ul>",
    findingItems,
    "</ul>",
    "</section>",
  ].join("");
}

export function buildV4ReportAdapter(input: V4ReportAdapterInput): V4ReportAdapterResult {
  logger.info("[V4] reportBuilder entered", {
    jobId: input.jobId,
    chunkId: input.chunkId,
    sceneId: input.sceneId,
    findingsCount: input.findings.length,
  });
  const analysisFindings = Object.freeze([...input.findings]);
  const severityCountsValue = severityCounts(analysisFindings);
  const findingIds = uniqueSortedStrings(analysisFindings.map((finding) => finding.lineage_id ?? finding.canonical_finding_id ?? `${finding.article_id}:${finding.atom_id ?? "n/a"}:${finding.start_offset_global}:${finding.end_offset_global}`));
  const articleIds = uniqueSortedNumbers(analysisFindings.map((finding) => finding.article_id));
  const atomIds = uniqueSortedStrings(analysisFindings.map((finding) => finding.atom_id ?? finding.canonical_atom ?? ""));

  const summaryJson = Object.freeze({
    scene_id: input.sceneId,
    job_id: input.jobId,
    script_id: input.scriptId,
    version_id: input.versionId,
    chunk_id: input.chunkId,
    findings_count: analysisFindings.length,
    severity_counts: severityCountsValue,
    finding_ids: findingIds,
    article_ids: articleIds,
    atom_ids: atomIds,
    verified_finding_report: input.verifiedFindingCollection?.report ?? null,
    decision_provenance_report: input.decisionProvenanceCollection?.report ?? null,
  });

  const analysisReport = Object.freeze({
    sceneId: input.sceneId,
    jobId: input.jobId,
    scriptId: input.scriptId,
    versionId: input.versionId,
    chunkId: input.chunkId,
    findingsCount: analysisFindings.length,
    severityCounts: severityCountsValue,
    summaryJson,
    reportHtml: "",
  });

  const reportDocument = Object.freeze({
    sceneId: input.sceneId,
    jobId: input.jobId,
    scriptId: input.scriptId,
    versionId: input.versionId,
    chunkId: input.chunkId,
    analysisFindings,
    analysisReport,
    verifiedFindingReport: input.verifiedFindingCollection?.report ?? null,
    decisionProvenanceReport: input.decisionProvenanceCollection?.report ?? null,
    executionTimeMs: 0,
  });

  const reportHtml = renderReportHtml(reportDocument);
  const finalizedAnalysisReport = Object.freeze({
    ...analysisReport,
    reportHtml,
  });

  const finalizedReportDocument = Object.freeze({
    ...reportDocument,
    analysisReport: finalizedAnalysisReport,
  });

  const reportAdapterVerification = createNodeTruthVerification({
    nodeName: "report_adapter",
    nodeLabel: "Report Adapter",
    input: Object.freeze({
      findings_count: analysisFindings.length,
      finding_ids: findingIds,
      article_ids: articleIds,
      atom_ids: atomIds,
      verified_finding_report: input.verifiedFindingCollection?.report ?? null,
      decision_provenance_report: input.decisionProvenanceCollection?.report ?? null,
    }),
    output: Object.freeze({
      report_document: finalizedReportDocument,
      analysis_report: finalizedAnalysisReport,
    }),
    expectedTruth: input.findingTruth ?? null,
    actualTruth: input.findingTruth ?? null,
    executionTimeMs: 0,
    reason: "report_adapter_serialized_only",
    truthNode: true,
    inputSummary: `findings=${analysisFindings.length}; articles=${articleIds.join(",") || "none"}; atoms=${atomIds.join(",") || "none"}`,
    outputSummary: `reportFindings=${analysisFindings.length}; reportArticles=${articleIds.join(",") || "none"}; reportAtoms=${atomIds.join(",") || "none"}`,
    mutations: Object.freeze([]),
  });

  return Object.freeze({
    analysisFindings,
    analysisReport: finalizedAnalysisReport,
    reportDocument: finalizedReportDocument,
    truthLayerMeta: Object.freeze({
      report_adapter: Object.freeze({
        scene_id: input.sceneId,
        job_id: input.jobId,
        script_id: input.scriptId,
        version_id: input.versionId,
        chunk_id: input.chunkId,
        findings_count: analysisFindings.length,
        severity_counts: severityCountsValue,
        finding_ids: findingIds,
        article_ids: articleIds,
        atom_ids: atomIds,
        verified_finding_report: input.verifiedFindingCollection?.report ?? null,
        decision_provenance_report: input.decisionProvenanceCollection?.report ?? null,
        truth_verification: reportAdapterVerification,
      }),
    }),
  });
}
