import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { ScriptJourneyPayload } from "@/api";

const styles: Record<string, any> = {
  page: { padding: 24, fontSize: 10, color: "#1f2937" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  subtitle: { fontSize: 11, color: "#6b7280", marginBottom: 12 },
  section: { marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  key: { color: "#6b7280" },
  value: { color: "#111827", fontWeight: 600 },
  tableHead: { flexDirection: "row", backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  th: { flex: 1, padding: 6, fontWeight: 700, borderRightWidth: 1, borderRightColor: "#e5e7eb" },
  tr: { flexDirection: "row", borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#e5e7eb" },
  td: { flex: 1, padding: 6, borderRightWidth: 1, borderRightColor: "#e5e7eb" },
};

function fmt(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export function ScriptJourneyPdf({ data, lang }: { data: ScriptJourneyPayload; lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const beneficiaryName = isAr ? (data.beneficiary.nameAr || data.beneficiary.nameEn || "-") : (data.beneficiary.nameEn || data.beneficiary.nameAr || "-");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={{ direction: dir }}>
          <Text style={styles.title}>{isAr ? "تقرير رحلة النص" : "Script Journey Report"}</Text>
          <Text style={styles.subtitle}>{data.script.title || "-"}</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isAr ? "الملخص التنفيذي" : "Executive Summary"}</Text>
            <View style={styles.row}><Text style={styles.key}>{isAr ? "المستفيد" : "Beneficiary"}</Text><Text style={styles.value}>{beneficiaryName}</Text></View>
            <View style={styles.row}><Text style={styles.key}>{isAr ? "القرار النهائي" : "Final Decision"}</Text><Text style={styles.value}>{data.decision.status || "-"}</Text></View>
            <View style={styles.row}><Text style={styles.key}>{isAr ? "تاريخ القرار" : "Decision Date"}</Text><Text style={styles.value}>{fmt(data.decision.decidedAt)}</Text></View>
            <View style={styles.row}><Text style={styles.key}>{isAr ? "إجمالي الدورات" : "Total Cycles"}</Text><Text style={styles.value}>{String(data.summary.totalCycles ?? 0)}</Text></View>
            <View style={styles.row}><Text style={styles.key}>{isAr ? "المدة الإجمالية (أيام)" : "Total Process Days"}</Text><Text style={styles.value}>{String(data.summary.totalProcessDays ?? "-")}</Text></View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isAr ? "تطور المخالفات عبر الدورات" : "Findings Evolution by Cycle"}</Text>
            <View style={styles.tableHead}>
              <Text style={styles.th}>{isAr ? "الدورة" : "Cycle"}</Text>
              <Text style={styles.th}>{isAr ? "الأساس" : "Baseline"}</Text>
              <Text style={styles.th}>{isAr ? "إعادة التحليل" : "Reanalysis"}</Text>
              <Text style={[styles.th, { borderRightWidth: 0 }]}>{isAr ? "Resolved / Persisting / New" : "Resolved / Persisting / New"}</Text>
            </View>
            {(data.findingsEvolution || []).map((row) => {
              const c = row.comparisonSummary?.canonical;
              return (
                <View key={`ev-${row.cycleNumber}`} style={styles.tr}>
                  <Text style={styles.td}>{String(row.cycleNumber)}</Text>
                  <Text style={styles.td}>{String(row.sourceFindingsTotal ?? 0)}</Text>
                  <Text style={styles.td}>{String(row.reanalyzedFindingsTotal ?? 0)}</Text>
                  <Text style={[styles.td, { borderRightWidth: 0 }]}>{`${c?.resolved_count ?? 0} / ${c?.persisting_count ?? 0} / ${c?.new_count ?? 0}`}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isAr ? "الخط الزمني" : "Lifecycle Timeline"}</Text>
            {(data.timeline || []).slice(0, 20).map((e, idx) => (
              <View key={`tl-${idx}`} style={{ marginBottom: 4 }}>
                <Text>{`${fmt(e.at)}  |  ${e.type}  |  ${e.actorName || "-"}`}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
