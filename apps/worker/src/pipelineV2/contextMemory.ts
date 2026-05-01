import type { AnalysisChunk, AnalysisJob } from "../jobs.js";

export const PIPELINE_V2_MEMORY_VERSION = "v2";

export type DialogueTurnHint = {
  speaker: string;
  textPreview: string;
};

export type ChunkContextEnvelope = {
  pipelineVersion: "v2";
  chunkIndex: number;
  totalHints: {
    hasNormalizedText: boolean;
    chunkLength: number;
    startOffset: number;
    endOffset: number;
  };
  memory: {
    previousChunkIndex: number | null;
    nextChunkIndex: number | null;
    carriedForwardManualCount: number;
    previousExcerpt: string | null;
    nextExcerpt: string | null;
    speakerHints: string[];
    dialogueTurns: DialogueTurnHint[];
    boundaryNote: string;
  };
};

const CONTEXT_RADIUS = 650;

function compactText(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}…`;
}

function sliceWindow(text: string | null, start: number, end: number): string | null {
  if (!text || text.trim().length === 0) return null;
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  if (safeEnd <= safeStart) return null;
  const sliced = text.slice(safeStart, safeEnd).trim();
  return sliced.length > 0 ? compactText(sliced, CONTEXT_RADIUS) : null;
}

function extractSpeakerHints(chunkText: string): string[] {
  const matches = [...chunkText.matchAll(/(^|\n)\s*([^\n:]{1,40})\s*:\s*/g)];
  const seen = new Set<string>();
  for (const match of matches) {
    const raw = match[2]?.replace(/\s+/g, " ").trim();
    if (!raw) continue;
    if (raw.length < 2 || raw.length > 32) continue;
    if (/^\d+$/.test(raw)) continue;
    seen.add(raw);
    if (seen.size >= 6) break;
  }
  return [...seen];
}

function extractDialogueTurns(chunkText: string): DialogueTurnHint[] {
  const turns: DialogueTurnHint[] = [];
  const lines = chunkText.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([^\n:]{2,40})\s*:\s*(.+?)\s*$/u);
    if (!match) continue;
    const speaker = match[1]?.replace(/\s+/g, " ").trim();
    const text = match[2]?.replace(/\s+/g, " ").trim();
    if (!speaker || !text) continue;
    if (/^\d+$/.test(speaker)) continue;
    turns.push({
      speaker,
      textPreview: compactText(text, 180),
    });
    if (turns.length >= 12) break;
  }
  return turns;
}

export function buildChunkContextEnvelope(args: {
  job: AnalysisJob;
  chunk: AnalysisChunk;
  normalizedText: string | null;
}): ChunkContextEnvelope {
  const manualReviewContext =
    (args.job.config_snapshot as {
      manual_review_context?: { carried_forward_count?: number } | null;
    } | null)?.manual_review_context ?? null;
  const previousExcerpt = sliceWindow(
    args.normalizedText,
    args.chunk.start_offset - CONTEXT_RADIUS,
    args.chunk.start_offset,
  );
  const nextExcerpt = sliceWindow(
    args.normalizedText,
    args.chunk.end_offset,
    args.chunk.end_offset + CONTEXT_RADIUS,
  );
  const speakerHints = extractSpeakerHints(args.chunk.text);
  const dialogueTurns = extractDialogueTurns(args.chunk.text);
  const boundaryNote = previousExcerpt || nextExcerpt
    ? "Review this chunk as part of a continuing scene; connect it to adjacent text before deciding whether the content is endorsement, condemnation, neutral mention, dream logic, or narration."
    : "No adjacent-memory excerpt was available for this chunk.";

  return {
    pipelineVersion: "v2",
    chunkIndex: args.chunk.chunk_index,
    totalHints: {
      hasNormalizedText: Boolean(args.normalizedText),
      chunkLength: args.chunk.text.length,
      startOffset: args.chunk.start_offset,
      endOffset: args.chunk.end_offset,
    },
    memory: {
      previousChunkIndex: args.chunk.chunk_index > 0 ? args.chunk.chunk_index - 1 : null,
      nextChunkIndex: args.chunk.chunk_index + 1,
      carriedForwardManualCount: manualReviewContext?.carried_forward_count ?? 0,
      previousExcerpt,
      nextExcerpt,
      speakerHints,
      dialogueTurns,
      boundaryNote,
    },
  };
}

export function buildChunkPromptContext(envelope: ChunkContextEnvelope): string {
  const lines = [
    `- Chunk index: ${envelope.chunkIndex}`,
    `- Boundary note: ${envelope.memory.boundaryNote}`,
    `- Manual review items carried from prior reviews: ${envelope.memory.carriedForwardManualCount}`,
    `- Speaker hints in this chunk: ${envelope.memory.speakerHints.length > 0 ? envelope.memory.speakerHints.join("، ") : "none detected"}`,
    `- Current chunk dialogue turns: ${
      envelope.memory.dialogueTurns.length > 0
        ? envelope.memory.dialogueTurns.map((turn) => `${turn.speaker}: "${turn.textPreview}"`).join(" | ")
        : "none detected"
    }`,
    `- Previous chunk memory excerpt: ${envelope.memory.previousExcerpt ?? "not available"}`,
    `- Next chunk memory excerpt: ${envelope.memory.nextExcerpt ?? "not available"}`,
    "- Use this memory only to understand narrative continuity and intent.",
    "- Do not copy text from the memory excerpt as evidence unless the literal evidence also exists inside the current chunk.",
    "- Evidence and offsets must still come from the current chunk itself.",
  ];

  return lines.join("\n");
}
