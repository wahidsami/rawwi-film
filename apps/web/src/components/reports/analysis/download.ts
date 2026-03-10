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
  lang: "ar" | "en";
  dateFormat?: string;
}

export async function downloadAnalysisPdf(params: DownloadAnalysisPdfParams): Promise<void> {
  const origin = window.location.origin;
  const findings = mapAnalysisFindingsForPdf(params.findings, params.findingsByArticle);
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
