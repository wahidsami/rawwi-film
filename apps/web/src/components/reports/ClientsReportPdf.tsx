import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { formatDate } from "@/utils/dateFormat";
import { ReportLayout } from "./ReportLayout";
import { styles, extendedStyles, summaryColors } from "./ReportStyles";

function sanitizeForPdf(s: string, maxLen = 40): string {
  if (!s || typeof s !== "string") return "";
  const stripped = s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + "…" : stripped;
}

const clientTableStyles = StyleSheet.create({
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "solid",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    minHeight: 36,
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  rowHeader: {
    backgroundColor: "#F3F4F6",
    minHeight: 28,
    alignItems: "center",
  },
  rowEven: { backgroundColor: "#F9FAFB" },
  cell: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  cellText: { fontSize: 8, lineHeight: 1.35 },
  cellLast: { borderRightWidth: 0 },
  cellW1: { width: "20%" },
  cellW2: { width: "16%" },
  cellW3: { width: "20%" },
  cellW4: { width: "14%" },
  cellW5: { width: "10%" },
  cellW6: { width: "20%" },
  cellHeader: { fontWeight: "bold", color: "#111827", fontSize: 9 },
});

export type CoverImageDataUrl = string | null | undefined;

export interface ClientRow {
  name: string;
  nameSecondary: string;
  representative: string;
  email: string;
  phone: string;
  registrationDate: string;
  scriptsCount: number;
  status: string;
}

export interface ClientsReportPdfProps {
  clientsData: ClientRow[];
  totalClients: number;
  totalScripts: number;
  avgScripts: number;
  activeClients: number;
  lang?: "ar" | "en";
  dateFormat?: string;
  coverImageDataUrl?: CoverImageDataUrl;
  /** Logo for content page header (data URL or absolute URL). */
  logoUrl?: string | null;
  generatedAt: string;
}

