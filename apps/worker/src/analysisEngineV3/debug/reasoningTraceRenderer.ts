import type { V3DebugReasoningTraceSection } from "./debugTypes.js";
import type { V3ReasoningTrace, V3ReasoningTraceStage } from "./reasoningTraceTypes.js";

function bulletList(values: readonly string[]): string {
  if (values.length === 0) return "- None";
  return values.map((value) => `- ${value}`).join("\n");
}

function renderStage(stage: V3ReasoningTraceStage): string {
  return [
    `#### ${stage.title}`,
    `- Stage: ${stage.stage}`,
    `- Confidence: ${stage.confidence}`,
    `- Items:`,
    bulletList(stage.items),
  ].join("\n");
}

function renderTrace(trace: V3ReasoningTrace): string {
  return [
    `### Finding Candidate ${trace.findingIndex + 1}`,
    `- Finding ID: ${trace.findingId}`,
    `- Article ID: ${trace.articleId}`,
    `- Atom ID: ${trace.atomId ?? "n/a"}`,
    `- Category: ${trace.category}`,
    `- Trace Hash: ${trace.hash}`,
    "",
    ...trace.stages.map((stage) => renderStage(stage)),
  ].join("\n");
}

export function renderV3ReasoningTraceSection(section: V3DebugReasoningTraceSection): string {
  return [
    "## Reasoning Trace",
    "",
    section.traces.length === 0 ? "- No findings available for trace generation." : section.traces.map((trace) => renderTrace(trace)).join("\n\n"),
  ].join("\n");
}
