import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate, formatDateLong } from "@/utils/dateFormat";
import { getPolicyArticle } from "@/data/policyMap";
import {
  getPrimarySemanticCategory,
  getSemanticCategoriesForChecklist,
  categoryLabel,
  type SemanticCategoryId,
} from "@/data/semanticCategories";
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

  const groups = safeFindings.reduce<Partial<Record<SemanticCategoryId, AnalysisPdfFinding[]>>>((acc, f) => {
    const aid = Number.isFinite(f.primaryArticleId)
      ? (f.primaryArticleId as number)
      : Number.isFinite(f.articleId)
        ? f.articleId
        : 0;
    const key = getPrimarySemanticCategory(aid, f.policyAtomId, f.policyAtomId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});
  const categoryOrder = getSemanticCategoriesForChecklist();

  const typeCounts = safeFindings.reduce(
    (acc, f) => {
      if (f.source === "manual") acc.manual++;
      else if (f.source === "lexicon_mandatory" || f.source === "glossary") acc.glossary++;
      else acc.ai++;
      return acc;
    },
    { ai: 0, manual: 0, glossary: 0 },
  );
  const specialNotesCount = (data.reportHints ?? []).length;

  const sourceLabel = (source?: string) => {
    if (source === "manual") return isAr ? "يدوي" : "Manual";
    if (source === "lexicon_mandatory" || source === "glossary") return isAr ? "معجم" : "Glossary";
    return isAr ? "تحليل آلي" : "AI Analysis";
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
          <View style={s.stat}><Text style={s.statValue}>{typeCounts.ai}</Text><Text style={s.statLabel}>{isAr ? "ملاحظات آلية" : "AI findings"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{typeCounts.glossary}</Text><Text style={s.statLabel}>{isAr ? "مطابقات القاموس" : "Glossary findings"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{typeCounts.manual}</Text><Text style={s.statLabel}>{isAr ? "ملاحظات يدوية" : "Manual findings"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{specialNotesCount}</Text><Text style={s.statLabel}>{isAr ? "ملاحظات خاصة" : "Special notes"}</Text></View>
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
        ) : (
          categoryOrder
            .map((cat) => {
              const list = groups[cat.id];
              if (!list?.length) return null;
              return (
          <View key={cat.id} style={s.articleWrap}>
            <Text style={[s.articleHeader, rtl]}>
              {categoryLabel(cat.id, isAr ? "ar" : "en")}
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
                    <Text style={[s.chip, s.chipInfo]}>
                      {isAr ? "الثقة" : "Confidence"} {Math.round((f.confidence || 0) * 100)}%
                    </Text>
                  </View>
                  <Text style={[s.findingMeta, rtl]}>
                    {isAr ? "النوع: " : "Type: "}{sourceLabel(f.source)}
                  </Text>
                  {(f.pageNumber != null && f.pageNumber > 0) && (
                    <Text style={[s.findingMeta, rtl]}>
                      {isAr ? `صفحة ${f.pageNumber}` : `Page ${f.pageNumber}`}
                    </Text>
                  )}
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
        );
            })
            .filter(Boolean)
        )}

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

      </Page>
    </Document>
  );
};
