import type { AnalysisFinding } from "@/api";
import { mapAnalysisFindingsForPdf } from "./mapper";

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
  scriptType?: string | null;
  workClassification?: string | null;
  pageCount?: number | null;
  episodeCount?: number | null;
  receivedAt?: string | null;
  deliveredAt?: string | null;
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

function plainText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function formatNullableDate(value: string | null | undefined, lang: "ar" | "en"): string {
  const text = plainText(value);
  return text ? formatDate(text, lang) : "—";
}

function formatNullableValue(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text || "—";
}

function normalizeScriptType(value: string | null | undefined, lang: "ar" | "en"): string {
  const raw = plainText(value).toLowerCase();
  if (!raw) return "—";
  if (lang === "ar") {
    if (raw === "film") return "فلم";
    if (raw === "series") return "مسلسل";
  } else {
    if (raw === "film") return "Film";
    if (raw === "series") return "Series";
  }
  return plainText(value);
}

function buildFindingAction(params: {
  severity: string;
  source?: string | null;
  lang: "ar" | "en";
}): string {
  const severity = (params.severity ?? "").toLowerCase();
  if (params.lang === "ar") {
    if (params.source === "manual") return "مراجعة يدوية واتخاذ الإجراء المناسب";
    if (severity === "critical" || severity === "high") return "تعديل جوهري أو حذف قبل الاعتماد";
    if (severity === "medium") return "تعديل الصياغة أو تخفيف المعالجة";
    if (severity === "low") return "مراجعة المشهد والتأكد من ملاءمته";
    return "مراجعة واتخاذ الإجراء المناسب";
  }
  if (params.source === "manual") return "Manual review and appropriate action";
  if (severity === "critical" || severity === "high") return "Major edit or removal before approval";
  if (severity === "medium") return "Adjust wording or soften treatment";
  if (severity === "low") return "Review the scene and confirm suitability";
  return "Review and take the appropriate action";
}

function buildOverallRecommendations(args: {
  findings: ReturnType<typeof mapAnalysisFindingsForPdf>;
  reportHints: ReportHint[];
  lang: "ar" | "en";
}): string[] {
  const severityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const finding of args.findings) {
    const key = (finding.severity ?? "").toLowerCase() as keyof typeof severityCounts;
    if (key in severityCounts) severityCounts[key]++;
  }

  const recommendations: string[] = [];
  if (args.lang === "ar") {
    if (severityCounts.critical > 0 || severityCounts.high > 0) {
      recommendations.push("إعادة معالجة الملاحظات عالية الأولوية قبل اعتماد النص أو رفعه بصيغته النهائية.");
    }
    if (severityCounts.medium > 0) {
      recommendations.push("مراجعة المقاطع متوسطة الخطورة وتخفيف الصياغات أو المعالجة الدرامية حيث يلزم.");
    }
    if (severityCounts.low > 0 && recommendations.length === 0) {
      recommendations.push("مراجعة الملاحظات الواردة والتأكد من ملاءمتها قبل التنفيذ أو المشاركة.");
    }
    if (args.reportHints.length > 0) {
      recommendations.push("مراعاة الملاحظات الخاصة والتنبيهات السياقية أثناء التنفيذ حتى لو لم تُصنف كمخالفة مباشرة.");
    }
    if (recommendations.length === 0) {
      recommendations.push("لا توجد توصيات إضافية بخلاف الاستمرار في المراجعة النهائية قبل الاعتماد.");
    }
  } else {
    if (severityCounts.critical > 0 || severityCounts.high > 0) {
      recommendations.push("Address high-priority findings before final approval or submission.");
    }
    if (severityCounts.medium > 0) {
      recommendations.push("Review medium-severity findings and soften wording or treatment where needed.");
    }
    if (severityCounts.low > 0 && recommendations.length === 0) {
      recommendations.push("Review the listed findings and confirm they remain suitable before execution.");
    }
    if (args.reportHints.length > 0) {
      recommendations.push("Keep the special notes in mind during production even when they are not direct violations.");
    }
    if (recommendations.length === 0) {
      recommendations.push("No additional recommendations beyond final editorial review.");
    }
  }

  return recommendations;
}

