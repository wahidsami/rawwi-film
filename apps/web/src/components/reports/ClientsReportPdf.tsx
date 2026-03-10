import React from "react";
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { formatDate } from "@/utils/dateFormat";
import { ReportLayout } from "./ReportLayout";
import { styles, extendedStyles, summaryColors } from "./ReportStyles";

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
    styles.tableCellHeader,
    isAr ? styles.rtlText : {},
    { color: "#111827", fontSize: 10 },
    isAr ? { fontFamily: "Cairo" } : {},
  ];

  const colStyle = { flex: 1, minWidth: 0, borderStyle: "solid" as const, borderWidth: 1, borderLeftWidth: 0, borderTopWidth: 0, borderColor: "#E5E7EB", paddingHorizontal: 4, paddingVertical: 4, justifyContent: "center" as const };

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

      <ReportLayout title={labels.reportTitle} lang={lang} dateFormat={dateFormat} showTitleBlock={true}>
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
        <View style={[styles.table, { marginBottom: 12, flexDirection: "column" }]}>
          <View style={[styles.tableRow, styles.tableRowHeader, { display: "flex", flexDirection: "row" }]}>
            <View style={[colStyle, { width: "22%" }]}>
              <Text style={headerCellStyle}>{labels.clientName}</Text>
            </View>
            <View style={[colStyle, { width: "18%" }]}>
              <Text style={headerCellStyle}>{labels.representative}</Text>
            </View>
            <View style={[colStyle, { width: "22%" }]}>
              <Text style={headerCellStyle}>{labels.contact}</Text>
            </View>
            <View style={[colStyle, { width: "14%" }]}>
              <Text style={headerCellStyle}>{labels.registrationDate}</Text>
            </View>
            <View style={[colStyle, { width: "8%" }]}>
              <Text style={headerCellStyle}>{labels.scriptsCount}</Text>
            </View>
            <View style={[colStyle, { width: "16%" }]}>
              <Text style={headerCellStyle}>{labels.status}</Text>
            </View>
          </View>
          {clientsData.map((row, idx) => (
            <View
              key={idx}
              style={[
                styles.tableRow,
                { display: "flex", flexDirection: "row" },
                idx % 2 === 1 ? styles.tableRowEven : {},
              ]}
            >
              <View style={[colStyle, { width: "22%" }]}>
                <Text style={[styles.tableCell, { fontSize: 8 }, isAr ? styles.rtlText : {}]}>{row.name}</Text>
                {row.nameSecondary ? (
                  <Text style={[styles.textXs, isAr ? styles.rtlText : {}]}>{row.nameSecondary}</Text>
                ) : null}
              </View>
              <View style={[colStyle, { width: "18%" }]}>
                <Text style={[styles.tableCell, { fontSize: 8 }, isAr ? styles.rtlText : {}]}>{row.representative}</Text>
              </View>
              <View style={[colStyle, { width: "22%" }]}>
                <Text style={[styles.tableCell, { fontSize: 8 }, isAr ? styles.rtlText : {}]}>{row.email}</Text>
                <Text style={[styles.textXs, isAr ? styles.rtlText : {}]}>{row.phone}</Text>
              </View>
              <View style={[colStyle, { width: "14%" }]}>
                <Text style={[styles.tableCell, { fontSize: 8 }, isAr ? styles.rtlText : {}]}>{row.registrationDate}</Text>
              </View>
              <View style={[colStyle, { width: "8%" }]}>
                <Text style={[styles.tableCell, { fontSize: 8, textAlign: "center" }, isAr ? styles.rtlText : {}]}>
                  {String(row.scriptsCount ?? 0)}
                </Text>
              </View>
              <View style={[colStyle, { width: "16%" }]}>
                <Text style={[styles.tableCell, { fontSize: 8 }, isAr ? styles.rtlText : {}]}>{row.status}</Text>
              </View>
            </View>
          ))}
        </View>
      </ReportLayout>
    </Document>
  );
};
