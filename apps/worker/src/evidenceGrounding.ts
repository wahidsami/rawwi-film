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
  diagnostics?: {
    finding_id?: string | null;
    evidence: string;
    candidate_matches: Array<{
      method: "rationale_quote" | "evidence_exact" | "line_candidate" | "sentence_candidate" | "offset_span";
      text: string;
      start: number;
      end: number;
    }>;
    selected_match: {
      method: "rationale_quote" | "evidence_exact" | "line_candidate" | "sentence_candidate" | "offset_span" | "unresolved";
      text: string | null;
      start: number | null;
      end: number | null;
    } | null;
    grounding_score: number;
    rejection_reason: string | null;
  };
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

function buildDiagnostics(args: {
  finding: JudgeFinding;
  evidence: string;
  candidateMatches: Array<{
    method: "rationale_quote" | "evidence_exact" | "line_candidate" | "sentence_candidate" | "offset_span";
    text: string;
    start: number;
    end: number;
  }>;
  selectedMatch: {
    method: "rationale_quote" | "evidence_exact" | "line_candidate" | "sentence_candidate" | "offset_span" | "unresolved";
    text: string | null;
    start: number | null;
    end: number | null;
  } | null;
  grounded: boolean;
  reason?: string;
}): GroundedFindingResult["diagnostics"] {
  return {
    finding_id: (args.finding as { finding_id?: string | null }).finding_id ?? null,
    evidence: args.evidence,
    candidate_matches: args.candidateMatches,
    selected_match: args.selectedMatch,
    grounding_score: args.grounded
      ? (args.selectedMatch?.method === "rationale_quote" || args.selectedMatch?.method === "evidence_exact" ? 1 : 0.75)
      : 0,
    rejection_reason: args.grounded ? null : args.reason ?? null,
  };
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
  const candidateMatches: NonNullable<GroundedFindingResult["diagnostics"]>["candidate_matches"] = [];
  for (const needle of quotedNeedles) {
    const matches = findNeedleMatches(chunkText, needle, hintStart);
    const chosen = chooseBestMatch(matches, hintStart);
    if (isMeaningfulSpan(chosen) && isDetectionVerbatim(chunkText, chosen.text)) {
      candidateMatches.push({ method: "rationale_quote", text: compactSpace(chosen.text), start: chosen.start, end: chosen.end });
      const diagnostics = buildDiagnostics({
        finding,
        evidence: compactSpace(chosen.text),
        candidateMatches,
        selectedMatch: { method: "rationale_quote", text: compactSpace(chosen.text), start: chosen.start, end: chosen.end },
        grounded: true,
      });
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
        diagnostics,
      };
    }
  }

  if (rawEvidence.length >= 3) {
    const matches = findNeedleMatches(chunkText, rawEvidence, hintStart);
    const chosen = chooseBestMatch(matches, hintStart);
    if (isMeaningfulSpan(chosen) && isDetectionVerbatim(chunkText, chosen.text)) {
      candidateMatches.push({ method: "evidence_exact", text: compactSpace(chosen.text), start: chosen.start, end: chosen.end });
      const diagnostics = buildDiagnostics({
        finding,
        evidence: compactSpace(chosen.text),
        candidateMatches,
        selectedMatch: { method: "evidence_exact", text: compactSpace(chosen.text), start: chosen.start, end: chosen.end },
        grounded: true,
      });
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
        diagnostics,
      };
    }
  }

  const lineCandidates = buildLineCandidates(chunkText);
  const sentenceCandidates = buildSentenceCandidates(chunkText);

  if (isMeaningfulSpan(offsetSpan) && isDetectionVerbatim(chunkText, offsetSpan.text)) {
    candidateMatches.push({ method: "offset_span", text: compactSpace(offsetSpan.text), start: offsetSpan.start, end: offsetSpan.end });
    const diagnostics = buildDiagnostics({
      finding,
      evidence: compactSpace(offsetSpan.text),
      candidateMatches,
      selectedMatch: { method: "offset_span", text: compactSpace(offsetSpan.text), start: offsetSpan.start, end: offsetSpan.end },
      grounded: true,
    });
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
      diagnostics,
    };
  }

  if (hintStart != null && hintEnd != null && hintEnd > hintStart) {
    const lineCandidate = chooseContainingCandidate(lineCandidates, hintStart, hintEnd);
    if (isMeaningfulSpan(lineCandidate) && isDetectionVerbatim(chunkText, lineCandidate.text)) {
      candidateMatches.push({ method: "line_candidate", text: compactSpace(lineCandidate.text), start: lineCandidate.start, end: lineCandidate.end });
      const diagnostics = buildDiagnostics({
        finding,
        evidence: compactSpace(lineCandidate.text),
        candidateMatches,
        selectedMatch: { method: "line_candidate", text: compactSpace(lineCandidate.text), start: lineCandidate.start, end: lineCandidate.end },
        grounded: true,
      });
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
        diagnostics,
      };
    }

    const sentenceCandidate = chooseContainingCandidate(sentenceCandidates, hintStart, hintEnd);
    if (isMeaningfulSpan(sentenceCandidate) && isDetectionVerbatim(chunkText, sentenceCandidate.text)) {
      candidateMatches.push({ method: "sentence_candidate", text: compactSpace(sentenceCandidate.text), start: sentenceCandidate.start, end: sentenceCandidate.end });
      const diagnostics = buildDiagnostics({
        finding,
        evidence: compactSpace(sentenceCandidate.text),
        candidateMatches,
        selectedMatch: { method: "sentence_candidate", text: compactSpace(sentenceCandidate.text), start: sentenceCandidate.start, end: sentenceCandidate.end },
        grounded: true,
      });
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
        diagnostics,
      };
    }
  }

  const diagnostics = buildDiagnostics({
    finding,
    evidence: rawEvidence,
    candidateMatches,
    selectedMatch: {
      method: "unresolved",
      text: null,
      start: null,
      end: null,
    },
    grounded: false,
    reason: "no_meaningful_exact_local_evidence",
  });

  return {
    finding,
    grounded: false,
    method: "unresolved",
    reason: "no_meaningful_exact_local_evidence",
    diagnostics,
  };
}