export const ClientsReportPdf: React.FC<ClientsReportPdfProps> = ({
  clientsData,
  totalClients,
  totalScripts,
  avgScripts,
  activeClients,
  lang = "en",
  dateFormat,
  coverImageDataUrl,
  generatedAt,
}) => {
  const isAr = lang === "ar";
  const dateStr = formatDate(new Date(generatedAt), { lang, format: dateFormat });

  const labels = isAr
    ? {
        reportTitle: "تقرير محفظة العملاء",
        subtitle: "نظام إدارة العملاء",
        executiveSummary: "الملخص التنفيذي",
        totalClients: "إجمالي العملاء",
        totalScripts: "إجمالي النصوص",
        avgScripts: "متوسط النصوص",
        activeClients: "عملاء نشطون",
        clientsDetails: "تفاصيل العملاء",
        clientName: "اسم العميل",
        representative: "المندوب",
        contact: "الاتصال",
        registrationDate: "تاريخ التسجيل",
        scriptsCount: "عدد النصوص",
        status: "الحالة",
      }
    : {
        reportTitle: "Clients Portfolio Report",
        subtitle: "Client Management System",
        executiveSummary: "Executive Summary",
        totalClients: "Total Clients",
        totalScripts: "Total Scripts",
        avgScripts: "Avg Scripts",
        activeClients: "Active Clients",
        clientsDetails: "Clients Details",
        clientName: "Client Name",
        representative: "Representative",
        contact: "Contact",
        registrationDate: "Registration Date",
        scriptsCount: "Scripts",
        status: "Status",
      };

  const headerCellStyle = [
    clientTableStyles.cellHeader,
    isAr ? styles.rtlText : {},
    isAr ? { fontFamily: "Cairo" } : {},
  ];

  const formatDateShort = (iso: string): string => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso.slice(0, 10) : formatDate(d, { lang, format: dateFormat });
    } catch {
      return String(iso).slice(0, 10);
    }
  };

  return (
    <Document>
      <Page
        size="A4"
        wrap={false}
        style={[extendedStyles.coverPage, isAr ? styles.pageAr : {}]}
      >
        <View style={extendedStyles.coverWrapper}>
          {coverImageDataUrl ? (
            <Image src={coverImageDataUrl} style={extendedStyles.coverBackground} />
          ) : (
            <View style={[extendedStyles.coverBackground, { backgroundColor: "#1e3a5f" }]} />
          )}
          <View style={extendedStyles.coverOverlayMeta}>
            <Text style={[extendedStyles.coverMetaTitle, isAr ? styles.rtlText : {}]}>
              {labels.reportTitle}
            </Text>
            <Text style={[extendedStyles.coverMetaValue, isAr ? styles.rtlText : {}]}>
              {labels.subtitle}
            </Text>
            <Text style={[extendedStyles.coverMetaText, isAr ? styles.rtlText : {}]}>
              {dateStr}
            </Text>
          </View>
        </View>
      </Page>

      <ReportLayout title={labels.reportTitle} lang={lang} dateFormat={dateFormat} logoUrl={logoUrl ?? undefined} showTitleBlock={true}>
        <Text style={[styles.sectionTitle, isAr ? styles.rtlText : {}]}>
          {labels.executiveSummary}
        </Text>
        <View style={[styles.statGrid, isAr ? styles.rowReverse : {}]}>
          <View style={[styles.statCard, { borderColor: summaryColors.low.border, backgroundColor: summaryColors.low.bg }]}>
            <Text style={[styles.statValue, { color: summaryColors.low.text }, isAr ? styles.rtlText : {}]}>{String(totalClients)}</Text>
            <Text style={[styles.statLabel, isAr ? styles.rtlText : {}]}>{labels.totalClients}</Text>
          </View>
          <View style={[styles.statCard, { borderColor: summaryColors.low.border, backgroundColor: summaryColors.low.bg }]}>
            <Text style={[styles.statValue, { color: summaryColors.low.text }, isAr ? styles.rtlText : {}]}>{String(totalScripts)}</Text>
            <Text style={[styles.statLabel, isAr ? styles.rtlText : {}]}>{labels.totalScripts}</Text>
          </View>
          <View style={[styles.statCard, { borderColor: summaryColors.low.border, backgroundColor: summaryColors.low.bg }]}>
            <Text style={[styles.statValue, { color: summaryColors.low.text }, isAr ? styles.rtlText : {}]}>{String(avgScripts)}</Text>
            <Text style={[styles.statLabel, isAr ? styles.rtlText : {}]}>{labels.avgScripts}</Text>
          </View>
          <View style={[styles.statCard, { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" }]}>
            <Text style={[styles.statValue, { color: "#065F46" }, isAr ? styles.rtlText : {}]}>{String(activeClients)}</Text>
            <Text style={[styles.statLabel, isAr ? styles.rtlText : {}]}>{labels.activeClients}</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, isAr ? styles.rtlText : {}, { marginTop: 16 }]}>
          {labels.clientsDetails}
        </Text>
        <View style={clientTableStyles.table}>
          <View style={[clientTableStyles.row, clientTableStyles.rowHeader]}>
            <View style={[clientTableStyles.cell, clientTableStyles.cellW1]}>
              <Text style={headerCellStyle}>{labels.clientName}</Text>
            </View>
            <View style={[clientTableStyles.cell, clientTableStyles.cellW2]}>
              <Text style={headerCellStyle}>{labels.representative}</Text>
            </View>
            <View style={[clientTableStyles.cell, clientTableStyles.cellW3]}>
              <Text style={headerCellStyle}>{labels.contact}</Text>
            </View>
            <View style={[clientTableStyles.cell, clientTableStyles.cellW4]}>
              <Text style={headerCellStyle}>{labels.registrationDate}</Text>
            </View>
            <View style={[clientTableStyles.cell, clientTableStyles.cellW5]}>
              <Text style={headerCellStyle}>{labels.scriptsCount}</Text>
            </View>
            <View style={[clientTableStyles.cell, clientTableStyles.cellW6, clientTableStyles.cellLast]}>
              <Text style={headerCellStyle}>{labels.status}</Text>
            </View>
          </View>
          {clientsData.map((row, idx) => (
            <View
              key={idx}
              style={[
                clientTableStyles.row,
                idx % 2 === 1 ? clientTableStyles.rowEven : {},
              ]}
            >
              <View style={[clientTableStyles.cell, clientTableStyles.cellW1]}>
                <Text style={[clientTableStyles.cellText, isAr ? styles.rtlText : {}]} wrap>
                  {sanitizeForPdf(row.name, 28)}
                </Text>
                {row.nameSecondary ? (
                  <Text style={[clientTableStyles.cellText, styles.textXs, isAr ? styles.rtlText : {}]} wrap>
                    {sanitizeForPdf(row.nameSecondary, 28)}
                  </Text>
                ) : null}
              </View>
              <View style={[clientTableStyles.cell, clientTableStyles.cellW2]}>
                <Text style={[clientTableStyles.cellText, isAr ? styles.rtlText : {}]} wrap>
                  {sanitizeForPdf(row.representative, 24)}
                </Text>
              </View>
              <View style={[clientTableStyles.cell, clientTableStyles.cellW3]}>
                <Text style={[clientTableStyles.cellText, isAr ? styles.rtlText : {}]} wrap>
                  {sanitizeForPdf(row.email, 26)}
                </Text>
                <Text style={[clientTableStyles.cellText, styles.textXs, isAr ? styles.rtlText : {}]} wrap>
                  {sanitizeForPdf(row.phone, 20)}
                </Text>
              </View>
              <View style={[clientTableStyles.cell, clientTableStyles.cellW4]}>
                <Text style={[clientTableStyles.cellText, isAr ? styles.rtlText : {}]}>
                  {formatDateShort(row.registrationDate)}
                </Text>
              </View>
              <View style={[clientTableStyles.cell, clientTableStyles.cellW5]}>
                <Text style={[clientTableStyles.cellText, { textAlign: "center" }, isAr ? styles.rtlText : {}]}>
                  {String(row.scriptsCount ?? 0)}
                </Text>
              </View>
              <View style={[clientTableStyles.cell, clientTableStyles.cellW6, clientTableStyles.cellLast]}>
                <Text style={[clientTableStyles.cellText, isAr ? styles.rtlText : {}]}>
                  {sanitizeForPdf(row.status, 12)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ReportLayout>
    </Document>
  );
};
