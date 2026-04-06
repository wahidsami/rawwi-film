import type { AnalysisFinding, AnalysisReviewFinding } from "@/api";
import { normalizeAtomId } from "@/data/policyMap";

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
  rationale?: string | null;
  pillar_id?: string | null;
  primary_article_id?: number | null;
  related_article_ids?: number[];
  start_line_chunk?: number | null;
  end_line_chunk?: number | null;
  page_number?: number | null;
  primary_policy_atom_id?: string | null;
  source?: string | null;
};

export type AnalysisPdfFinding = {
  id: string;
  articleId: number;
  titleAr: string;
  severity: string;
  confidence: number;
  evidenceSnippet: string;
  startOffsetGlobal?: number | null;
  source?: string;
  primaryArticleId?: number;
  relatedArticleIds?: number[];
  rationale?: string | null;
  pillarId?: string | null;
  startLineChunk?: number;
  endLineChunk?: number;
  pageNumber?: number | null;
  reviewStatus?: string;
  reviewedAt?: string;
  /** Policy atom e.g. 4-1 for semantic grouping */
  policyAtomId?: string;
};

function reviewSourceToPdfSource(sourceKind: AnalysisReviewFinding["sourceKind"]): string {
  if (sourceKind === "manual") return "manual";
  if (sourceKind === "glossary") return "glossary";
  if (sourceKind === "special") return "ai";
  return "ai";
}

export function splitAnalysisReviewFindingsForPdf(
  reviewFindings: AnalysisReviewFinding[] | null | undefined
): { findings: AnalysisPdfFinding[]; reportHints: AnalysisPdfFinding[] } {
  const visible = (reviewFindings || []).filter(
    (row): row is AnalysisReviewFinding => Boolean(row) && !row.isHidden && row.includeInReport !== false
  );

  const findings = visible
    .filter((row) => row.sourceKind !== "special" && row.reviewStatus !== "approved")
    .map((row) => ({
      id: row.canonicalFindingId?.trim() || row.id,
      articleId: Number.isFinite(row.primaryArticleId) ? row.primaryArticleId : 0,
      titleAr: row.titleAr ?? "—",
      severity: row.severity ?? "info",
      confidence: row.anchorConfidence ?? 1,
      evidenceSnippet: row.evidenceSnippet ?? "",
      startOffsetGlobal: row.startOffsetGlobal ?? null,
      source: reviewSourceToPdfSource(row.sourceKind),
      primaryArticleId: Number.isFinite(row.primaryArticleId) ? row.primaryArticleId : 0,
      relatedArticleIds: [],
      rationale: row.rationaleAr ?? row.descriptionAr ?? null,
      pillarId: null,
      pageNumber: row.pageNumber ?? undefined,
      reviewStatus: row.reviewStatus,
      reviewedAt: row.reviewedAt ?? undefined,
      policyAtomId: row.primaryAtomId?.trim() || undefined,
    }));

  const reportHints = visible
    .filter((row) => row.sourceKind === "special")
    .map((row) => ({
      id: row.canonicalFindingId?.trim() || row.id,
      articleId: Number.isFinite(row.primaryArticleId) ? row.primaryArticleId : 0,
      titleAr: row.titleAr ?? "—",
      severity: "info",
      confidence: row.anchorConfidence ?? 1,
      evidenceSnippet: row.evidenceSnippet ?? "",
      startOffsetGlobal: row.startOffsetGlobal ?? null,
      source: "ai",
      primaryArticleId: Number.isFinite(row.primaryArticleId) ? row.primaryArticleId : 0,
      relatedArticleIds: [],
      rationale: row.rationaleAr ?? row.descriptionAr ?? null,
      pillarId: null,
      pageNumber: row.pageNumber ?? undefined,
      reviewStatus: row.reviewStatus,
      reviewedAt: row.reviewedAt ?? undefined,
      policyAtomId: row.primaryAtomId?.trim() || undefined,
    }));

  return { findings, reportHints };
}

function sourcePriority(source?: string | null): number {
  if (source === "manual") return 3;
  if (source === "lexicon_mandatory" || source === "glossary") return 2;
  return 1;
}

export function mapAnalysisFindingsForPdf(
  findings: AnalysisFinding[] | null | undefined,
  findingsByArticle: SummaryArticle[] | null | undefined,
  canonicalFindings?: CanonicalSummaryFinding[] | null
): AnalysisPdfFinding[] {
  const canon = (canonicalFindings || [])
    .filter(Boolean)
    .map((f, idx) => ({
      id: f.canonical_finding_id ?? `canonical-${idx}`,
      articleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0,
      titleAr: f.title_ar ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidence_snippet ?? "",
      startOffsetGlobal: null,
      source:
        f.source === "lexicon_mandatory"
          ? "lexicon_mandatory"
          : f.source === "manual"
            ? "manual"
            : "ai",
      primaryArticleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0,
      relatedArticleIds: f.related_article_ids ?? [],
      rationale: f.rationale ?? null,
      pillarId: f.pillar_id ?? null,
      startLineChunk: f.start_line_chunk ?? undefined,
      endLineChunk: f.end_line_chunk ?? undefined,
      pageNumber: f.page_number ?? undefined,
      policyAtomId: f.primary_policy_atom_id?.trim() || undefined,
    }));
  if (canon.length > 0) return canon;

  const real = (findings || [])
    .filter((f): f is AnalysisFinding => !!f)
    .map((f, idx) => {
      const v3 = ((f.location as Record<string, unknown> | undefined)?.v3 as Record<string, unknown> | undefined) ?? {};
      return {
      id: (v3.canonical_finding_id as string | undefined)
        ?? f.id
        ?? `finding-${idx}`,
      articleId: Number.isFinite(f.articleId) ? f.articleId : 0,
      titleAr: f.titleAr ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidenceSnippet ?? "",
      startOffsetGlobal: f.startOffsetGlobal ?? null,
      source: f.source,
      primaryArticleId: Number(v3.primary_article_id),
      relatedArticleIds: (v3.related_article_ids as number[] | undefined) ?? [],
      rationale: (v3.rationale_ar as string | undefined) ?? null,
      pillarId: (v3.pillar_id as string | undefined) ?? null,
      startLineChunk: f.startLineChunk ?? undefined,
      endLineChunk: f.endLineChunk ?? undefined,
      pageNumber: f.pageNumber ?? undefined,
      reviewStatus: f.reviewStatus ?? undefined,
      reviewedAt: f.reviewedAt ?? undefined,
      policyAtomId: normalizeAtomId(f.atomId, f.articleId) || undefined,
      };
    });

  if (real.length > 0) {
    const deduped = new Map<string, AnalysisPdfFinding>();
    for (const f of real) {
      const key = f.id || `${f.articleId}-${f.evidenceSnippet.slice(0, 80)}`;
      const ex = deduped.get(key);
      if (!ex) {
        deduped.set(key, f);
      } else {
        const currentRank = sourcePriority(ex.source);
        const nextRank = sourcePriority(f.source);
        if (nextRank > currentRank || (nextRank === currentRank && f.confidence > ex.confidence)) {
          deduped.set(key, f);
        }
      }
    }
    return [...deduped.values()];
  }

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
      startOffsetGlobal: null,
      source: "ai",
    }));
  });
}
