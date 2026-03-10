import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate, formatDateLong } from "@/utils/dateFormat";
import { analysisStyles as s } from "./styles";
import type { AnalysisPdfFinding } from "./mapper";

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
  const groups = data.findings.reduce<Record<number, AnalysisPdfFinding[]>>((acc, f) => {
    const key = Number.isFinite(f.articleId) ? f.articleId : 0;
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  const sevCount = data.findings.reduce<Record<string, number>>((acc, f) => {
    const k = (f.severity || "info").toLowerCase();
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return (
    <Document>
      <Page size="A4" style={[s.cover, isAr ? s.pageAr : {}]}>
        {coverImageDataUrl ? (
          <Image src={coverImageDataUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
        <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير التحليل" : "Analysis Report"}</Text>
        <Text style={[s.coverText, rtl]}>{data.scriptTitle}</Text>
        <Text style={[s.coverText, rtl]}>{isAr ? `العميل: ${data.clientName}` : `Client: ${data.clientName}`}</Text>
        <Text style={[s.coverText, rtl]}>
          {dateFormat ? formatDate(new Date(data.createdAt), { lang: isAr ? "ar" : "en", format: dateFormat }) : formatDateLong(new Date(data.createdAt), { lang: isAr ? "ar" : "en" })}
        </Text>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {logoUrl ? <Image src={logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 10 }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "تفاصيل التقرير" : "Report Details"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? `النص: ${data.scriptTitle}` : `Script: ${data.scriptTitle}`}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? `إجمالي الملاحظات: ${data.findings.length}` : `Total findings: ${data.findings.length}`}</Text>

        <View style={s.row}>
          <View style={s.stat}><Text style={s.statValue}>{sevCount.critical || 0}</Text><Text style={s.statLabel}>{isAr ? "حرجة" : "Critical"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{sevCount.high || 0}</Text><Text style={s.statLabel}>{isAr ? "عالية" : "High"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{sevCount.medium || 0}</Text><Text style={s.statLabel}>{isAr ? "متوسطة" : "Medium"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{sevCount.low || 0}</Text><Text style={s.statLabel}>{isAr ? "منخفضة" : "Low"}</Text></View>
        </View>

        <Text style={[s.sectionTitle, rtl]}>{isAr ? "تفاصيل القضايا" : "Findings Details"}</Text>
        {Object.entries(groups).map(([articleId, list]) => (
          <View key={articleId} style={s.articleWrap}>
            <Text style={[s.articleHeader, rtl]}>{isAr ? `مادة ${articleId}` : `Article ${articleId}`}</Text>
            {list.map((f, idx) => (
              <View key={`${f.id}-${idx}`} style={s.finding}>
                <Text style={[s.findingTitle, rtl]}>{f.titleAr || "—"}</Text>
                <Text style={[s.findingMeta, rtl]}>
                  {(f.severity || "info").toUpperCase()} | {isAr ? "ثقة" : "Conf"} {Math.round((f.confidence || 0) * 100)}%
                </Text>
                <Text style={[s.findingBody, rtl]}>"{f.evidenceSnippet || ""}"</Text>
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
};
