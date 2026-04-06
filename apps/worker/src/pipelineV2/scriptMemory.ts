import { config } from "../config.js";
import type { AnalysisJob } from "../jobs.js";
import { logger } from "../logger.js";
import { generateScriptSummary, type ScriptSummaryPayload } from "../scriptSummary.js";

export const PIPELINE_V2_SCRIPT_MEMORY_VERSION = "v1";

export type ScriptMemoryPayload = {
  summary: ScriptSummaryPayload | null;
  speakerHints: string[];
  sampledWindows: {
    opening: string | null;
    middle: string | null;
    ending: string | null;
  };
  usedLlmSummary: boolean;
  skippedReason?: string | null;
};

const scriptMemoryCache = new Map<string, Promise<ScriptMemoryPayload>>();
const WINDOW_CHARS = 2200;

function compactText(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}…`;
}

function safeSlice(text: string, start: number, end: number): string | null {
  const left = Math.max(0, Math.min(start, text.length));
  const right = Math.max(left, Math.min(end, text.length));
  if (right <= left) return null;
  const value = text.slice(left, right).trim();
  return value.length > 0 ? compactText(value, WINDOW_CHARS) : null;
}

function sampleScriptWindows(fullText: string): ScriptMemoryPayload["sampledWindows"] {
  const opening = safeSlice(fullText, 0, Math.min(WINDOW_CHARS, fullText.length));
  const mid = Math.max(0, Math.floor(fullText.length / 2) - Math.floor(WINDOW_CHARS / 2));
  const middle = safeSlice(fullText, mid, mid + WINDOW_CHARS);
  const ending = safeSlice(fullText, Math.max(0, fullText.length - WINDOW_CHARS), fullText.length);
  return { opening, middle, ending };
}

function extractTopScriptSpeakers(fullText: string): string[] {
  const matches = [...fullText.matchAll(/(^|\n)\s*([^\n:]{1,40})\s*:\s*/g)];
  const counts = new Map<string, number>();
  for (const match of matches) {
    const raw = match[2]?.replace(/\s+/g, " ").trim();
    if (!raw) continue;
    if (raw.length < 2 || raw.length > 32) continue;
    if (/^\d+$/.test(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))
    .slice(0, 10)
    .map(([name]) => name);
}

function buildSampledSummaryInput(windows: ScriptMemoryPayload["sampledWindows"]): string {
  const parts = [
    windows.opening ? `بداية النص:\n${windows.opening}` : null,
    windows.middle ? `منتصف النص:\n${windows.middle}` : null,
    windows.ending ? `نهاية النص:\n${windows.ending}` : null,
  ].filter(Boolean);
  return parts.join("\n\n---\n\n");
}

export async function getCachedPipelineV2ScriptMemory(
  job: AnalysisJob,
  normalizedText: string | null,
): Promise<ScriptMemoryPayload> {
  const existing = scriptMemoryCache.get(job.id);
  if (existing) return existing;

  const pending = (async (): Promise<ScriptMemoryPayload> => {
    const text = normalizedText?.trim() ?? "";
    const sampledWindows = sampleScriptWindows(text);
    const speakerHints = extractTopScriptSpeakers(text);

    if (!text) {
      return {
        summary: null,
        speakerHints,
        sampledWindows,
        usedLlmSummary: false,
        skippedReason: "no_text",
      };
    }

    const skipForLargeJob =
      config.ANALYSIS_SKIP_SCRIPT_SUMMARY_ON_LARGE_JOBS &&
      text.length >= config.ANALYSIS_LARGE_JOB_TEXT_LENGTH_THRESHOLD;

    if (skipForLargeJob) {
      return {
        summary: null,
        speakerHints,
        sampledWindows,
        usedLlmSummary: false,
        skippedReason: "large_job_skip",
      };
    }

    try {
      const sampledInput = buildSampledSummaryInput(sampledWindows);
      const summary = sampledInput.trim().length > 0 ? await generateScriptSummary(sampledInput) : null;
      return {
        summary,
        speakerHints,
        sampledWindows,
        usedLlmSummary: Boolean(summary),
        skippedReason: summary ? null : "summary_unavailable",
      };
    } catch (error) {
      logger.warn("Pipeline V2 script memory generation failed", {
        jobId: job.id,
        error: String(error),
      });
      return {
        summary: null,
        speakerHints,
        sampledWindows,
        usedLlmSummary: false,
        skippedReason: "summary_failed",
      };
    }
  })();

  scriptMemoryCache.set(job.id, pending);

  try {
    return await pending;
  } catch (error) {
    scriptMemoryCache.delete(job.id);
    throw error;
  }
}

export function buildScriptMemoryPromptContext(memory: ScriptMemoryPayload): string {
  const lines = [
    `- Script-level memory summary source: ${memory.usedLlmSummary ? "llm_sampled_overview" : "deterministic_only"}`,
    `- Frequent speakers across the script: ${memory.speakerHints.length > 0 ? memory.speakerHints.join("، ") : "none detected"}`,
    `- Opening memory excerpt: ${memory.sampledWindows.opening ?? "not available"}`,
    `- Middle memory excerpt: ${memory.sampledWindows.middle ?? "not available"}`,
    `- Ending memory excerpt: ${memory.sampledWindows.ending ?? "not available"}`,
  ];

  if (memory.summary) {
    lines.push(`- Script synopsis: ${memory.summary.synopsis_ar}`);
    lines.push(`- Key risky events: ${memory.summary.key_risky_events_ar ?? "not provided"}`);
    lines.push(`- Narrative stance: ${memory.summary.narrative_stance_ar ?? "not provided"}`);
    lines.push(`- Compliance posture: ${memory.summary.compliance_posture_ar ?? "not provided"}`);
  } else {
    lines.push(`- Script-level summary note: ${memory.skippedReason ?? "not available"}`);
  }

  lines.push("- Use this script memory to understand long-range context, character intent, and whether the current chunk fits a larger dramatic arc.");
  lines.push("- Do not use script-memory excerpts as literal evidence unless the quoted text also exists inside the current chunk.");

  return lines.join("\n");
}
