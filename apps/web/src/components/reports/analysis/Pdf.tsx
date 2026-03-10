import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate, formatDateLong } from "@/utils/dateFormat";
import { getPolicyArticle } from "@/data/policyMap";
import { analysisStyles as s } from "./styles";
import type { AnalysisPdfFinding } from "./mapper";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export interface AnalysisSectionPdfData {
  jobId?: string;
  scriptTitle: string;
  clientName: string;
  createdAt: string;
  findings: AnalysisPdfFinding[];
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
    const key = Number.isFinite(f.articleId) ? f.articleId : 0;
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
            {list.filter(Boolean).map((f, idx) => (
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
                  {f.startLineChunk != null
                    ? (isAr
                      ? `السطر ${f.startLineChunk}${f.endLineChunk ? `-${f.endLineChunk}` : ""}`
                      : `Line ${f.startLineChunk}${f.endLineChunk ? `-${f.endLineChunk}` : ""}`)
                    : ""}
                </Text>
                <Text style={[s.findingBody, rtl]}>{isAr ? "الوصف: " : "Description: "}{f.titleAr || "—"}</Text>
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
};
