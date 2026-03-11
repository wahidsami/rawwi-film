import type { AnalysisFinding } from "@/api";

type SummaryFinding = {
  title_ar?: string;
  severity?: string;
  confidence?: number;
  evidence_snippet?: string;
};

type SummaryArticle = {
  article_id: number;
  top_findings?: SummaryFinding[];
};

type CanonicalSummaryFinding = {
  canonical_finding_id: string;
  title_ar: string;
  evidence_snippet: string;
  severity: string;
  confidence: number;
  primary_article_id?: number | null;
  start_line_chunk?: number | null;
  end_line_chunk?: number | null;
};

export type AnalysisPdfFinding = {
  id: string;
  articleId: number;
  titleAr: string;
  severity: string;
  confidence: number;
  evidenceSnippet: string;
  source?: string;
  startLineChunk?: number;
  endLineChunk?: number;
  reviewStatus?: string;
  reviewedAt?: string;
};

export function mapAnalysisFindingsForPdf(
  findings: AnalysisFinding[] | null | undefined,
  findingsByArticle: SummaryArticle[] | null | undefined,
  canonicalFindings?: CanonicalSummaryFinding[] | null
): AnalysisPdfFinding[] {
  const real = (findings || [])
    .filter((f): f is AnalysisFinding => !!f)
    .map((f, idx) => ({
      id: ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined)?.canonical_finding_id as string
        ?? f.id
        ?? `finding-${idx}`,
      articleId: Number.isFinite(f.articleId) ? f.articleId : 0,
      titleAr: f.titleAr ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidenceSnippet ?? "",
      source: f.source,
      startLineChunk: f.startLineChunk ?? undefined,
      endLineChunk: f.endLineChunk ?? undefined,
      reviewStatus: f.reviewStatus ?? undefined,
      reviewedAt: f.reviewedAt ?? undefined,
    }));

  if (real.length > 0) {
    const deduped = new Map<string, AnalysisPdfFinding>();
    for (const f of real) {
      const key = f.id || `${f.articleId}-${f.evidenceSnippet.slice(0, 80)}`;
      const ex = deduped.get(key);
      if (!ex) {
        deduped.set(key, f);
      } else {
        const currentRank = ex.severity === "critical" ? 4 : ex.severity === "high" ? 3 : ex.severity === "medium" ? 2 : 1;
        const nextRank = f.severity === "critical" ? 4 : f.severity === "high" ? 3 : f.severity === "medium" ? 2 : 1;
        if (nextRank > currentRank || (nextRank === currentRank && f.confidence > ex.confidence)) {
          deduped.set(key, f);
        }
      }
    }
    return [...deduped.values()];
  }

  const canon = (canonicalFindings || [])
    .filter(Boolean)
    .map((f, idx) => ({
      id: f.canonical_finding_id ?? `canonical-${idx}`,
      articleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0,
      titleAr: f.title_ar ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidence_snippet ?? "",
      source: "ai",
      startLineChunk: f.start_line_chunk ?? undefined,
      endLineChunk: f.end_line_chunk ?? undefined,
    }));
  if (canon.length > 0) return canon;

  const byArticle = findingsByArticle || [];
  return byArticle.flatMap((art, aIdx) => {
    const top = art?.top_findings || [];
    return top.filter(Boolean).map((f, idx) => ({
      id: `summary-${art.article_id}-${aIdx}-${idx}`,
      articleId: Number.isFinite(art.article_id) ? art.article_id : 0,
      titleAr: f.title_ar ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidence_snippet ?? "",
      source: "ai",
    }));
  });
}
