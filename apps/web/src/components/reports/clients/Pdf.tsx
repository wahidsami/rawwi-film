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
  totalCompanies: number;
  totalIndividuals: number;
  joinedThisMonth: number;
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
  const headers = [
    { key: "name", ar: "اسم المستفيد", en: "Beneficiary Name", style: s.col1 },
    { key: "beneficiaryType", ar: "النوع", en: "Type", style: s.col2 },
    { key: "representative", ar: "المندوب", en: "Representative", style: s.col3 },
    { key: "registrationDate", ar: "التسجيل", en: "Registration", style: s.col4 },
    { key: "scriptsCount", ar: "النصوص", en: "Scripts", style: s.col5 },
    { key: "status", ar: "الحالة", en: "Status", style: s.col6 },
  ] as const;
  const orderedHeaders = isAr ? [...headers].reverse() : headers;
  return (
    <Document>
      <Page size="A4" wrap={false} style={[s.cover, isAr ? s.pageAr : {}]}>
        <View style={{ width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
          {props.coverImageDataUrl ? (
            <Image
              src={props.coverImageDataUrl}
              style={{ position: "absolute", top: -2, left: -2, width: A4_WIDTH + 4, height: A4_HEIGHT + 4, objectFit: "cover" }}
            />
          ) : null}
          <View style={{ position: "absolute", left: 44, right: 44, bottom: 92 }}>
            <View style={s.coverMetaBlock}>
              <Text style={[s.coverTitle, rtl]}>{isAr ? "تقرير محفظة المستفيدين" : "Beneficiaries Portfolio Report"}</Text>
              <Text style={[s.coverText, rtl]}>{dateStr}</Text>
            </View>
          </View>
        </View>
      </Page>
      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        {props.logoUrl ? <Image src={props.logoUrl} style={{ width: 90, height: 28, objectFit: "contain", marginBottom: 10 }} /> : null}
        <Text style={[s.title, rtl]}>{isAr ? "تقرير محفظة المستفيدين" : "Beneficiaries Portfolio Report"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? "الملخص التنفيذي" : "Executive Summary"}</Text>
        <View style={s.statRow}>
          <View style={s.stat}><Text style={s.statValue}>{props.totalClients}</Text><Text style={s.statLabel}>{isAr ? "إجمالي المستفيدين" : "Total Beneficiaries"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{props.joinedThisMonth}</Text><Text style={s.statLabel}>{isAr ? "انضموا هذا الشهر" : "Joined This Month"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{props.totalCompanies}</Text><Text style={s.statLabel}>{isAr ? "شركات" : "Companies"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{props.totalIndividuals}</Text><Text style={s.statLabel}>{isAr ? "أفراد" : "Individuals"}</Text></View>
        </View>
        <View style={s.statRow}>
          <View style={s.stat}><Text style={s.statValue}>{props.totalScripts}</Text><Text style={s.statLabel}>{isAr ? "إجمالي النصوص" : "Total Scripts"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{props.avgScripts}</Text><Text style={s.statLabel}>{isAr ? "متوسط النصوص" : "Avg Scripts"}</Text></View>
          <View style={s.stat}><Text style={s.statValue}>{props.activeClients}</Text><Text style={s.statLabel}>{isAr ? "مستفيدون نشطون" : "Active Beneficiaries"}</Text></View>
        </View>

        <View style={s.table}>
          <View style={s.tr}>
            {orderedHeaders.map((h, idx) => (
              <Text key={`h-${h.key}`} style={[s.th, h.style, rtl, idx === orderedHeaders.length - 1 ? { borderRightWidth: 0 } : {}]}>
                {isAr ? h.ar : h.en}
              </Text>
            ))}
          </View>
          {props.rows.map((row, idx) => (
            <View key={`client-row-${idx}`} style={[s.tr, idx % 2 ? s.rowEven : {}]}>
              {(isAr
                ? [
                    <Text key="status" style={[s.td, s.col6, rtl]}>{safeText(row.status, 14)}</Text>,
                    <Text key="scriptsCount" style={[s.td, s.col5, rtl]}>{String(row.scriptsCount || 0)}</Text>,
                    <Text key="registrationDate" style={[s.td, s.col4, rtl]}>{safeText(row.registrationDate, 14)}</Text>,
                    <Text key="representative" style={[s.td, s.col3, rtl]}>{safeText(row.representative, 20)}</Text>,
                    <Text key="beneficiaryType" style={[s.td, s.col2, rtl]}>{safeText(row.beneficiaryType, 14)}</Text>,
                    <Text key="name" style={[s.td, s.col1, rtl, { borderRightWidth: 0 }]}>{safeText(row.name, 30)}</Text>,
                  ]
                : [
                    <Text key="name" style={[s.td, s.col1, rtl]}>{safeText(row.name, 30)}</Text>,
                    <Text key="beneficiaryType" style={[s.td, s.col2, rtl]}>{safeText(row.beneficiaryType, 14)}</Text>,
                    <Text key="representative" style={[s.td, s.col3, rtl]}>{safeText(row.representative, 20)}</Text>,
                    <Text key="registrationDate" style={[s.td, s.col4, rtl]}>{safeText(row.registrationDate, 14)}</Text>,
                    <Text key="scriptsCount" style={[s.td, s.col5, rtl]}>{String(row.scriptsCount || 0)}</Text>,
                    <Text key="status" style={[s.td, s.col6, rtl, { borderRightWidth: 0 }]}>{safeText(row.status, 14)}</Text>,
                  ])}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
};
