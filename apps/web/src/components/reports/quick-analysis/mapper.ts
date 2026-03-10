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

export type QuickAnalysisPdfFinding = {
  id: string;
  articleId: number;
  titleAr: string;
  severity: string;
  confidence: number;
  evidenceSnippet: string;
  source?: string;
  startLineChunk?: number;
  endLineChunk?: number;
};

export function mapQuickAnalysisFindingsForPdf(
  findings: AnalysisFinding[] | null | undefined,
  findingsByArticle: SummaryArticle[] | null | undefined
): QuickAnalysisPdfFinding[] {
  const real = (findings || [])
    .filter((f): f is AnalysisFinding => !!f)
    .map((f, idx) => ({
      id: f.id ?? `quick-finding-${idx}`,
      articleId: Number.isFinite(f.articleId) ? f.articleId : 0,
      titleAr: f.titleAr ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidenceSnippet ?? "",
      source: f.source ?? "ai",
      startLineChunk: f.startLineChunk ?? undefined,
      endLineChunk: f.endLineChunk ?? undefined,
    }));
  if (real.length > 0) return real;

  return (findingsByArticle || []).flatMap((art, aIdx) =>
    (art?.top_findings || []).filter(Boolean).map((f, idx) => ({
      id: `quick-summary-${art.article_id}-${aIdx}-${idx}`,
      articleId: Number.isFinite(art.article_id) ? art.article_id : 0,
      titleAr: f.title_ar ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidence_snippet ?? "",
      source: "ai" as const,
    }))
  );
}
