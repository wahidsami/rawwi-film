import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate, formatDateTime } from "@/utils/dateFormat";
import { auditStyles as s } from "./styles";
import type { AuditPdfRow } from "./mapper";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function clean(v: unknown, max = 52): string {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export const AuditSectionPdf: React.FC<{
  rows: AuditPdfRow[];
  total: number;
  lang: "ar" | "en";
  dateFormat?: string;
  generatedAt: string;
  coverImageDataUrl?: string | null;
}> = (p) => {
  const isAr = p.lang === "ar";
  const rtl = isAr ? s.rtl : {};
  return (
    <Document>
      <Page size="A4" wrap={false} style={[{ backgroundColor: "#1e3a5f", padding: 36 }, isAr ? s.pageAr : {}]}>
        <View style={{ width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
          {p.coverImageDataUrl ? (
            <Image
              src={p.coverImageDataUrl}
              style={{ position: "absolute", top: 0, left: 0, width: A4_WIDTH, height: A4_HEIGHT, objectFit: "cover" }}
            />
          ) : null}
          <View style={{ position: "absolute", left: 36, right: 36, bottom: 64 }}>
            <Text style={[{ color: "#FFF", fontSize: 22, fontWeight: "bold", marginBottom: 8 }, rtl]}>{isAr ? "سجل التدقيق" : "Audit Log Report"}</Text>
            <Text style={[{ color: "#FFF", fontSize: 11, marginBottom: 3 }, rtl]}>
              {formatDate(new Date(p.generatedAt), { lang: p.lang, format: p.dateFormat })}
            </Text>
          </View>
        </View>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        <Text style={[s.title, rtl]}>{isAr ? "سجل التدقيق" : "Audit Log Report"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? "تقرير أحداث النظام" : "System events report"}</Text>
        <View style={s.stat}>
          <Text style={rtl}>{isAr ? `إجمالي السجلات: ${p.total}` : `Total Events: ${p.total}`}</Text>
          <Text style={rtl}>
            {isAr
              ? `تاريخ التقرير: ${formatDate(new Date(p.generatedAt), { lang: p.lang, format: p.dateFormat })}`
              : `Generated: ${formatDateTime(new Date(p.generatedAt), { lang: p.lang })}`}
          </Text>
        </View>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.c1, rtl]}>{isAr ? "الحدث" : "Event"}</Text>
            <Text style={[s.th, s.c2, rtl]}>{isAr ? "المستخدم" : "Who"}</Text>
            <Text style={[s.th, s.c3, rtl]}>{isAr ? "الوقت" : "When"}</Text>
            <Text style={[s.th, s.c4, rtl]}>{isAr ? "الهدف" : "Target"}</Text>
            <Text style={[s.th, s.c5, rtl]}>{isAr ? "النتيجة" : "Result"}</Text>
            <Text style={[s.th, s.c6, rtl]}>{isAr ? "التفاصيل" : "Details"}</Text>
          </View>
          {p.rows.map((r, idx) => (
            <View key={`audit-row-${idx}`} style={s.tr}>
              <Text style={[s.td, s.c1, rtl]}>{clean(r.eventType, 24)}</Text>
              <Text style={[s.td, s.c2, rtl]}>{clean(r.actor, 28)}</Text>
              <Text style={[s.td, s.c3, rtl]}>{clean(r.when, 24)}</Text>
              <Text style={[s.td, s.c4, rtl]}>{clean(r.target, 28)}</Text>
              <Text style={[s.td, s.c5, rtl]}>{clean(r.result, 12)}</Text>
              <Text style={[s.td, s.c6, rtl]}>{clean(r.details, 48)}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
};
