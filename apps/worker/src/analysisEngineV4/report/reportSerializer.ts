import type { V4ReportAdapterResult } from "./reportBuilder.js";

function normalizeReportAdapterResult(result: V4ReportAdapterResult): V4ReportAdapterResult {
  return Object.freeze({
    ...result,
    analysisFindings: Object.freeze([...result.analysisFindings]),
    analysisReport: Object.freeze({
      ...result.analysisReport,
      summaryJson: Object.freeze({ ...result.analysisReport.summaryJson }),
      severityCounts: Object.freeze({ ...result.analysisReport.severityCounts }),
    }),
    reportDocument: Object.freeze({
      ...result.reportDocument,
      analysisFindings: Object.freeze([...result.reportDocument.analysisFindings]),
      analysisReport: Object.freeze({
        ...result.reportDocument.analysisReport,
        summaryJson: Object.freeze({ ...result.reportDocument.analysisReport.summaryJson }),
        severityCounts: Object.freeze({ ...result.reportDocument.analysisReport.severityCounts }),
      }),
    }),
    truthLayerMeta: Object.freeze({
      ...result.truthLayerMeta,
      report_adapter: Object.freeze({
        ...((result.truthLayerMeta.report_adapter as Record<string, unknown>) ?? {}),
      }),
    }),
  });
}

export function serializeReportAdapterResult(result: V4ReportAdapterResult): string {
  return `${JSON.stringify(normalizeReportAdapterResult(result), null, 2)}\n`;
}

