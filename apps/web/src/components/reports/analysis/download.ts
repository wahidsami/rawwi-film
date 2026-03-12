import React from "react";
import { pdf } from "@react-pdf/renderer";
import { AnalysisSectionPdf } from "./Pdf";
import { mapAnalysisFindingsForPdf } from "./mapper";
import type { AnalysisFinding } from "@/api";

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

export interface DownloadAnalysisPdfParams {
  scriptTitle: string;
  clientName: string;
  createdAt: string;
  findings?: AnalysisFinding[] | null;
  findingsByArticle?: Array<{ article_id: number; top_findings?: Array<{ title_ar?: string; severity?: string; confidence?: number; evidence_snippet?: string }> }> | null;
  canonicalFindings?: Array<{
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
  }> | null;
  reportHints?: Array<{
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
  }> | null;
  scriptSummary?: {
    synopsis_ar: string;
    key_risky_events_ar?: string;
    narrative_stance_ar?: string;
    compliance_posture_ar?: string;
    confidence: number;
  } | null;
  lang: "ar" | "en";
  dateFormat?: string;
}

export async function downloadAnalysisPdf(params: DownloadAnalysisPdfParams): Promise<void> {
  const origin = window.location.origin;
  const findings = mapAnalysisFindingsForPdf(params.findings, params.findingsByArticle, params.canonicalFindings);
  const reportHintsMapped = (params.reportHints || []).map((f, idx) => ({
    id: f.canonical_finding_id ?? `hint-${idx}`,
    articleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0,
    titleAr: f.title_ar ?? "—",
    severity: "info" as const,
    confidence: f.confidence ?? 0,
    evidenceSnippet: f.evidence_snippet ?? "",
    source: "ai" as const,
    primaryArticleId: Number.isFinite(f.primary_article_id) ? (f.primary_article_id as number) : 0,
    relatedArticleIds: f.related_article_ids ?? [],
    rationale: f.rationale ?? null,
    pillarId: f.pillar_id ?? null,
    startLineChunk: f.start_line_chunk ?? undefined,
    endLineChunk: f.end_line_chunk ?? undefined,
  }));
  const [coverImageDataUrl, logoDataUrl] = await Promise.all([
    toDataUrl(`${origin}/cover.jpg`),
    toDataUrl(`${origin}/dashboardlogo.png`),
  ]);
  const doc = React.createElement(AnalysisSectionPdf, {
    data: {
      scriptTitle: params.scriptTitle,
      clientName: params.clientName,
      createdAt: params.createdAt,
      findings,
      reportHints: reportHintsMapped,
      scriptSummary: params.scriptSummary ?? undefined,
      lang: params.lang,
    },
    dateFormat: params.dateFormat,
    logoUrl: logoDataUrl ?? undefined,
    coverImageDataUrl,
  });
  const blob = await pdf(doc).toBlob();
  const objectUrl = URL.createObjectURL(blob);
  const safeTitle = (params.scriptTitle || (params.lang === "ar" ? "تقرير" : "report"))
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const datePart = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `raawi_report_${safeTitle}_${datePart}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
