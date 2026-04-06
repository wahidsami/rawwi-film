import type { JudgeFinding } from "../schemas.js";
import { isDetectionVerbatim } from "../textDetectionNormalize.js";

export const PIPELINE_V2_EVIDENCE_PINNING_VERSION = "v1";

const SENTENCE_BREAKS = new Set(["\n", ".", "!", "?", "؟", "…"]);
const CLAUSE_BREAKS = new Set([",", "،", ";", "؛"]);
const EDGE_TRIM_RE = /^[\s"'“”‘’(\[{\-–—]+|[\s"'“”‘’)\]}:,\u060C;؛.!?؟…\-–—]+$/g;

type LocalSpan = {
  start: number;
  end: number;
  text: string;
};

function clampIndex(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isEdgeTrimChar(ch: string): boolean {
  return /[\s"'“”‘’()[\]{}:,\u060C;؛.!?؟…\-–—]/u.test(ch);
}

function trimRange(text: string, start: number, end: number): LocalSpan | null {
  let left = clampIndex(start, 0, text.length);
  let right = clampIndex(end, left, text.length);
  while (left < right && isEdgeTrimChar(text[left])) left++;
  while (right > left && isEdgeTrimChar(text[right - 1])) right--;
  if (right <= left) return null;
  return { start: left, end: right, text: text.slice(left, right) };
}

function findSentenceRange(text: string, anchorStart: number, anchorEnd: number): LocalSpan | null {
  let start = clampIndex(anchorStart, 0, text.length);
  let end = clampIndex(anchorEnd, start, text.length);

  while (start > 0) {
    const ch = text[start - 1];
    if (SENTENCE_BREAKS.has(ch)) break;
    start--;
  }
  while (end < text.length) {
    const ch = text[end];
    if (SENTENCE_BREAKS.has(ch)) break;
    end++;
  }

  return trimRange(text, start, end);
}

function findClauseRange(text: string, sentence: LocalSpan, anchorStart: number, anchorEnd: number): LocalSpan | null {
  let start = clampIndex(anchorStart, sentence.start, sentence.end);
  let end = clampIndex(anchorEnd, start, sentence.end);

  while (start > sentence.start) {
    const ch = text[start - 1];
    if (CLAUSE_BREAKS.has(ch) || ch === "\n") break;
    start--;
  }
  while (end < sentence.end) {
    const ch = text[end];
    if (CLAUSE_BREAKS.has(ch) || ch === "\n") break;
    end++;
  }

  const clause = trimRange(text, start, end);
  if (!clause) return null;
  return clause.text.length < sentence.text.length ? clause : null;
}

function findDirectEvidenceMatch(text: string, searchArea: LocalSpan, evidence: string): LocalSpan | null {
  const trimmedEvidence = evidence.replace(/\s+/g, " ").trim();
  if (!trimmedEvidence || trimmedEvidence.length < 2 || trimmedEvidence.length > 220) return null;

  const rawArea = text.slice(searchArea.start, searchArea.end);
  const directIndex = rawArea.indexOf(trimmedEvidence);
  if (directIndex >= 0) {
    return trimRange(
      text,
      searchArea.start + directIndex,
      searchArea.start + directIndex + trimmedEvidence.length,
    );
  }

  return null;
}

function looksOverbroad(span: LocalSpan): boolean {
  return span.text.length > 180 || /\n/.test(span.text);
}

/**
 * Deterministic evidence pinning for V2:
 * - prefer exact evidence match when the model snippet exists literally
 * - otherwise prefer the model's local offsets when already tight
 * - otherwise narrow to the shortest reliable clause/sentence around the offsets
 */
export function pinFindingEvidenceToChunk(finding: JudgeFinding, chunkText: string): JudgeFinding {
  const localStart = clampIndex(finding.location?.start_offset ?? 0, 0, chunkText.length);
  const localEnd = clampIndex(finding.location?.end_offset ?? localStart, localStart, chunkText.length);
  const localSpan = trimRange(chunkText, localStart, localEnd);

  if (!localSpan) return finding;

  const sentence = findSentenceRange(chunkText, localSpan.start, localSpan.end) ?? localSpan;
  const clause = findClauseRange(chunkText, sentence, localSpan.start, localSpan.end);
  const evidenceMatchInLocal = findDirectEvidenceMatch(chunkText, localSpan, finding.evidence_snippet ?? "");
  const evidenceMatchInSentence = evidenceMatchInLocal ?? findDirectEvidenceMatch(chunkText, sentence, finding.evidence_snippet ?? "");

  const candidates = [
    evidenceMatchInSentence,
    !looksOverbroad(localSpan) ? localSpan : null,
    clause,
    sentence,
    localSpan,
  ].filter((candidate): candidate is LocalSpan => Boolean(candidate));

  const chosen =
    candidates.find((candidate) => candidate.text.length > 0 && isDetectionVerbatim(chunkText, candidate.text)) ??
    localSpan;

  if (!chosen || chosen.text.trim().length === 0) return finding;

  const normalizedText = chosen.text.replace(EDGE_TRIM_RE, "").trim();
  if (!normalizedText) return finding;

  return {
    ...finding,
    evidence_snippet: normalizedText,
    location: {
      ...finding.location,
      start_offset: chosen.start,
      end_offset: chosen.end,
    },
  };
}
