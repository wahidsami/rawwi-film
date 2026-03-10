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
  const totalFindings = Object.values(data.findingsBySeverity).reduce((a, b) => a + b, 0) || 1;
  const pct = (v: number, t: number) => `${Math.round((v / t) * 100)}%`;

  return (
    <Document>
      <Page size="A4" wrap={false} style={[s.cover, isAr ? s.pageAr : {}]}>
        <View style={{ width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
          {coverImageDataUrl ? (
            <Image
              src={coverImageDataUrl}
              style={{ position: "absolute", top: 0, left: 0, width: A4_WIDTH, height: A4_HEIGHT, objectFit: "cover" }}
            />
          ) : null}
          <View style={{ position: "absolute", left: 36, right: 36, bottom: 64 }}>
            <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير حالة النظام" : "System Status Report"}</Text>
            <Text style={[s.coverText, rtl]}>
              {formatDate(new Date(generatedAt), { lang, format: dateFormat })}
            </Text>
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
          <View style={s.statCard}><Text style={s.statValue}>{data.highCriticalFindings}</Text><Text style={s.statLabel}>{isAr ? "حرج/عالي" : "Critical/High"}</Text></View>
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

        <Text style={[s.sectionTitle, rtl]}>{isAr ? "تحليل المخاطر" : "Risk Analysis"}</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, rtl]}>{isAr ? "حرج" : "Critical"}</Text>
            <Text style={[s.th, rtl]}>{isAr ? "عالي" : "High"}</Text>
            <Text style={[s.th, rtl]}>{isAr ? "متوسط" : "Medium"}</Text>
            <Text style={[s.th, rtl, { borderRightWidth: 0 }]}>{isAr ? "منخفض" : "Low"}</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, rtl]}>{data.findingsBySeverity.critical} ({pct(data.findingsBySeverity.critical, totalFindings)})</Text>
            <Text style={[s.td, rtl]}>{data.findingsBySeverity.high} ({pct(data.findingsBySeverity.high, totalFindings)})</Text>
            <Text style={[s.td, rtl]}>{data.findingsBySeverity.medium} ({pct(data.findingsBySeverity.medium, totalFindings)})</Text>
            <Text style={[s.td, rtl, { borderRightWidth: 0 }]}>{data.findingsBySeverity.low} ({pct(data.findingsBySeverity.low, totalFindings)})</Text>
          </View>
        </View>

        <Text style={[s.sectionTitle, rtl]}>{isAr ? "الأنشطة الأخيرة" : "Recent Activity"}</Text>
        {data.activities.length === 0 ? (
          <Text style={rtl}>{isAr ? "لا أنشطة حديثة." : "No recent activity."}</Text>
        ) : (
          data.activities.map((a, idx) => (
            <View key={`activity-${idx}`} style={s.activityItem}>
              <Text style={[s.activityTitle, rtl]}>{a.action}</Text>
              <Text style={[s.activityMeta, rtl]}>{a.actor} - {a.time}</Text>
            </View>
          ))
        )}
      </Page>
    </Document>
  );
};
