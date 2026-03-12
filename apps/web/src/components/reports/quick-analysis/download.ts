import React from "react";
import { pdf } from "@react-pdf/renderer";
import type { AnalysisFinding } from "@/api";
import { mapQuickAnalysisFindingsForPdf, type CanonicalFindingForQuickPdf } from "./mapper";
import { QuickAnalysisPdf } from "./Pdf";

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

type ReportHintForQuickPdf = {
  canonical_finding_id?: string;
  title_ar?: string;
  evidence_snippet?: string;
  severity?: string;
  confidence?: number;
  rationale?: string | null;
  primary_article_id?: number | null;
  related_article_ids?: number[];
};

export async function downloadQuickAnalysisPdf(params: {
  scriptTitle: string;
  clientName?: string;
  createdAt: string;
  findings?: AnalysisFinding[] | null;
  findingsByArticle?: Array<{ article_id: number; top_findings?: Array<{ title_ar?: string; severity?: string; confidence?: number; evidence_snippet?: string; rationale?: string | null }> }> | null;
  canonicalFindings?: CanonicalFindingForQuickPdf[] | null;
  reportHints?: ReportHintForQuickPdf[] | null;
  lang: "ar" | "en";
  dateFormat?: string;
}): Promise<void> {
  const origin = window.location.origin;
  const [coverImageDataUrl, logoUrl] = await Promise.all([
    toDataUrl(`${origin}/cover.jpg`),
    toDataUrl(`${origin}/dashboardlogo.png`),
  ]);
  const findings = mapQuickAnalysisFindingsForPdf(
    params.findings,
    params.findingsByArticle,
    params.canonicalFindings
  );
  const reportHintsMapped = (params.reportHints ?? []).map((f, idx) => ({
    id: f.canonical_finding_id ?? `hint-${idx}`,
    articleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0,
    titleAr: f.title_ar ?? "—",
    severity: "info" as const,
    confidence: f.confidence ?? 0,
    evidenceSnippet: f.evidence_snippet ?? "",
    source: "ai" as const,
    primaryArticleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : undefined,
    relatedArticleIds: f.related_article_ids ?? [],
    rationale: f.rationale ?? null,
  }));
  const doc = React.createElement(QuickAnalysisPdf, {
    scriptTitle: params.scriptTitle,
    createdAt: params.createdAt,
    findings,
    reportHints: reportHintsMapped,
    lang: params.lang,
    dateFormat: params.dateFormat,
    logoUrl: logoUrl ?? undefined,
    coverImageDataUrl,
  });
  const blob = await pdf(doc).toBlob();
  const objectUrl = URL.createObjectURL(blob);
  const safeTitle = (params.scriptTitle || (params.lang === "ar" ? "تحليل_سريع" : "quick_analysis"))
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `quick_analysis_${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
