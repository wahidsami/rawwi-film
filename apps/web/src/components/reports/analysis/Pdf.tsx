import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate, formatDateLong } from "@/utils/dateFormat";
import { getPolicyArticle } from "@/data/policyMap";
import { analysisStyles as s } from "./styles";
import type { AnalysisPdfFinding } from "./mapper";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export interface ScriptSummaryForPdf {
  synopsis_ar: string;
  key_risky_events_ar?: string;
  narrative_stance_ar?: string;
  compliance_posture_ar?: string;
  confidence: number;
}

export interface RevisitMentionPdf {
  term: string;
  snippet: string;
  start_offset: number;
  end_offset: number;
}

export interface AnalysisSectionPdfData {
  jobId?: string;
  scriptTitle: string;
  clientName: string;
  createdAt: string;
  findings: AnalysisPdfFinding[];
  reportHints?: AnalysisPdfFinding[];
  scriptSummary?: ScriptSummaryForPdf | null;
  wordsToRevisit?: RevisitMentionPdf[];
  lang?: "ar" | "en";
}

export interface AnalysisSectionPdfProps {
  data: AnalysisSectionPdfData;
  dateFormat?: string;
  logoUrl?: string;
  coverImageDataUrl?: string | null;
}

export const AnalysisSectionPdf: React.FC<AnalysisSectionPdfProps> = ({
  data,
  dateFormat,
  logoUrl,
  coverImageDataUrl,
}) => {
  const isAr = data.lang === "ar";
  const rtl = isAr ? s.rtl : {};
  const safeFindings: AnalysisPdfFinding[] = (data.findings || [])
    .filter((f): f is AnalysisPdfFinding => !!f)
    .map((f, idx) => ({
      ...f,
      id: f.id ?? `finding-${idx}`,
      articleId: Number.isFinite(f.articleId) ? f.articleId : 0,
      titleAr: f.titleAr ?? "—",
      severity: f.severity ?? "info",
      confidence: f.confidence ?? 0,
      evidenceSnippet: f.evidenceSnippet ?? "",
    }));

  const groups = safeFindings.reduce<Record<number, AnalysisPdfFinding[]>>((acc, f) => {
    const key = Number.isFinite(f.primaryArticleId) ? (f.primaryArticleId as number) : (Number.isFinite(f.articleId) ? f.articleId : 0);
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  const sevCount = safeFindings.reduce<Record<string, number>>((acc, f) => {
    const k = (f.severity || "info").toLowerCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const sourceLabel = (source?: string) => {
    if (source === "manual") return isAr ? "يدوي" : "Manual";
    if (source === "lexicon_mandatory" || source === "glossary") return isAr ? "معجم" : "Glossary";
    return isAr ? "تحليل آلي" : "AI Analysis";
  };

  const severityBadgeStyle = (severity?: string) => {
    const sKey = (severity || "info").toLowerCase();
    if (sKey === "critical") return s.chipSeverityCritical;
    if (sKey === "high") return s.chipSeverityHigh;
    if (sKey === "medium") return s.chipSeverityMedium;
    if (sKey === "low") return s.chipSeverityLow;
    return s.chipInfo;
  };

  const articleLabel = (articleId: number) => {
    const art = getPolicyArticle(articleId);
    if (!art) return isAr ? `مادة ${articleId}` : `Article ${articleId}`;
    return isAr ? `مادة ${articleId}: ${art.title_ar}` : `Article ${articleId}: ${art.title_ar}`;
  };

  return (
    <Document>
      <Page size="A4" wrap={false} style={[s.cover, isAr ? s.pageAr : {}]}>
        <View style={{ width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
          {coverImageDataUrl ? (
            <Image
              src={coverImageDataUrl}
              style={{ position: "absolute", top: -2, left: -2, width: A4_WIDTH + 4, height: A4_HEIGHT + 4, objectFit: "cover" }}
            />
          ) : null}
          <View style={{ position: "absolute", left: 44, right: 44, bottom: 92 }}>
            <View style={s.coverMetaBlock}>
              <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير التحليل" : "Analysis Report"}</Text>
              <Text style={[s.coverText, rtl]}>{data.scriptTitle}</Text>
              <Text style={[s.coverText, rtl]}>{isAr ? `العميل: ${data.clientName}` : `Client: ${data.clientName}`}</Text>
              <Text style={[s.coverText, rtl]}>
                {dateFormat ? formatDate(new Date(data.createdAt), { lang: isAr ? "ar" : "en", format: dateFormat }) : formatDateLong(new Date(data.createdAt), { lang: isAr ? "ar" : "en" })}
              </Text>
            </View>
          </View>
        </View>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {logoUrl ? <Image src={logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 10 }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "تفاصيل التقرير" : "Report Details"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? `النص: ${data.scriptTitle}` : `Script: ${data.scriptTitle}`}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? `إجمالي الملاحظات: ${safeFindings.length}` : `Total findings: ${safeFindings.length}`}</Text>

        <View style={s.row}>
          <View style={s.stat}><Text style={s.statValue}>{sevCount.critical || 0}</Text><Text style={s.statLabel}>{isAr ? "حرجة" : "Critical"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{sevCount.high || 0}</Text><Text style={s.statLabel}>{isAr ? "عالية" : "High"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{sevCount.medium || 0}</Text><Text style={s.statLabel}>{isAr ? "متوسطة" : "Medium"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{sevCount.low || 0}</Text><Text style={s.statLabel}>{isAr ? "منخفضة" : "Low"}</Text></View>
        </View>

        {data.scriptSummary && (
          <View style={{ marginBottom: 14 }}>
            <Text style={[s.sectionTitle, rtl]}>{isAr ? "فهم النص (ملخص الذكاء الاصطناعي)" : "Script understanding (AI summary)"}</Text>
            <Text style={[s.findingBody, rtl]}>{data.scriptSummary.synopsis_ar}</Text>
            {data.scriptSummary.key_risky_events_ar ? (
              <Text style={[s.findingMeta, rtl]}>{isAr ? "أهم المشاهد الحساسة: " : "Key risky events: "}{data.scriptSummary.key_risky_events_ar}</Text>
            ) : null}
            {data.scriptSummary.narrative_stance_ar ? (
              <Text style={[s.findingMeta, rtl]}>{isAr ? "موقف السرد: " : "Narrative stance: "}{data.scriptSummary.narrative_stance_ar}</Text>
            ) : null}
            {data.scriptSummary.compliance_posture_ar ? (
              <Text style={[s.findingMeta, rtl]}>{isAr ? "انطباع الامتثال: " : "Compliance posture: "}{data.scriptSummary.compliance_posture_ar}</Text>
            ) : null}
            <Text style={[s.findingMeta, rtl]}>{isAr ? "ثقة الملخص: " : "Summary confidence: "}{Math.round((data.scriptSummary.confidence ?? 0) * 100)}%</Text>
          </View>
        )}

        <Text style={[s.sectionTitle, rtl]}>{isAr ? "تفاصيل القضايا" : "Findings Details"}</Text>
        {Object.keys(groups).length === 0 ? (
          <View style={s.emptyState}>
            <Text style={[s.emptyStateTitle, rtl]}>
              {isAr ? "لا توجد مخالفات" : "No Violations Found"}
            </Text>
            <Text style={[s.emptyStateText, rtl]}>
              {isAr
                ? "هذا النص لا يحتوي على مخالفات ضد مواد GCAM وفق نتائج التحليل الحالية."
                : "This script has no violations against GCAM articles based on the current analysis results."}
            </Text>
          </View>
        ) : Object.entries(groups).map(([articleId, list]) => (
          <View key={articleId} style={s.articleWrap}>
            <Text style={[s.articleHeader, rtl]}>
              {isAr
                ? `مادة ${articleId}: ${getPolicyArticle(Number(articleId))?.title_ar ?? ""}`
                : `Article ${articleId}${getPolicyArticle(Number(articleId))?.title_ar ? ` - ${getPolicyArticle(Number(articleId))?.title_ar}` : ""}`}
            </Text>
            {list.filter(Boolean).map((f, idx) => {
              const primaryId = f.primaryArticleId ?? f.articleId;
              const relatedIds = (f.relatedArticleIds ?? []).filter((id) => id !== primaryId);
              return (
                <View key={`${f?.id ?? `finding-${idx}`}-${idx}`} style={s.finding}>
                  <Text style={[s.findingTitle, rtl]}>{f.titleAr || "—"}</Text>
                  <Text style={[s.findingSnippet, rtl]}>
                    {isAr ? "النص المخالف: " : "Violation text: "}
                    "{f.evidenceSnippet || "—"}"
                  </Text>
                  <View style={[s.findingChipsRow, { flexDirection: isAr ? "row-reverse" : "row" }]}>
                    <Text style={[s.chip, s.chipInfo]}>{sourceLabel(f.source)}</Text>
                    <Text style={[s.chip, severityBadgeStyle(f.severity)]}>{(f.severity || "info").toUpperCase()}</Text>
                    <Text style={[s.chip, s.chipInfo]}>
                      {isAr ? "الثقة" : "Confidence"} {Math.round((f.confidence || 0) * 100)}%
                    </Text>
                  </View>
                  <Text style={[s.findingMeta, rtl]}>
                    {isAr ? "النوع: " : "Type: "}{sourceLabel(f.source)}
                  </Text>
                  {f.startLineChunk != null && (
                    <Text style={[s.findingMeta, rtl]}>
                      {isAr
                        ? `السطر ${f.startLineChunk}${f.endLineChunk ? `-${f.endLineChunk}` : ""}`
                        : `Line ${f.startLineChunk}${f.endLineChunk ? `-${f.endLineChunk}` : ""}`}
                    </Text>
                  )}
                  <Text style={[s.findingMeta, rtl]}>
                    {isAr ? "المادة الأساسية: " : "Primary article: "}
                    {articleLabel(primaryId)}
                  </Text>
                  {relatedIds.length > 0 && (
                    <Text style={[s.findingMeta, rtl]}>
                      {isAr ? "مواد مرتبطة: " : "Related articles: "}
                      {relatedIds.map(articleLabel).join(isAr ? "، " : ", ")}
                    </Text>
                  )}
                  {f.pillarId ? (
                    <Text style={[s.findingMeta, rtl]}>
                      {isAr ? "المحور: " : "Pillar: "}
                      {f.pillarId}
                    </Text>
                  ) : null}
                  <Text style={[s.findingRationaleLabel, rtl]}>
                    {isAr ? "لماذا اعتُبرت مخالفة:" : "Why considered a violation:"}
                  </Text>
                  <Text style={[s.findingRationaleText, rtl]}>{f.rationale || "—"}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {((data.reportHints ?? []).length > 0) && (
          <View style={{ marginTop: 16 }}>
            <Text style={[s.sectionTitle, rtl]}>{isAr ? "ملاحظات خاصة" : "Special notes"}</Text>
            <Text style={[s.findingMeta, rtl]}>
              {isAr
                ? "هذه النقاط ليست مخالفات؛ يُنصح بمراعاتها عند التصوير (مثلاً ضوابط المظهر العام والقيم الإسلامية)."
                : "These are not violations; consider them when filming (e.g. modesty and Islamic guidelines)."}
            </Text>
            {(data.reportHints ?? []).filter(Boolean).map((f, idx) => (
              <View key={`hint-${f.id ?? idx}`} style={[s.finding, { backgroundColor: "#f0f9ff", borderColor: "#7dd3fc", marginTop: 8 }]}>
                <Text style={[s.findingTitle, rtl]}>{isAr ? "ملاحظة" : "Note"}</Text>
                <Text style={[s.findingSnippet, rtl]}>
                  {isAr ? "النص: " : "Text: "}
                  "{f.evidenceSnippet || "—"}"
                </Text>
                <View style={[s.findingChipsRow, { flexDirection: isAr ? "row-reverse" : "row" }]}>
                  <Text style={[s.chip, s.chipInfo]}>{isAr ? "ملاحظة" : "Note"}</Text>
                  <Text style={[s.chip, s.chipInfo]}>{isAr ? "الثقة" : "Conf"} {Math.round((f.confidence || 0) * 100)}%</Text>
                </View>
                {f.primaryArticleId ? (
                  <Text style={[s.findingMeta, rtl]}>
                    {isAr ? "المادة: " : "Article: "}
                    {f.primaryArticleId}
                  </Text>
                ) : null}
                <Text style={[s.findingBody, rtl]}>
                  {isAr ? "لماذا ليست مخالفة: " : "Why not a violation: "}
                  {f.rationale || "—"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {((data.wordsToRevisit ?? []).length > 0) && (
          <View style={{ marginTop: 16 }}>
            <Text style={[s.sectionTitle, rtl]}>{isAr ? "كلمات / عبارات للمراجعة" : "Words / phrases to revisit"}</Text>
            <Text style={[s.findingMeta, rtl]}>
              {isAr
                ? "ظهور الكلمات أو العبارات التالية في النص (للمراجعة عند التصوير — لا تُحسب مخالفات)."
                : "The following words or phrases appear in the script (for review when filming — not counted as violations)."}
            </Text>
            {(data.wordsToRevisit ?? []).filter(Boolean).map((m, idx) => (
              <View key={`revisit-${idx}-${m.term}`} style={[s.finding, { backgroundColor: "#f9fafb", borderColor: "#e5e7eb", marginTop: 6 }]}>
                <Text style={[s.findingTitle, rtl]}>{m.term}</Text>
                <Text style={[s.findingSnippet, rtl]}>"{m.snippet || "—"}"</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};
