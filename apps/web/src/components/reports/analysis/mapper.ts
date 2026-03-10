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
  findingsByArticle: SummaryArticle[] | null | undefined
): AnalysisPdfFinding[] {
  const real = (findings || [])
    .filter((f): f is AnalysisFinding => !!f)
    .map((f, idx) => ({
      id: f.id ?? `finding-${idx}`,
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

  if (real.length > 0) return real;

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
