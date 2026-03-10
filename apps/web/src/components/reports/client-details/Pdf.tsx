import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate, formatDateTime } from "@/utils/dateFormat";
import { clientDetailsStyles as s } from "./styles";
import type { ClientDetailsScriptRow } from "./mapper";

function clean(v: unknown, max = 40): string {
  const t = String(v ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export interface ClientDetailsSectionPdfProps {
  lang: "ar" | "en";
  dateFormat?: string;
  generatedAt: string;
  coverImageDataUrl?: string | null;
  dashboardLogoUrl?: string;
  client: {
    name: string;
    representative: string;
    email: string;
    phone: string;
    registrationDate: string;
    status: string;
    logoUrl?: string;
  };
  stats: { total: number; approved: number; inReview: number; draft: number };
  rows: ClientDetailsScriptRow[];
}

export const ClientDetailsSectionPdf: React.FC<ClientDetailsSectionPdfProps> = (p) => {
  const isAr = p.lang === "ar";
  const rtl = isAr ? s.rtl : {};
  return (
    <Document>
      <Page size="A4" style={[s.cover, isAr ? s.pageAr : {}]}>
        {p.coverImageDataUrl ? <Image src={p.coverImageDataUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير العميل التفصيلي" : "Client Detailed Report"}</Text>
        <Text style={[s.coverText, rtl]}>{p.client.name}</Text>
        <Text style={[s.coverText, rtl]}>{formatDate(new Date(), { lang: p.lang, format: p.dateFormat })}</Text>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {p.dashboardLogoUrl ? <Image src={p.dashboardLogoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 8 }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "تقرير العميل التفصيلي" : "Client Detailed Report"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? `وقت الإنشاء: ${formatDateTime(new Date(p.generatedAt), { lang: p.lang })}` : `Generated: ${formatDateTime(new Date(p.generatedAt), { lang: p.lang })}`}</Text>
        <View style={s.profile}>
          <Text style={[s.profileLine, rtl]}>{isAr ? `اسم العميل: ${p.client.name}` : `Client Name: ${p.client.name}`}</Text>
          <Text style={[s.profileLine, rtl]}>{isAr ? `المندوب: ${p.client.representative}` : `Representative: ${p.client.representative}`}</Text>
          <Text style={[s.profileLine, rtl]}>{isAr ? `البريد: ${p.client.email}` : `Email: ${p.client.email}`}</Text>
          <Text style={[s.profileLine, rtl]}>{isAr ? `الهاتف: ${p.client.phone}` : `Phone: ${p.client.phone}`}</Text>
          <Text style={[s.profileLine, rtl]}>{isAr ? `تاريخ التسجيل: ${clean(p.client.registrationDate, 16)}` : `Registration: ${clean(p.client.registrationDate, 16)}`}</Text>
        </View>
        <View style={s.statRow}>
          <View style={s.stat}><Text style={s.statValue}>{p.stats.total}</Text><Text style={s.statLabel}>{isAr ? "إجمالي النصوص" : "Total Scripts"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{p.stats.approved}</Text><Text style={s.statLabel}>{isAr ? "معتمد" : "Approved"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{p.stats.inReview}</Text><Text style={s.statLabel}>{isAr ? "قيد المراجعة" : "In Review"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{p.stats.draft}</Text><Text style={s.statLabel}>{isAr ? "مسودة" : "Draft"}</Text></View>
        </View>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.c1, rtl]}>{isAr ? "العنوان" : "Title"}</Text>
            <Text style={[s.th, s.c2, rtl]}>{isAr ? "النوع" : "Type"}</Text>
            <Text style={[s.th, s.c3, rtl]}>{isAr ? "التاريخ" : "Date"}</Text>
            <Text style={[s.th, s.c4, rtl]}>{isAr ? "المسند إليه" : "Assignee"}</Text>
            <Text style={[s.th, s.c5, rtl]}>{isAr ? "تقارير" : "Reports"}</Text>
            <Text style={[s.th, s.c6, rtl]}>{isAr ? "الحالة" : "Status"}</Text>
          </View>
          {p.rows.map((r, idx) => (
            <View key={`row-${idx}`} style={s.tr}>
              <Text style={[s.td, s.c1, rtl]}>{clean(r.title, 28)}</Text>
              <Text style={[s.td, s.c2, rtl]}>{clean(r.type, 10)}</Text>
              <Text style={[s.td, s.c3, rtl]}>{clean(r.date, 14)}</Text>
              <Text style={[s.td, s.c4, rtl]}>{clean(r.assignee, 24)}</Text>
              <Text style={[s.td, s.c5, rtl]}>{String(r.reportsCount)}</Text>
              <Text style={[s.td, s.c6, rtl]}>{clean(r.status, 20)}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
};
