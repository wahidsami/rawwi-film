import type { V3InspectionTimeline } from "./inspectionTypes.js";

function renderValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.trim().length > 0 ? value : "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export function renderV3InspectionTimeline(timeline: V3InspectionTimeline): string {
  const lines: string[] = [];
  lines.push(`# V3 Inspection Timeline`);
  lines.push(`Job ID: ${timeline.jobId}`);
  lines.push(`Records: ${timeline.records.length}`);
  lines.push("");

  for (const finding of timeline.findings) {
    lines.push(`## Finding ${finding.findingKey}`);
    for (const record of finding.records) {
      lines.push(`### Stage ${record.stageOrder}: ${record.stageName}`);
      lines.push(`- Chunk ID: ${renderValue(record.chunkId)}`);
      lines.push(`- Created At: ${record.createdAt}`);
      lines.push(`- Payload:`);
      lines.push("```json");
      lines.push(JSON.stringify(record.payloadJson, null, 2));
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}
