/**
 * Overlap-based canonical clustering: group findings that refer to the same
 * incident (overlapping evidence spans) so we emit one canonical finding per incident.
 */

export type SpanFinding = {
  start_offset_global?: number;
  end_offset_global?: number;
  [key: string]: unknown;
};

const DEFAULT_OVERLAP_RATIO = 0.4;
const MIN_SPAN_LEN = 10;

function compareSpanFindingsStable(a: SpanFinding, b: SpanFinding): number {
  return (
    (a.start_offset_global ?? 0) - (b.start_offset_global ?? 0) ||
    (a.end_offset_global ?? 0) - (b.end_offset_global ?? 0) ||
    String((a as { article_id?: number }).article_id ?? 0).localeCompare(String((b as { article_id?: number }).article_id ?? 0), "ar") ||
    String((a as { atom_id?: string | null }).atom_id ?? "").localeCompare(String((b as { atom_id?: string | null }).atom_id ?? ""), "ar") ||
    String((a as { evidence_snippet?: string }).evidence_snippet ?? "").localeCompare(String((b as { evidence_snippet?: string }).evidence_snippet ?? ""), "ar")
  );
}

function spanLength(f: SpanFinding): number {
  const start = f.start_offset_global ?? 0;
  const end = f.end_offset_global ?? start;
  return Math.max(0, end - start);
}

function overlapLength(a: SpanFinding, b: SpanFinding): number {
  const aStart = a.start_offset_global ?? 0;
  const aEnd = a.end_offset_global ?? aStart;
  const bStart = b.start_offset_global ?? 0;
  const bEnd = b.end_offset_global ?? bStart;
  const isectStart = Math.max(aStart, bStart);
  const isectEnd = Math.min(aEnd, bEnd);
  return Math.max(0, isectEnd - isectStart);
}

/**
 * Returns true if the two findings' evidence spans overlap enough to be the same incident.
 * Uses symmetric overlap: overlap / min(spanA, spanB) >= ratio.
 */
export function spansOverlap(
  a: SpanFinding,
  b: SpanFinding,
  minRatio: number = DEFAULT_OVERLAP_RATIO
): boolean {
  const lenA = spanLength(a);
  const lenB = spanLength(b);
  if (lenA < MIN_SPAN_LEN && lenB < MIN_SPAN_LEN) {
    const aStart = a.start_offset_global ?? 0;
    const aEnd = a.end_offset_global ?? aStart;
    const bStart = b.start_offset_global ?? 0;
    const bEnd = b.end_offset_global ?? bStart;
    return isectLen(aStart, aEnd, bStart, bEnd) > 0;
  }
  const overlap = overlapLength(a, b);
  const minLen = Math.min(lenA, lenB) || Math.max(lenA, lenB) || 1;
  return overlap / minLen >= minRatio;
}

function isectLen(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Cluster findings by evidence-window overlap. Each finding gets a cluster index;
 * findings in the same cluster share the same incident.
 */
export function clusterByOverlap<T extends SpanFinding>(
  findings: T[],
  minOverlapRatio: number = DEFAULT_OVERLAP_RATIO
): Map<number, T[]> {
  if (findings.length === 0) return new Map();
  const sorted = [...findings].sort(compareSpanFindingsStable);
  const clusterIdByIndex: number[] = [];
  const union: number[] = sorted.map((_, i) => i);

  function find(i: number): number {
    if (union[i] !== i) union[i] = find(union[i]);
    return union[i];
  }
  function unite(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) union[ri] = rj;
  }

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const aEnd = a.end_offset_global ?? a.start_offset_global ?? 0;
      const bStart = b.start_offset_global ?? 0;
      if (bStart > aEnd + 500) break;
      if (spansOverlap(a, b, minOverlapRatio)) unite(i, j);
    }
  }

  const clusters = new Map<number, T[]>();
  for (let i = 0; i < sorted.length; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(sorted[i]);
  }
  return clusters;
}

/**
 * Produce a stable canonical cluster key for a list of findings (e.g. min start and max end of cluster).
 */
export function clusterCanonicalKey(findings: SpanFinding[]): string {
  if (findings.length === 0) return "empty";
  const sorted = [...findings].sort(compareSpanFindingsStable);
  const starts = sorted.map((f) => f.start_offset_global ?? 0);
  const ends = sorted.map((f) => f.end_offset_global ?? 0);
  const minStart = Math.min(...starts);
  const maxEnd = Math.max(...ends);
  const first = sorted[0] as { evidence_snippet?: string; article_id?: number; atom_id?: string | null };
  const firstSnippet = first.evidence_snippet ?? "";
  return `${minStart}:${maxEnd}:${first.article_id ?? 0}:${first.atom_id ?? ""}:${firstSnippet.slice(0, 80)}`;
}
