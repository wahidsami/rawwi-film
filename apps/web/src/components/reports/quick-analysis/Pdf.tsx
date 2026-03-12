import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate, formatDateLong } from "@/utils/dateFormat";
import { getPolicyArticle } from "@/data/policyMap";
import { quickAnalysisStyles as s } from "./styles";
import type { QuickAnalysisPdfFinding } from "./mapper";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

type QuickPdfHint = {
  id: string;
  articleId: number;
  titleAr: string;
  severity: string;
  confidence: number;
  evidenceSnippet: string;
  source?: string;
  primaryArticleId?: number;
  relatedArticleIds?: number[];
  rationale?: string | null;
};

export const QuickAnalysisPdf: React.FC<{
  scriptTitle: string;
  createdAt: string;
  findings: QuickAnalysisPdfFinding[];
  reportHints?: QuickPdfHint[];
  lang: "ar" | "en";
  dateFormat?: string;
  logoUrl?: string;
  coverImageDataUrl?: string | null;
}> = ({ scriptTitle, createdAt, findings, reportHints = [], lang, dateFormat, logoUrl, coverImageDataUrl }) => {
  const isAr = lang === "ar";
  const rtl = isAr ? s.rtl : {};
  const safeFindings = (findings || []).filter(Boolean).map((f, idx) => ({
    ...f,
    id: f.id ?? `quick-f-${idx}`,
    articleId: Number.isFinite(f.articleId) ? f.articleId : 0,
    titleAr: f.titleAr ?? "—",
    severity: f.severity ?? "info",
    confidence: f.confidence ?? 0,
    evidenceSnippet: f.evidenceSnippet ?? "",
  }));
  const groups = safeFindings.reduce<Record<number, QuickAnalysisPdfFinding[]>>((acc, f) => {
    if (!acc[f.articleId]) acc[f.articleId] = [];
    acc[f.articleId].push(f);
    return acc;
  }, {});
  const sevCount = safeFindings.reduce<Record<string, number>>((acc, f) => {
    const k = (f.severity || "info").toLowerCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const sourceLabel = (source?: string) => source === "manual" ? (isAr ? "يدوي" : "Manual") : source === "lexicon_mandatory" || source === "glossary" ? (isAr ? "معجم" : "Glossary") : (isAr ? "تحليل آلي" : "AI Analysis");
  const articleLabel = (articleId: number) => {
    const art = getPolicyArticle(articleId);
    if (!art) return isAr ? `مادة ${articleId}` : `Article ${articleId}`;
    return isAr ? `مادة ${articleId}: ${art.title_ar}` : `Article ${articleId}: ${art.title_ar}`;
  };
  const sevStyle = (sev?: string) => {
    const k = (sev || "info").toLowerCase();
    if (k === "critical") return s.chipSeverityCritical;
    if (k === "high") return s.chipSeverityHigh;
    if (k === "medium") return s.chipSeverityMedium;
    if (k === "low") return s.chipSeverityLow;
    return s.chipInfo;
  };

  return (
    <Document>
      <Page size="A4" wrap={false} style={[s.cover, isAr ? s.pageAr : {}]}>
        <View style={{ width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
          {coverImageDataUrl ? <Image src={coverImageDataUrl} style={{ position: "absolute", top: -2, left: -2, width: A4_WIDTH + 4, height: A4_HEIGHT + 4, objectFit: "cover" }} /> : null}
          <View style={{ position: "absolute", left: 44, right: 44, bottom: 92 }}>
            <View style={s.coverMetaBlock}>
              <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير التحليل السريع" : "Quick Analysis Report"}</Text>
              <Text style={[s.coverText, rtl]}>{scriptTitle}</Text>
              <Text style={[s.coverText, rtl]}>
                {dateFormat ? formatDate(new Date(createdAt), { lang, format: dateFormat }) : formatDateLong(new Date(createdAt), { lang })}
              </Text>
            </View>
          </View>
        </View>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {logoUrl ? <Image src={logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 10 }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "تفاصيل التقرير" : "Report Details"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? `النص: ${scriptTitle}` : `Script: ${scriptTitle}`}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? `إجمالي الملاحظات: ${safeFindings.length}` : `Total findings: ${safeFindings.length}`}</Text>
        <View style={s.statRow}>
          <View style={s.statCard}><Text style={s.statValue}>{sevCount.critical || 0}</Text><Text style={s.statLabel}>{isAr ? "حرجة" : "Critical"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{sevCount.high || 0}</Text><Text style={s.statLabel}>{isAr ? "عالية" : "High"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{sevCount.medium || 0}</Text><Text style={s.statLabel}>{isAr ? "متوسطة" : "Medium"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{sevCount.low || 0}</Text><Text style={s.statLabel}>{isAr ? "منخفضة" : "Low"}</Text></View>
        </View>
        <Text style={[s.sectionTitle, rtl]}>{isAr ? "تفاصيل القضايا" : "Findings Details"}</Text>
        {Object.keys(groups).length === 0 ? (
          <View style={s.emptyState}>
            <Text style={[s.emptyStateTitle, rtl]}>{isAr ? "لا توجد مخالفات" : "No Violations Found"}</Text>
            <Text style={[s.emptyStateText, rtl]}>
              {isAr ? "هذا النص لا يحتوي على مخالفات ضد مواد GCAM وفق نتائج التحليل الحالية." : "This script has no violations against GCAM articles based on the current analysis results."}
            </Text>
          </View>
        ) : Object.entries(groups).map(([articleId, list]) => (
          <View key={articleId} style={s.articleWrap}>
            <Text style={[s.articleHeader, rtl]}>
              {isAr ? `مادة ${articleId}: ${getPolicyArticle(Number(articleId))?.title_ar ?? ""}` : `Article ${articleId}${getPolicyArticle(Number(articleId))?.title_ar ? ` - ${getPolicyArticle(Number(articleId))?.title_ar}` : ""}`}
            </Text>
            {list.filter(Boolean).map((f, idx) => {
              const primaryId = f.primaryArticleId ?? f.articleId;
              const relatedIds = (f.relatedArticleIds ?? []).filter((id) => id !== primaryId);
              return (
                <View key={`${f?.id ?? `quick-finding-${idx}`}-${idx}`} style={s.finding}>
                  <Text style={[s.findingTitle, rtl]}>{f.titleAr || "—"}</Text>
                  <Text style={[s.findingSnippet, rtl]}>{isAr ? "النص المخالف: " : "Violation text: "}"{f.evidenceSnippet || "—"}"</Text>
                  <View style={[s.findingChipsRow, { flexDirection: isAr ? "row-reverse" : "row" }]}>
                    <Text style={[s.chip, s.chipInfo]}>{sourceLabel(f.source)}</Text>
                    <Text style={[s.chip, sevStyle(f.severity)]}>{(f.severity || "info").toUpperCase()}</Text>
                    <Text style={[s.chip, s.chipInfo]}>{isAr ? "الثقة" : "Confidence"} {Math.round((f.confidence || 0) * 100)}%</Text>
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
                  {Number.isFinite(primaryId) && (
                    <Text style={[s.findingMeta, rtl]}>
                      {isAr ? "المادة الأساسية: " : "Primary article: "}{articleLabel(primaryId)}
                    </Text>
                  )}
                  {relatedIds.length > 0 && (
                    <Text style={[s.findingMeta, rtl]}>
                      {isAr ? "مواد مرتبطة: " : "Related articles: "}{relatedIds.map(articleLabel).join(isAr ? "، " : ", ")}
                    </Text>
                  )}
                  {f.pillarId && (
                    <Text style={[s.findingMeta, rtl]}>
                      {isAr ? "المحور: " : "Pillar: "}{f.pillarId}
                    </Text>
                  )}
                  <Text style={[s.findingRationaleLabel, rtl]}>
                    {isAr ? "لماذا اعتُبرت مخالفة:" : "Why considered a violation:"}
                  </Text>
                  <Text style={[s.findingRationaleText, rtl]}>{f.rationale ?? (isAr ? "—" : "—")}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {(reportHints?.length ?? 0) > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={[s.sectionTitle, rtl]}>{isAr ? "ملاحظات خاصة" : "Special notes"}</Text>
            <Text style={[s.findingMeta, rtl]}>
              {isAr
                ? "هذه النقاط ليست مخالفات؛ يُنصح بمراعاتها عند التصوير (مثلاً ضوابط المظهر العام والقيم الإسلامية)."
                : "These are not violations; consider them when filming (e.g. modesty and Islamic guidelines)."}
            </Text>
            {(reportHints ?? []).filter(Boolean).map((f, idx) => (
              <View key={`quick-hint-${f.id ?? idx}`} style={[s.finding, { backgroundColor: "#f0f9ff", borderColor: "#7dd3fc", marginTop: 8 }]}>
                <Text style={[s.findingTitle, rtl]}>{isAr ? "ملاحظة" : "Note"}</Text>
                <Text style={[s.findingSnippet, rtl]}>
                  {isAr ? "النص: " : "Text: "}"{f.evidenceSnippet || "—"}"
                </Text>
                <View style={[s.findingChipsRow, { flexDirection: isAr ? "row-reverse" : "row" }]}>
                  <Text style={[s.chip, s.chipInfo]}>{isAr ? "ملاحظة" : "Note"}</Text>
                  <Text style={[s.chip, s.chipInfo]}>{isAr ? "الثقة" : "Conf"} {Math.round((f.confidence || 0) * 100)}%</Text>
                </View>
                {f.primaryArticleId != null && (
                  <Text style={[s.findingMeta, rtl]}>
                    {isAr ? "المادة: " : "Article: "}{articleLabel(f.primaryArticleId)}
                  </Text>
                )}
                <Text style={[s.findingRationaleLabel, rtl]}>
                  {isAr ? "لماذا ليست مخالفة: " : "Why not a violation: "}
                </Text>
                <Text style={[s.findingRationaleText, rtl]}>{f.rationale ?? "—"}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};
