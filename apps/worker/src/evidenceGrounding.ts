import { findStringMatches } from "./lexiconCache.js";
import type { JudgeFinding } from "./schemas.js";
import { isDetectionVerbatim } from "./textDetectionNormalize.js";

type LocalSpan = {
  start: number;
  end: number;
  text: string;
};

export type GroundedFindingResult = {
  finding: JudgeFinding;
  grounded: boolean;
  method: "rationale_quote" | "evidence_exact" | "line_candidate" | "sentence_candidate" | "offset_span" | "unresolved";
  reason?: string;
};

export const PIPELINE_EVIDENCE_GROUNDING_VERSION = "v1";

const EDGE_TRIM_RE = /^[\s"'“”‘’«»(\[{\-–—]+|[\s"'“”‘’«»)\]}:,\u060C;؛.!?؟…\-–—]+$/g;
const SENTENCE_BREAKS = new Set([".", "!", "?", "؟", "…"]);
const QUOTE_PATTERNS = [
  /"([^"\n]{2,180})"/gu,
  /“([^”\n]{2,180})”/gu,
  /‘([^’\n]{2,180})’/gu,
  /«([^»\n]{2,180})»/gu,
];

function clampIndex(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isEdgeTrimChar(ch: string): boolean {
  return /[\s"'“”‘’«»()[\]{}:,\u060C;؛.!?؟…\-–—]/u.test(ch);
}

function trimRange(text: string, start: number, end: number): LocalSpan | null {
  let left = clampIndex(start, 0, text.length);
  let right = clampIndex(end, left, text.length);
  while (left < right && isEdgeTrimChar(text[left])) left++;
  while (right > left && isEdgeTrimChar(text[right - 1])) right--;
  if (right <= left) return null;
  return { start: left, end: right, text: text.slice(left, right) };
}

function countLetters(value: string): number {
  const matches = value.match(/[\p{L}\p{N}]/gu);
  return matches?.length ?? 0;
}

function isMeaningfulSpan(span: LocalSpan | null): span is LocalSpan {
  if (!span) return false;
  const cleaned = span.text.replace(EDGE_TRIM_RE, "").trim();
  if (!cleaned || cleaned.length < 3) return false;
  if (countLetters(cleaned) < 2) return false;
  return true;
}

function compactSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildLineCandidates(chunkText: string): LocalSpan[] {
  const candidates: LocalSpan[] = [];
  let cursor = 0;
  for (const rawLine of chunkText.split(/\r?\n/)) {
    const lineStart = cursor;
    const lineEnd = cursor + rawLine.length;
    const trimmed = trimRange(chunkText, lineStart, lineEnd);
    if (isMeaningfulSpan(trimmed)) candidates.push(trimmed);
    cursor = lineEnd + 1;
  }
  return candidates;
}

function buildSentenceCandidates(chunkText: string): LocalSpan[] {
  const candidates: LocalSpan[] = [];
  let sentenceStart = 0;
  for (let i = 0; i < chunkText.length; i++) {
    const ch = chunkText[i];
    if (ch === "\n" || SENTENCE_BREAKS.has(ch)) {
      const candidate = trimRange(chunkText, sentenceStart, ch === "\n" ? i : i + 1);
      if (isMeaningfulSpan(candidate)) candidates.push(candidate);
      sentenceStart = i + 1;
    }
  }
  const tail = trimRange(chunkText, sentenceStart, chunkText.length);
  if (isMeaningfulSpan(tail)) candidates.push(tail);
  return candidates;
}

function extractQuotedNeedles(...values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const source = String(value ?? "");
    for (const pattern of QUOTE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const needle = compactSpace(match[1] ?? "");
        if (needle.length < 2 || needle.length > 180) continue;
        seen.add(needle);
      }
    }
  }
  return [...seen].sort((a, b) => b.length - a.length || a.localeCompare(b, "ar"));
}

function chooseBestMatch(matches: LocalSpan[], hintStart: number | null): LocalSpan | null {
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    if (hintStart != null) {
      const da = Math.abs(a.start - hintStart);
      const db = Math.abs(b.start - hintStart);
      if (da !== db) return da - db;
    }
    const lenDiff = a.text.length - b.text.length;
    if (lenDiff !== 0) return lenDiff;
    return a.start - b.start;
  })[0] ?? null;
}

