import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ScriptJourneyPayload } from "@/api";

const fontBase = typeof window !== "undefined" ? window.location.origin : "";

Font.register({
  family: "JourneyCairo",
  fonts: [
    { src: `${fontBase}/fonts/Cairo-Regular.ttf` },
    { src: `${fontBase}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" },
  ],
});

const s = StyleSheet.create({
  page: { paddingTop: 24, paddingHorizontal: 24, paddingBottom: 20, fontSize: 10, color: "#1f2937" },
  pageAr: { fontFamily: "JourneyCairo" },
  cover: { flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 14, padding: 24, backgroundColor: "#faf7fb" },
  coverTitle: { fontSize: 24, fontWeight: "bold", color: "#4b1d44", marginBottom: 10 },
  coverSub: { fontSize: 13, color: "#6b7280", marginBottom: 6 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4, color: "#4b1d44" },
  subtitle: { fontSize: 11, color: "#6b7280", marginBottom: 12 },
  section: { marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 8, color: "#4b1d44" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  key: { color: "#6b7280" },
  value: { color: "#111827", fontWeight: "bold", maxWidth: "68%" },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: "48%", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 8, backgroundColor: "#fff" },
  cardLabel: { fontSize: 9, color: "#6b7280" },
  cardValue: { fontSize: 14, fontWeight: "bold", color: "#111827", marginTop: 2 },
  tableHead: { flexDirection: "row", backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  th: { flex: 1, padding: 6, fontWeight: "bold", borderRightWidth: 1, borderRightColor: "#e5e7eb" },
  tr: { flexDirection: "row", borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#e5e7eb" },
  td: { flex: 1, padding: 6, borderRightWidth: 1, borderRightColor: "#e5e7eb" },
  small: { fontSize: 8, color: "#6b7280" },
  rtl: { textAlign: "right" },
});

function fmt(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function safe(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function ordered<T>(arr: T[], isAr: boolean): T[] {
  return isAr ? [...arr].reverse() : arr;
}

export function ScriptJourneyPdf({ data, lang, logoUrl }: { data: ScriptJourneyPayload; lang: "ar" | "en"; logoUrl?: string }) {
  const isAr = lang === "ar";
  const rtl = isAr ? s.rtl : {};
  const beneficiaryName = isAr
    ? (data.beneficiary.nameAr || data.beneficiary.nameEn || "-")
    : (data.beneficiary.nameEn || data.beneficiary.nameAr || "-");

  const cycleRows = data.findingsEvolution || [];
  const timelineRows = (data.timeline || []).slice(0, 40);
  const adminRows = (data.adminActivity || []).slice(0, 20);

  return (
    <Document>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        <View style={s.cover}>
          {logoUrl ? (
            <Image src={logoUrl} style={{ width: 110, height: 34, objectFit: "contain", marginBottom: 12, alignSelf: isAr ? "flex-end" : "flex-start" }} />
          ) : null}
          <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير رحلة النص" : "Script Journey Report"}</Text>
          <Text style={[s.coverSub, rtl]}>{isAr ? "من الاستلام حتى القرار النهائي" : "From submission to final decision"}</Text>
          <Text style={[s.title, { marginTop: 10 }, rtl]}>{safe(data.script.title)}</Text>
          <Text style={[s.coverSub, rtl]}>{isAr ? `معرّف النص: ${safe(data.script.id)}` : `Script ID: ${safe(data.script.id)}`}</Text>
          <Text style={[s.coverSub, rtl]}>{isAr ? `المستفيد: ${beneficiaryName}` : `Beneficiary: ${beneficiaryName}`}</Text>
          <Text style={[s.coverSub, rtl]}>{isAr ? `القرار النهائي: ${safe(data.decision.status)}` : `Final decision: ${safe(data.decision.status)}`}</Text>
          <Text style={[s.coverSub, rtl]}>{isAr ? `تاريخ القرار: ${fmt(data.decision.decidedAt)}` : `Decision date: ${fmt(data.decision.decidedAt)}`}</Text>
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {logoUrl ? <Image src={logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 10, alignSelf: isAr ? "flex-end" : "flex-start" }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "الملخص التنفيذي" : "Executive Summary"}</Text>
        <Text style={[s.subtitle, rtl]}>{safe(data.script.title)}</Text>

        <View style={s.cards}>
          <View style={s.card}><Text style={[s.cardLabel, rtl]}>{isAr ? "إجمالي الدورات" : "Total Cycles"}</Text><Text style={[s.cardValue, rtl]}>{safe(data.summary.totalCycles)}</Text></View>
          <View style={s.card}><Text style={[s.cardLabel, rtl]}>{isAr ? "إجمالي الأيام" : "Total Days"}</Text><Text style={[s.cardValue, rtl]}>{safe(data.summary.totalProcessDays)}</Text></View>
          <View style={s.card}><Text style={[s.cardLabel, rtl]}>{isAr ? "مخالفات البداية" : "Initial Findings"}</Text><Text style={[s.cardValue, rtl]}>{safe(data.summary.firstFindingsCount)}</Text></View>
          <View style={s.card}><Text style={[s.cardLabel, rtl]}>{isAr ? "مخالفات النهاية" : "Final Findings"}</Text><Text style={[s.cardValue, rtl]}>{safe(data.summary.finalFindingsCount)}</Text></View>
        </View>

        <View style={s.section}>
          <Text style={[s.sectionTitle, rtl]}>{isAr ? "بيانات الإرسال" : "Submission Snapshot"}</Text>
          <View style={s.row}><Text style={[s.key, rtl]}>{isAr ? "المستفيد" : "Beneficiary"}</Text><Text style={[s.value, rtl]}>{beneficiaryName}</Text></View>
          <View style={s.row}><Text style={[s.key, rtl]}>{isAr ? "نوع المستفيد" : "Beneficiary Type"}</Text><Text style={[s.value, rtl]}>{safe(data.beneficiary.type)}</Text></View>
          <View style={s.row}><Text style={[s.key, rtl]}>{isAr ? "تاريخ الاستلام" : "Received At"}</Text><Text style={[s.value, rtl]}>{fmt(data.script.receivedAt)}</Text></View>
          <View style={s.row}><Text style={[s.key, rtl]}>{isAr ? "نوع الإنتاج" : "Production Type"}</Text><Text style={[s.value, rtl]}>{safe(data.script.type)}</Text></View>
          <View style={s.row}><Text style={[s.key, rtl]}>{isAr ? "تصنيف العمل" : "Work Classification"}</Text><Text style={[s.value, rtl]}>{safe(data.script.workClassification)}</Text></View>
        </View>

        <View style={s.section}>
          <Text style={[s.sectionTitle, rtl]}>{isAr ? "تطور المخالفات عبر الدورات" : "Findings Evolution"}</Text>
          <View style={s.tableHead}>
            {ordered([
              <Text key="h1" style={[s.th, rtl]}>{isAr ? "الدورة" : "Cycle"}</Text>,
              <Text key="h2" style={[s.th, rtl]}>{isAr ? "الأساس" : "Baseline"}</Text>,
              <Text key="h3" style={[s.th, rtl]}>{isAr ? "إعادة التحليل" : "Reanalysis"}</Text>,
              <Text key="h4" style={[s.th, rtl, { borderRightWidth: 0 }]}>{isAr ? "معالجة / مستمرة / جديدة" : "Resolved / Persisting / New"}</Text>,
            ], isAr)}
          </View>
          {cycleRows.map((row) => {
            const c = row.comparisonSummary?.canonical;
            const vals = [
              <Text key="c1" style={[s.td, rtl]}>{safe(row.cycleNumber)}</Text>,
              <Text key="c2" style={[s.td, rtl]}>{safe(row.sourceFindingsTotal)}</Text>,
              <Text key="c3" style={[s.td, rtl]}>{safe(row.reanalyzedFindingsTotal)}</Text>,
              <Text key="c4" style={[s.td, rtl, { borderRightWidth: 0 }]}>{`${c?.resolved_count ?? 0} / ${c?.persisting_count ?? 0} / ${c?.new_count ?? 0}`}</Text>,
            ];
            return <View key={`ev-${row.cycleNumber}`} style={s.tr}>{ordered(vals, isAr)}</View>;
          })}
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {logoUrl ? <Image src={logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 10, alignSelf: isAr ? "flex-end" : "flex-start" }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "الأنشطة الإدارية" : "Admin Activity"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? "من قام بماذا ومتى" : "Who did what and when"}</Text>

        <View style={s.section}>
          <View style={s.tableHead}>
            {ordered([
              <Text key="ah1" style={[s.th, rtl]}>{isAr ? "الوقت" : "Time"}</Text>,
              <Text key="ah2" style={[s.th, rtl]}>{isAr ? "الإجراء" : "Action"}</Text>,
              <Text key="ah3" style={[s.th, rtl, { borderRightWidth: 0 }]}>{isAr ? "المستخدم" : "Actor"}</Text>,
            ], isAr)}
          </View>
          {adminRows.map((e, idx) => {
            const cells = [
              <Text key="ad1" style={[s.td, rtl]}>{fmt(e.at)}</Text>,
              <Text key="ad2" style={[s.td, rtl]}>{safe(e.type)}</Text>,
              <Text key="ad3" style={[s.td, rtl, { borderRightWidth: 0 }]}>{safe(e.actorName)}</Text>,
            ];
            return <View key={`ad-${idx}`} style={s.tr}>{ordered(cells, isAr)}</View>;
          })}
        </View>

        <Text style={[s.title, rtl]}>{isAr ? "الخط الزمني الكامل" : "Full Timeline"}</Text>
        <View style={s.section}>
          {timelineRows.map((e, idx) => (
            <View key={`tl-${idx}`} style={{ marginBottom: 5, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingBottom: 4 }}>
              <Text style={rtl}>{fmt(e.at)} | {safe(e.type)} | {safe(e.actorName)}</Text>
              {e.note ? <Text style={[s.small, rtl]}>{safe(e.note)}</Text> : null}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
