import type { AnalysisFinding } from "@/api";

type SummaryFinding = {
  title_ar?: string;
  severity?: string;
  confidence?: number;
  evidence_snippet?: string;
  rationale?: string | null;
};

type SummaryArticle = {
  article_id: number;
  top_findings?: SummaryFinding[];
};

export type CanonicalFindingForQuickPdf = {
  canonical_finding_id: string;
  title_ar: string;
  evidence_snippet: string;
  severity: string;
  confidence: number;
  rationale?: string | null;
  pillar_id?: string | null;
  primary_article_id?: number | null;
  related_article_ids?: number[];
  start_line_chunk?: number | null;
  end_line_chunk?: number | null;
  page_number?: number | null;
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
  rationale?: string | null;
  primaryArticleId?: number;
  relatedArticleIds?: number[];
  pillarId?: string | null;
  pageNumber?: number | null;
};

export function mapQuickAnalysisFindingsForPdf(
  findings: AnalysisFinding[] | null | undefined,
  findingsByArticle: SummaryArticle[] | null | undefined,
  canonicalFindings?: CanonicalFindingForQuickPdf[] | null
): QuickAnalysisPdfFinding[] {
  const canon = (canonicalFindings || [])
    .filter(Boolean)
    .map((f, idx) => ({
      id: f.canonical_finding_id ?? `quick-canonical-${idx}`,
      articleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0,
      titleAr: f.title_ar ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidence_snippet ?? "",
      source: "ai" as const,
      startLineChunk: f.start_line_chunk ?? undefined,
      endLineChunk: f.end_line_chunk ?? undefined,
      rationale: f.rationale ?? null,
      primaryArticleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : undefined,
      relatedArticleIds: f.related_article_ids ?? [],
      pillarId: f.pillar_id ?? undefined,
      pageNumber: f.page_number ?? undefined,
    }));
  if (canon.length > 0) return canon;

  const real = (findings || [])
    .filter((f): f is AnalysisFinding => !!f)
    .map((f, idx) => {
      const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
      return {
        id: f.id ?? `quick-finding-${idx}`,
        articleId: Number.isFinite(f.articleId) ? f.articleId : 0,
        titleAr: f.titleAr ?? "—",
        severity: f.severity ?? "info",
        confidence: f.confidence ?? 0,
        evidenceSnippet: f.evidenceSnippet ?? "",
        source: f.source ?? "ai",
        startLineChunk: f.startLineChunk ?? undefined,
        endLineChunk: f.endLineChunk ?? undefined,
        rationale: (v3.rationale_ar as string | undefined) ?? (v3.rationale as string | undefined) ?? null,
        primaryArticleId: Number(v3.primary_article_id),
        relatedArticleIds: (v3.related_article_ids as number[] | undefined) ?? [],
        pillarId: (v3.pillar_id as string | undefined) ?? undefined,
        pageNumber: f.pageNumber ?? undefined,
      };
    });
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
      rationale: f.rationale ?? null,
    }))
  );
}