function findNeedleMatches(chunkText: string, needle: string, hintStart: number | null): LocalSpan[] {
  const exactMatches: LocalSpan[] = [];
  let pos = 0;
  while (pos <= chunkText.length) {
    const idx = chunkText.indexOf(needle, pos);
    if (idx < 0) break;
    const span = trimRange(chunkText, idx, idx + needle.length);
    if (isMeaningfulSpan(span)) exactMatches.push(span);
    pos = idx + 1;
  }
  if (exactMatches.length > 0) {
    const chosen = chooseBestMatch(exactMatches, hintStart);
    return chosen ? [chosen] : [];
  }

  const flexibleMatches = findStringMatches(chunkText, needle, needle.includes(" ") ? "phrase" : "word")
    .map((match) => trimRange(chunkText, match.startIndex, match.endIndex))
    .filter(isMeaningfulSpan);
  const chosen = chooseBestMatch(flexibleMatches, hintStart);
  return chosen ? [chosen] : [];
}

function chooseContainingCandidate(
  candidates: LocalSpan[],
  localStart: number,
  localEnd: number,
): LocalSpan | null {
  const overlapping = candidates.filter((candidate) => localStart < candidate.end && localEnd > candidate.start);
  if (overlapping.length === 0) return null;
  return [...overlapping].sort((a, b) => a.text.length - b.text.length || a.start - b.start)[0] ?? null;
}

export function groundFindingEvidenceToChunk(finding: JudgeFinding, chunkText: string): GroundedFindingResult {
  const rawEvidence = compactSpace(finding.evidence_snippet ?? "");
  const hintStart = typeof finding.location?.start_offset === "number" ? finding.location.start_offset : null;
  const hintEnd = typeof finding.location?.end_offset === "number" ? finding.location.end_offset : hintStart;
  const offsetSpan =
    hintStart != null && hintEnd != null && hintEnd > hintStart
      ? trimRange(chunkText, hintStart, hintEnd)
      : null;

  const quotedNeedles = extractQuotedNeedles(finding.rationale_ar, finding.description_ar, finding.title_ar);
  for (const needle of quotedNeedles) {
    const matches = findNeedleMatches(chunkText, needle, hintStart);
    const chosen = chooseBestMatch(matches, hintStart);
    if (isMeaningfulSpan(chosen) && isDetectionVerbatim(chunkText, chosen.text)) {
      return {
        finding: {
          ...finding,
          evidence_snippet: compactSpace(chosen.text),
          location: {
            ...finding.location,
            start_offset: chosen.start,
            end_offset: chosen.end,
          },
        },
        grounded: true,
        method: "rationale_quote",
      };
    }
  }

  if (rawEvidence.length >= 3) {
    const matches = findNeedleMatches(chunkText, rawEvidence, hintStart);
    const chosen = chooseBestMatch(matches, hintStart);
    if (isMeaningfulSpan(chosen) && isDetectionVerbatim(chunkText, chosen.text)) {
      return {
        finding: {
          ...finding,
          evidence_snippet: compactSpace(chosen.text),
          location: {
            ...finding.location,
            start_offset: chosen.start,
            end_offset: chosen.end,
          },
        },
        grounded: true,
        method: "evidence_exact",
      };
    }
  }

  const lineCandidates = buildLineCandidates(chunkText);
  const sentenceCandidates = buildSentenceCandidates(chunkText);

  if (isMeaningfulSpan(offsetSpan) && isDetectionVerbatim(chunkText, offsetSpan.text)) {
    return {
      finding: {
        ...finding,
        evidence_snippet: compactSpace(offsetSpan.text),
        location: {
          ...finding.location,
          start_offset: offsetSpan.start,
          end_offset: offsetSpan.end,
        },
      },
      grounded: true,
      method: "offset_span",
    };
  }

  if (hintStart != null && hintEnd != null && hintEnd > hintStart) {
    const lineCandidate = chooseContainingCandidate(lineCandidates, hintStart, hintEnd);
    if (isMeaningfulSpan(lineCandidate) && isDetectionVerbatim(chunkText, lineCandidate.text)) {
      return {
        finding: {
          ...finding,
          evidence_snippet: compactSpace(lineCandidate.text),
          location: {
            ...finding.location,
            start_offset: lineCandidate.start,
            end_offset: lineCandidate.end,
          },
        },
        grounded: true,
        method: "line_candidate",
      };
    }

    const sentenceCandidate = chooseContainingCandidate(sentenceCandidates, hintStart, hintEnd);
    if (isMeaningfulSpan(sentenceCandidate) && isDetectionVerbatim(chunkText, sentenceCandidate.text)) {
      return {
        finding: {
          ...finding,
          evidence_snippet: compactSpace(sentenceCandidate.text),
          location: {
            ...finding.location,
            start_offset: sentenceCandidate.start,
            end_offset: sentenceCandidate.end,
          },
        },
        grounded: true,
        method: "sentence_candidate",
      };
    }
  }

  return {
    finding,
    grounded: false,
    method: "unresolved",
    reason: "no_meaningful_exact_local_evidence",
  };
}
