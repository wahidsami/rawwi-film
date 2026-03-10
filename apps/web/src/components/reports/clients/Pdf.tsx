import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDate } from "@/utils/dateFormat";
import { clientsStyles as s } from "./styles";
import type { ClientPdfRow } from "./mapper";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function safeText(v: unknown, max = 34): string {
  const t = String(v ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export interface ClientsSectionPdfProps {
  rows: ClientPdfRow[];
  totalClients: number;
  totalScripts: number;
  avgScripts: number;
  activeClients: number;
  lang: "ar" | "en";
  dateFormat?: string;
  generatedAt: string;
  coverImageDataUrl?: string | null;
  logoUrl?: string;
}

export const ClientsSectionPdf: React.FC<ClientsSectionPdfProps> = (props) => {
  const isAr = props.lang === "ar";
  const rtl = isAr ? s.rtl : {};
  const dateStr = formatDate(new Date(props.generatedAt), { lang: props.lang, format: props.dateFormat });
  return (
    <Document>
      <Page size="A4" wrap={false} style={[s.cover, isAr ? s.pageAr : {}]}>
        <View style={{ width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
          {props.coverImageDataUrl ? (
            <Image
              src={props.coverImageDataUrl}
              style={{ position: "absolute", top: 0, left: 0, width: A4_WIDTH, height: A4_HEIGHT, objectFit: "cover" }}
            />
          ) : null}
          <View style={{ position: "absolute", left: 36, right: 36, bottom: 64 }}>
            <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير محفظة العملاء" : "Clients Portfolio Report"}</Text>
            <Text style={[s.coverText, rtl]}>{dateStr}</Text>
          </View>
        </View>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {props.logoUrl ? <Image src={props.logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 10 }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "تقرير محفظة العملاء" : "Clients Portfolio Report"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? "الملخص التنفيذي" : "Executive Summary"}</Text>
        <View style={s.statRow}>
          <View style={s.stat}><Text style={s.statValue}>{props.totalClients}</Text><Text style={s.statLabel}>{isAr ? "إجمالي العملاء" : "Total Clients"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{props.totalScripts}</Text><Text style={s.statLabel}>{isAr ? "إجمالي النصوص" : "Total Scripts"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{props.avgScripts}</Text><Text style={s.statLabel}>{isAr ? "متوسط النصوص" : "Avg Scripts"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{props.activeClients}</Text><Text style={s.statLabel}>{isAr ? "عملاء نشطون" : "Active Clients"}</Text></View>
        </View>

        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.col1, rtl]}>{isAr ? "اسم العميل" : "Client Name"}</Text>
            <Text style={[s.th, s.col2, rtl]}>{isAr ? "المندوب" : "Representative"}</Text>
            <Text style={[s.th, s.col3, rtl]}>{isAr ? "الاتصال" : "Contact"}</Text>
            <Text style={[s.th, s.col4, rtl]}>{isAr ? "التسجيل" : "Registration"}</Text>
            <Text style={[s.th, s.col5, rtl]}>{isAr ? "النصوص" : "Scripts"}</Text>
            <Text style={[s.th, s.col6, rtl]}>{isAr ? "الحالة" : "Status"}</Text>
          </View>
          {props.rows.map((row, idx) => (
            <View key={`client-row-${idx}`} style={[s.tr, idx % 2 ? s.rowEven : {}]}>
              <Text style={[s.td, s.col1, rtl]}>{safeText(row.name, 26)}{row.nameSecondary ? `\n${safeText(row.nameSecondary, 26)}` : ""}</Text>
              <Text style={[s.td, s.col2, rtl]}>{safeText(row.representative, 20)}</Text>
              <Text style={[s.td, s.col3, rtl]}>{safeText(row.email, 24)}{"\n"}{safeText(row.phone, 18)}</Text>
              <Text style={[s.td, s.col4, rtl]}>{safeText(row.registrationDate, 14)}</Text>
              <Text style={[s.td, s.col5, rtl]}>{String(row.scriptsCount || 0)}</Text>
              <Text style={[s.td, s.col6, rtl]}>{safeText(row.status, 14)}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
};
