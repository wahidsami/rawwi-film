import { buildV4ReportAdapter, type V4ReportAdapterInput, type V4ReportAdapterResult } from "./reportBuilder.js";

export type { V4ReportAdapterInput, V4ReportAdapterResult } from "./reportBuilder.js";

export function createReportAdapter() {
  return (input: V4ReportAdapterInput): V4ReportAdapterResult => buildV4ReportAdapter(input);
}

export { buildV4ReportAdapter } from "./reportBuilder.js";
