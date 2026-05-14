import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate } from "@/utils/dateFormat";
import { statusStyles as s } from "./styles";
import type { StatusPdfData } from "./mapper";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export interface StatusSectionPdfProps {
  data: StatusPdfData;
  lang: "ar" | "en";
  dateFormat?: string;
  generatedAt: string;
  coverImageDataUrl?: string | null;
  logoUrl?: string;
}

export const StatusSectionPdf: React.FC<StatusSectionPdfProps> = ({
  data,
  lang,
  dateFormat,
  generatedAt,
  coverImageDataUrl,
  logoUrl,
}) => {
  const isAr = lang === "ar";
  const rtl = isAr ? s.rtl : {};
  const totalScripts = Object.values(data.scriptsByStatus).reduce((a, b) => a + b, 0) || 1;
  const totalFindings = Object.values(data.findingsByType).reduce((a, b) => a + b, 0) || 1;
  const pct = (v: number, t: number) => `${Math.round((v / t) * 100)}%`;
  const scriptStatusHeaders = [
    { ar: "النص", en: "Script" },
    { ar: "المستفيد", en: "Beneficiary" },
    { ar: "تاريخ الاستلام", en: "Received" },
    { ar: "الحالة", en: "Status" },
    { ar: "تاريخ الموافقة/الرفض", en: "Approved/Rejected Date" },
  ];
  const scriptStatusCells = (row: StatusPdfData["scriptRows"][number]) => [
    row.scriptTitle,
    row.beneficiaryName,
    row.receivedAt,
    row.status,
    row.approvedOrRejectedAt,
  ];
  const orderedScriptHeaders = isAr ? [...scriptStatusHeaders].reverse() : scriptStatusHeaders;

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
              <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير حالة النظام" : "System Status Report"}</Text>
              <Text style={[s.coverText, rtl]}>
                {formatDate(new Date(generatedAt), { lang, format: dateFormat })}
              </Text>
            </View>
          </View>
        </View>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {logoUrl ? <Image src={logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 10 }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "تقرير حالة النظام" : "System Status Report"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? "ملخص تنفيذي" : "Executive Summary"}</Text>
        <View style={s.statRow}>
          <View style={s.statCard}><Text style={s.statValue}>{data.pendingTasks}</Text><Text style={s.statLabel}>{isAr ? "مهام معلقة" : "Pending Tasks"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{data.scriptsInReview}</Text><Text style={s.statLabel}>{isAr ? "قيد المراجعة" : "In Review"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{data.reportsThisMonth}</Text><Text style={s.statLabel}>{isAr ? "تقارير الشهر" : "This Month"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{data.totalFindings}</Text><Text style={s.statLabel}>{isAr ? "إجمالي الملاحظات" : "Total Findings"}</Text></View>
        </View>
        <View style={s.statRow}>
          <View style={s.statCard}><Text style={s.statValue}>{data.totalBeneficiaries}</Text><Text style={s.statLabel}>{isAr ? "إجمالي المستفيدين" : "Total Beneficiaries"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{data.beneficiariesThisMonth}</Text><Text style={s.statLabel}>{isAr ? "انضموا هذا الشهر" : "Joined This Month"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{data.totalCompanies}</Text><Text style={s.statLabel}>{isAr ? "شركات" : "Companies"}</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{data.totalIndividuals}</Text><Text style={s.statLabel}>{isAr ? "أفراد" : "Individuals"}</Text></View>
        </View>

        <Text style={[s.sectionTitle, rtl]}>{isAr ? "توزيع حالات النصوص" : "Script Status"}</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, rtl]}>{isAr ? "مسودة" : "Draft"}</Text>
            <Text style={[s.th, rtl]}>{isAr ? "معين" : "Assigned"}</Text>
            <Text style={[s.th, rtl]}>{isAr ? "مراجعة" : "Review"}</Text>
            <Text style={[s.th, rtl, { borderRightWidth: 0 }]}>{isAr ? "مكتمل" : "Completed"}</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, rtl]}>{data.scriptsByStatus.draft} ({pct(data.scriptsByStatus.draft, totalScripts)})</Text>
            <Text style={[s.td, rtl]}>{data.scriptsByStatus.assigned} ({pct(data.scriptsByStatus.assigned, totalScripts)})</Text>
            <Text style={[s.td, rtl]}>{data.scriptsByStatus.review_required} ({pct(data.scriptsByStatus.review_required, totalScripts)})</Text>
            <Text style={[s.td, rtl, { borderRightWidth: 0 }]}>{data.scriptsByStatus.completed} ({pct(data.scriptsByStatus.completed, totalScripts)})</Text>
          </View>
        </View>

        <Text style={[s.sectionTitle, rtl]}>{isAr ? "أنواع الملاحظات" : "Finding Types"}</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, rtl]}>{isAr ? "آلية" : "AI"}</Text>
            <Text style={[s.th, rtl]}>{isAr ? "قاموس" : "Glossary"}</Text>
            <Text style={[s.th, rtl]}>{isAr ? "يدوية" : "Manual"}</Text>
            <Text style={[s.th, rtl, { borderRightWidth: 0 }]}>{isAr ? "خاصة" : "Special"}</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, rtl]}>{data.findingsByType.ai} ({pct(data.findingsByType.ai, totalFindings)})</Text>
            <Text style={[s.td, rtl]}>{data.findingsByType.glossary} ({pct(data.findingsByType.glossary, totalFindings)})</Text>
            <Text style={[s.td, rtl]}>{data.findingsByType.manual} ({pct(data.findingsByType.manual, totalFindings)})</Text>
            <Text style={[s.td, rtl, { borderRightWidth: 0 }]}>{data.findingsByType.special} ({pct(data.findingsByType.special, totalFindings)})</Text>
          </View>
        </View>

        <Text style={[s.sectionTitle, rtl]}>{isAr ? "قائمة النصوص وحالتها" : "Scripts Status List"}</Text>
        <View style={s.table}>
          <View style={s.tr}>
            {orderedScriptHeaders.map((h, idx) => (
              <Text key={`script-h-${idx}`} style={[s.th, rtl, idx === orderedScriptHeaders.length - 1 ? { borderRightWidth: 0 } : {}]}>
                {isAr ? h.ar : h.en}
              </Text>
            ))}
          </View>
          {data.scriptRows.length === 0 ? (
            <View style={s.tr}>
              <Text style={[s.td, rtl, { borderRightWidth: 0, flex: 5 }]}>{isAr ? "لا توجد نصوص" : "No scripts"}</Text>
            </View>
          ) : (
            data.scriptRows.map((row, idx) => {
              const cells = scriptStatusCells(row);
              const ordered = isAr ? [...cells].reverse() : cells;
              return (
                <View key={`script-row-${idx}`} style={s.tr}>
                  {ordered.map((cell, cellIdx) => (
                    <Text key={`script-c-${idx}-${cellIdx}`} style={[s.td, rtl, cellIdx === ordered.length - 1 ? { borderRightWidth: 0 } : {}]}>
                      {cell}
                    </Text>
                  ))}
                </View>
              );
            })
          )}
        </View>
      </Page>
    </Document>
  );
};
