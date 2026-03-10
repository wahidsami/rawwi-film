import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate } from "@/utils/dateFormat";
import { glossaryStyles as s } from "./styles";
import type { GlossaryPdfRow } from "./mapper";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function clean(v: unknown, max = 42): string {
  const t = String(v ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export const GlossarySectionPdf: React.FC<{
  rows: GlossaryPdfRow[];
  total: number;
  soft: number;
  mandatory: number;
  lang: "ar" | "en";
  dateFormat?: string;
  generatedAt: string;
  coverImageDataUrl?: string | null;
  logoUrl?: string;
}> = (p) => {
  const isAr = p.lang === "ar";
  const rtl = isAr ? s.rtl : {};
  return (
    <Document>
      <Page size="A4" wrap={false} style={[s.cover, isAr ? s.pageAr : {}]}>
        <View style={{ width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
          {p.coverImageDataUrl ? (
            <Image
              src={p.coverImageDataUrl}
              style={{ position: "absolute", top: -2, left: -2, width: A4_WIDTH + 4, height: A4_HEIGHT + 4, objectFit: "cover" }}
            />
          ) : null}
          <View style={{ position: "absolute", left: 44, right: 44, bottom: 92 }}>
            <View style={s.coverMetaBlock}>
              <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير المصطلحات" : "Glossary Report"}</Text>
              <Text style={[s.coverText, rtl]}>{formatDate(new Date(p.generatedAt), { lang: p.lang, format: p.dateFormat })}</Text>
            </View>
          </View>
        </View>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {p.logoUrl ? <Image src={p.logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 8 }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "تقرير المصطلحات" : "Glossary Report"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? "ملخص الإحصائيات" : "Summary"}</Text>
        <View style={s.statRow}>
          <View style={s.stat}><Text style={s.statValue}>{p.total}</Text><Text style={s.statLabel}>{isAr ? "إجمالي المصطلحات" : "Total Terms"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{p.soft}</Text><Text style={s.statLabel}>{isAr ? "إشارات تنبيهية" : "Soft Signals"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{p.mandatory}</Text><Text style={s.statLabel}>{isAr ? "مخالفات إلزامية" : "Mandatory"}</Text></View>
        </View>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.c1, rtl]}>{isAr ? "المصطلح" : "Term"}</Text>
            <Text style={[s.th, s.c2, rtl]}>{isAr ? "النوع" : "Type"}</Text>
            <Text style={[s.th, s.c3, rtl]}>{isAr ? "التصنيف" : "Category"}</Text>
            <Text style={[s.th, s.c4, rtl]}>{isAr ? "الخطورة" : "Severity"}</Text>
            <Text style={[s.th, s.c5, rtl]}>{isAr ? "وضع التنفيذ" : "Mode"}</Text>
            <Text style={[s.th, s.c6, rtl]}>{isAr ? "المادة" : "Article"}</Text>
          </View>
          {p.rows.map((r, idx) => (
            <View key={`g-${idx}`} style={s.tr}>
              <Text style={[s.td, s.c1, rtl]}>{clean(r.term, 22)}{r.description ? `\n${clean(r.description, 26)}` : ""}</Text>
              <Text style={[s.td, s.c2, rtl]}>{clean(r.type, 12)}</Text>
              <Text style={[s.td, s.c3, rtl]}>{clean(r.category, 14)}</Text>
              <Text style={[s.td, s.c4, rtl]}>{clean(r.severity, 10)}</Text>
              <Text style={[s.td, s.c5, rtl]}>{clean(r.mode, 12)}</Text>
              <Text style={[s.td, s.c6, rtl]}>{clean(r.article, 30)}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
};
