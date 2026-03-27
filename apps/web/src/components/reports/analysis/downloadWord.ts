import type { AnalysisFinding } from "@/api";
import { mapAnalysisFindingsForPdf } from "./mapper";
import { resolveStorageUrl } from "@/utils/storage";

type ReportHint = {
  canonical_finding_id: string;
  title_ar: string;
  evidence_snippet: string;
  severity: string;
  confidence: number;
  rationale?: string | null;
  primary_article_id?: number | null;
};

type ScriptSummary = {
  synopsis_ar: string;
  key_risky_events_ar?: string;
  narrative_stance_ar?: string;
  compliance_posture_ar?: string;
  confidence: number;
};

export interface DownloadAnalysisWordParams {
  scriptTitle: string;
  clientName: string;
  createdAt: string;
  logoUrl?: string | null;
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
    page_number?: number | null;
    primary_policy_atom_id?: string | null;
    source?: string | null;
  }> | null;
  reportHints?: ReportHint[] | null;
  scriptSummary?: ScriptSummary | null;
  lang: "ar" | "en";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function severityLabel(severity: string, lang: "ar" | "en"): string {
  const s = severity.toLowerCase();
  if (lang === "ar") {
    if (s === "critical") return "حرجة";
    if (s === "high") return "عالية";
    if (s === "medium") return "متوسطة";
    if (s === "low") return "منخفضة";
    return "ملاحظة";
  }
  if (s === "critical") return "Critical";
  if (s === "high") return "High";
  if (s === "medium") return "Medium";
  if (s === "low") return "Low";
  return "Note";
}

function formatDate(value: string, lang: "ar" | "en"): string {
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function downloadAnalysisWord(params: DownloadAnalysisWordParams): void {
  const findings = mapAnalysisFindingsForPdf(params.findings, params.findingsByArticle, params.canonicalFindings);
  const reportHints = params.reportHints ?? [];
  const dir = params.lang === "ar" ? "rtl" : "ltr";
  const rawLogo = params.logoUrl?.trim() || "";
  const logoUrl = rawLogo
    ? (rawLogo.startsWith("/") ? `${window.location.origin}${rawLogo}` : resolveStorageUrl(rawLogo))
    : `${window.location.origin}/dashboardlogo.png`;
  const findingsHtml = findings.length === 0
    ? `<p class="empty">${params.lang === "ar" ? "لا توجد مخالفات نهائية في هذا التقرير." : "There are no final violations in this report."}</p>`
    : findings.map((finding) => `
      <div class="finding">
        <div class="finding-head">
          <span class="badge severity-${escapeHtml(finding.severity.toLowerCase())}">${escapeHtml(severityLabel(finding.severity, params.lang))}</span>
          <span class="meta">${params.lang === "ar" ? "مادة" : "Article"} ${escapeHtml(String(finding.primaryArticleId ?? finding.articleId ?? 0))}</span>
          ${finding.pageNumber ? `<span class="meta">${params.lang === "ar" ? "صفحة" : "Page"} ${escapeHtml(String(finding.pageNumber))}</span>` : ""}
        </div>
        <h3>${escapeHtml(finding.titleAr || (params.lang === "ar" ? "مخالفة" : "Finding"))}</h3>
        <p class="snippet">${escapeHtml(finding.evidenceSnippet || "")}</p>
        ${finding.rationale ? `<p class="rationale"><strong>${params.lang === "ar" ? "السبب:" : "Reason:"}</strong> ${escapeHtml(finding.rationale)}</p>` : ""}
      </div>
    `).join("");
  const hintsHtml = reportHints.length === 0
    ? ""
    : `
      <section>
        <h2>${params.lang === "ar" ? "ملاحظات خاصة" : "Special Notes"}</h2>
        ${reportHints.map((hint) => `
          <div class="hint">
            <h3>${escapeHtml(hint.title_ar)}</h3>
            <p class="snippet">${escapeHtml(hint.evidence_snippet || "")}</p>
            ${hint.rationale ? `<p>${escapeHtml(hint.rationale)}</p>` : ""}
          </div>
        `).join("")}
      </section>
    `;

  const html = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(params.scriptTitle)}</title>
    <style>
      body { font-family: Tahoma, Arial, sans-serif; direction: ${dir}; color: #1f2937; margin: 24px; }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 24px; }
      .logo { max-width: 150px; max-height: 48px; object-fit: contain; }
      h1 { font-size: 26px; margin: 0 0 8px; }
      h2 { font-size: 20px; margin: 24px 0 12px; color: #0f172a; }
      h3 { font-size: 16px; margin: 12px 0 8px; }
      .meta-grid { width: 100%; border-collapse: collapse; margin-top: 8px; }
      .meta-grid td { border: 1px solid #e5e7eb; padding: 8px 10px; }
      .finding, .hint { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin-bottom: 12px; background: #fff; }
      .finding-head { margin-bottom: 8px; }
      .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: bold; margin-inline-end: 8px; }
      .severity-critical, .severity-high { background: #fee2e2; color: #b91c1c; }
      .severity-medium { background: #fef3c7; color: #b45309; }
      .severity-low { background: #dbeafe; color: #1d4ed8; }
      .meta { color: #475569; font-size: 12px; margin-inline-end: 8px; }
      .snippet { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 10px; line-height: 1.8; }
      .rationale { margin-top: 10px; line-height: 1.8; }
      .summary { line-height: 1.9; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 12px; }
      .empty { padding: 12px; border: 1px dashed #cbd5e1; border-radius: 10px; color: #64748b; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>${escapeHtml(params.lang === "ar" ? "تقرير التحليل" : "Analysis Report")}</h1>
        <table class="meta-grid">
          <tr><td>${escapeHtml(params.lang === "ar" ? "النص" : "Script")}</td><td>${escapeHtml(params.scriptTitle)}</td></tr>
          <tr><td>${escapeHtml(params.lang === "ar" ? "العميل" : "Client")}</td><td>${escapeHtml(params.clientName)}</td></tr>
          <tr><td>${escapeHtml(params.lang === "ar" ? "التاريخ" : "Date")}</td><td>${escapeHtml(formatDate(params.createdAt, params.lang))}</td></tr>
        </table>
      </div>
      <img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" />
    </div>
    ${params.scriptSummary?.synopsis_ar ? `
      <section>
        <h2>${params.lang === "ar" ? "ملخص النص" : "Script Summary"}</h2>
        <div class="summary">${escapeHtml(params.scriptSummary.synopsis_ar)}</div>
      </section>
    ` : ""}
    <section>
      <h2>${params.lang === "ar" ? "المخالفات النهائية" : "Final Findings"}</h2>
      ${findingsHtml}
    </section>
    ${hintsHtml}
  </body>
  </html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const safeTitle = (params.scriptTitle || (params.lang === "ar" ? "تقرير" : "report"))
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const datePart = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `raawi_report_${safeTitle}_${datePart}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
