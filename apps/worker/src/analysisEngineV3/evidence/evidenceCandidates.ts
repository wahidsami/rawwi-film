type SentenceEvidenceCandidate = Readonly<{
  text: string;
  startOffset: number;
  endOffset: number;
  confidence: number;
  source: "chunk";
  notes?: readonly string[];
}>;

const SENTENCE_BOUNDARY_PATTERN = /[.!?؟…؛\n]/u;

function normalizeText(value: string): string {
  return value.normalize("NFC");
}

function trimSpan(text: string): Readonly<{ startTrim: number; endTrim: number }> {
  let startTrim = 0;
  while (startTrim < text.length && /\s/u.test(text[startTrim]!)) startTrim++;

  let endTrim = text.length;
  while (endTrim > startTrim && /\s/u.test(text[endTrim - 1]!)) endTrim--;

  return { startTrim, endTrim };
}

function hasMeaningfulText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function buildCandidate(
  text: string,
  startOffset: number,
  confidence: number,
): SentenceEvidenceCandidate | null {
  const normalized = normalizeText(text);
  const { startTrim, endTrim } = trimSpan(normalized);
  if (endTrim <= startTrim) return null;

  const candidateText = normalized.slice(startTrim, endTrim);
  if (!hasMeaningfulText(candidateText)) return null;
  return Object.freeze({
    text: candidateText,
    startOffset: startOffset + startTrim,
    endOffset: startOffset + endTrim,
    confidence,
    source: "chunk" as const,
    notes: Object.freeze(["sentence_level_evidence_candidate"]),
  }) as SentenceEvidenceCandidate;
}

export function splitSentenceEvidenceCandidates(
  text: string,
  startOffset = 0,
  confidence = 0.5,
): readonly SentenceEvidenceCandidate[] {
  const normalized = normalizeText(text);
  const candidates: SentenceEvidenceCandidate[] = [];
  let segmentStart = 0;

  for (let index = 0; index <= normalized.length; index++) {
    const atEnd = index === normalized.length;
    const boundary = atEnd || SENTENCE_BOUNDARY_PATTERN.test(normalized[index] ?? "");
    if (!boundary) continue;

    let segmentEnd = atEnd ? index : index + 1;
    while (segmentEnd < normalized.length && SENTENCE_BOUNDARY_PATTERN.test(normalized[segmentEnd] ?? "")) {
      segmentEnd++;
    }
    const segment = normalized.slice(segmentStart, segmentEnd);
    const candidate = buildCandidate(segment, startOffset + segmentStart, confidence);
    if (candidate) candidates.push(candidate);

    segmentStart = segmentEnd;
    while (segmentStart < normalized.length && /\s/u.test(normalized[segmentStart]!)) {
      segmentStart++;
    }
    if (segmentStart >= normalized.length) {
      break;
    }
    index = segmentStart - 1;
  }

  if (candidates.length === 0) {
    const fallback = buildCandidate(normalized, startOffset, confidence);
    if (fallback) candidates.push(fallback);
  }

  return Object.freeze(candidates);
}