export function downloadAnalysisWord(params: DownloadAnalysisWordParams): void {
  const findings = mapAnalysisFindingsForPdf(params.findings, params.findingsByArticle, params.canonicalFindings);
  const reportHints = params.reportHints ?? [];
  const recommendations = buildOverallRecommendations({ findings, reportHints, lang: params.lang });
  const dir = params.lang === "ar" ? "rtl" : "ltr";
  const rawLogo = params.logoUrl?.trim() || `${window.location.origin}/loginlogo.png`;
  const logoUrl = rawLogo.startsWith("/") ? `${window.location.origin}${rawLogo}` : rawLogo;

  const findingsRowsHtml = findings.length === 0
    ? `<tr><td colspan="3" class="empty-cell">${escapeHtml(params.lang === "ar" ? "لا توجد ملاحظات نهائية في هذا التقرير." : "There are no final findings in this report.")}</td></tr>`
    : findings.map((finding) => `
      <tr>
        <td class="page-cell">${escapeHtml(formatNullableValue(finding.pageNumber ?? "—"))}</td>
        <td class="text-cell">
          <div class="finding-title">${escapeHtml(finding.titleAr || (params.lang === "ar" ? "ملاحظة" : "Finding"))}</div>
          <div class="finding-snippet">${escapeHtml(plainText(finding.evidenceSnippet) || "—")}</div>
        </td>
        <td class="action-cell">${escapeHtml(buildFindingAction({
          severity: finding.severity,
          source: finding.source ?? null,
          lang: params.lang,
        }))}</td>
      </tr>
    `).join("");

  const recommendationsHtml = recommendations.map((item, index) => `
    <div class="recommendation-item">${escapeHtml(String(index + 1))}- ${escapeHtml(item)}</div>
  `).join("");

  const specialNotesHtml = reportHints.length === 0
    ? ""
    : `
      <div class="notes-block">
        <div class="notes-title">${params.lang === "ar" ? "ملاحظات خاصة:" : "Special Notes:"}</div>
        ${reportHints.map((hint, index) => `
          <div class="note-item">
            ${escapeHtml(String(index + 1))}. ${escapeHtml(plainText(hint.evidence_snippet) || hint.title_ar || "")}
            ${hint.rationale ? ` - ${escapeHtml(plainText(hint.rationale))}` : ""}
          </div>
        `).join("")}
      </div>
    `;

  const html = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(params.scriptTitle)}</title>
    <style>
      @page { size: A4; margin: 22mm 16mm 18mm 16mm; }
      body { font-family: Tahoma, Arial, sans-serif; direction: ${dir}; color: #111827; margin: 0; font-size: 12pt; line-height: 1.7; }
      .cover-page { min-height: 260mm; page-break-after: always; }
      .cover-logo-wrap { text-align: center; margin-top: 10mm; margin-bottom: 14mm; }
      .cover-logo { max-width: 190px; max-height: 88px; object-fit: contain; }
      .cover-title { text-align: center; font-size: 18pt; font-weight: 700; margin: 0 0 12mm; }
      .cover-grid { width: 100%; border-collapse: collapse; margin-top: 8mm; }
      .cover-grid td { padding: 8px 0; vertical-align: top; }
      .cover-label { width: 28%; font-weight: 700; }
      .cover-value { border-bottom: 1px solid #111827; min-height: 20px; padding-inline-start: 8px; }
      .table-page { min-height: 260mm; }
      .section-title { font-size: 16pt; font-weight: 700; margin: 0 0 10mm; text-align: center; }
      table.report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .report-table th, .report-table td { border: 1px solid #111827; padding: 10px 8px; vertical-align: top; }
      .report-table th { background: #ffffff; font-size: 13pt; font-weight: 700; text-align: center; }
      .page-cell { width: 16%; text-align: center; }
      .text-cell { width: 54%; }
      .action-cell { width: 30%; }
      .finding-title { font-weight: 700; margin-bottom: 4px; }
      .finding-snippet { white-space: pre-wrap; word-break: break-word; }
      .empty-cell { text-align: center; color: #6b7280; padding: 18px 8px; }
      .recommendations-wrap { margin-top: 20mm; }
      .recommendations-title { font-size: 14pt; font-weight: 700; margin-bottom: 8mm; }
      .recommendation-item, .note-item { margin-bottom: 6px; }
      .notes-block { margin-top: 10mm; }
      .notes-title { font-weight: 700; margin-bottom: 6mm; }
    </style>
  </head>
  <body>
    <div class="cover-page">
      <div class="cover-logo-wrap">
        <img class="cover-logo" src="${escapeHtml(logoUrl)}" alt="Saudi Film Commission Logo" />
      </div>
      <div class="cover-title">${escapeHtml(params.lang === "ar" ? "تقرير الملاحظات" : "Findings Report")}</div>
      <table class="cover-grid">
        <tr><td class="cover-label">${escapeHtml(params.lang === "ar" ? "اسم العمل:" : "Work Title:")}</td><td class="cover-value">${escapeHtml(formatNullableValue(params.scriptTitle))}</td></tr>
        <tr><td class="cover-label">${escapeHtml(params.lang === "ar" ? "نوع العمل:" : "Work Type:")}</td><td class="cover-value">${escapeHtml(normalizeScriptType(params.scriptType, params.lang))}</td></tr>
        <tr><td class="cover-label">${escapeHtml(params.lang === "ar" ? "تصنيف العمل:" : "Work Classification:")}</td><td class="cover-value">${escapeHtml(formatNullableValue(params.workClassification))}</td></tr>
        <tr><td class="cover-label">${escapeHtml(params.lang === "ar" ? "عدد الصفحات:" : "Page Count:")}</td><td class="cover-value">${escapeHtml(formatNullableValue(params.pageCount))}</td></tr>
        <tr><td class="cover-label">${escapeHtml(params.lang === "ar" ? "عدد الحلقات:" : "Episode Count:")}</td><td class="cover-value">${escapeHtml(formatNullableValue(params.episodeCount))}</td></tr>
        <tr><td class="cover-label">${escapeHtml(params.lang === "ar" ? "تاريخ الاستلام:" : "Received Date:")}</td><td class="cover-value">${escapeHtml(formatNullableDate(params.receivedAt, params.lang))}</td></tr>
        <tr><td class="cover-label">${escapeHtml(params.lang === "ar" ? "تاريخ التسليم:" : "Delivery Date:")}</td><td class="cover-value">${escapeHtml(formatNullableDate(params.deliveredAt ?? params.createdAt, params.lang))}</td></tr>
      </table>
    </div>
    <div class="table-page">
      <div class="section-title">${escapeHtml(params.lang === "ar" ? "جدول الملاحظات" : "Findings Table")}</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>${escapeHtml(params.lang === "ar" ? "الصفحة" : "Page")}</th>
            <th>${escapeHtml(params.lang === "ar" ? "النص" : "Text")}</th>
            <th>${escapeHtml(params.lang === "ar" ? "الإجراء" : "Action")}</th>
          </tr>
        </thead>
        <tbody>
          ${findingsRowsHtml}
        </tbody>
      </table>
    </div>
    <div class="recommendations-wrap">
      <div class="recommendations-title">${escapeHtml(params.lang === "ar" ? "التوصيات والتوجيهات/" : "Recommendations / Guidance")}</div>
      ${recommendationsHtml}
      ${specialNotesHtml}
    </div>
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
