import React from "react";
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { formatDate } from "@/utils/dateFormat";
import type { DashboardStats } from "@/services/dashboardService";
import type { Activity } from "@/services/activityService";
import { ReportLayout } from "./ReportLayout";
import { styles, extendedStyles, summaryColors } from "./ReportStyles";

export type CoverImageDataUrl = string | null | undefined;

export interface StatusReportPdfProps {
  stats: DashboardStats;
  activities: Activity[];
  lang?: "ar" | "en";
  dateFormat?: string;
  coverImageDataUrl?: CoverImageDataUrl;
  generatedAt: string; // ISO string
}

export const StatusReportPdf: React.FC<StatusReportPdfProps> = ({
  stats,
  activities,
  lang = "en",
  dateFormat,
  coverImageDataUrl,
  generatedAt,
}) => {
  const isAr = lang === "ar";

  const totalScripts = Object.values(stats.scriptsByStatus).reduce((a, b) => a + b, 0) || 1;
  const totalFindings =
    Object.values(stats.findingsBySeverity).reduce((a, b) => a + b, 0) || 1;

  const pDraft = Math.round(((stats.scriptsByStatus.draft ?? 0) / totalScripts) * 100);
  const pAssigned = Math.round(((stats.scriptsByStatus.assigned ?? 0) / totalScripts) * 100);
  const pReview = Math.round(
    ((stats.scriptsByStatus.review_required ?? 0) / totalScripts) * 100
  );
  const pCompleted = Math.round(
    ((stats.scriptsByStatus.completed ?? 0) / totalScripts) * 100
  );

  const pCritical = Math.round(
    ((stats.findingsBySeverity.critical ?? 0) / totalFindings) * 100
  );
  const pHigh = Math.round(
    ((stats.findingsBySeverity.high ?? 0) / totalFindings) * 100
  );
  const pMedium = Math.round(
    ((stats.findingsBySeverity.medium ?? 0) / totalFindings) * 100
  );
  const pLow = Math.round(
    ((stats.findingsBySeverity.low ?? 0) / totalFindings) * 100
  );

  const formatOpts = { lang, format: dateFormat };
  const dateStr = formatDate(new Date(generatedAt), formatOpts);

  const labels = isAr
    ? {
        reportTitle: "تقرير حالة النظام",
        subtitle: "لوحة القيادة التنفيذية",
        executiveSummary: "الملخص التنفيذي",
        pendingTasks: "مهام معلقة",
        inReview: "نصوص قيد المراجعة",
        reportsMonth: "تقارير هذا الشهر",
        criticalFindings: "ملاحظات حرجة",
        scriptStatus: "توزيع حالات النصوص",
        findingsSeverity: "تحليل المخاطر (الملاحظات)",
        recentActivity: "الأنشطة الأخيرة",
        statusDraft: "مسودة",
        statusAssigned: "معين",
        statusReview: "مراجعة",
        statusCompleted: "مكتمل",
        severityCritical: "حرج",
        severityHigh: "عالي",
        severityMedium: "متوسط",
        severityLow: "منخفض",
      }
    : {
        reportTitle: "System Status Report",
        subtitle: "Executive Dashboard",
        executiveSummary: "Executive Summary",
        pendingTasks: "Pending Tasks",
        inReview: "Scripts in Review",
        reportsMonth: "Reports This Month",
        criticalFindings: "Critical/High Findings",
        scriptStatus: "Script Status Distribution",
        findingsSeverity: "Risk Analysis (Findings)",
        recentActivity: "Recent Activity",
        statusDraft: "Draft",
        statusAssigned: "Assigned",
        statusReview: "Review",
        statusCompleted: "Completed",
        severityCritical: "Critical",
        severityHigh: "High",
        severityMedium: "Medium",
        severityLow: "Low",
      };

  const activityRows = activities.slice(0, 15);

  const headerCellStyle = [
    styles.tableCellHeader,
    isAr ? styles.rtlText : {},
    { color: "#111827", fontSize: 10 },
    isAr ? { fontFamily: "Cairo" } : {},
  ];

  return (
    <Document>
      {/* Cover */}
      <Page
        size="A4"
        wrap={false}
        style={[extendedStyles.coverPage, isAr ? styles.pageAr : {}]}
      >
        <View style={extendedStyles.coverWrapper}>
          {coverImageDataUrl ? (
            <Image
              src={coverImageDataUrl}
              style={extendedStyles.coverBackground}
            />
          ) : (
            <View
              style={[
                extendedStyles.coverBackground,
                { backgroundColor: "#1e3a5f" },
              ]}
            />
          )}
          <View style={extendedStyles.coverOverlayMeta}>
            <Text
              style={[
                extendedStyles.coverMetaTitle,
                isAr ? styles.rtlText : {},
              ]}
            >
              {labels.reportTitle}
            </Text>
            <Text
              style={[
                extendedStyles.coverMetaValue,
                isAr ? styles.rtlText : {},
              ]}
            >
              {labels.subtitle}
            </Text>
            <Text
              style={[
                extendedStyles.coverMetaText,
                isAr ? styles.rtlText : {},
              ]}
            >
              {dateStr}
            </Text>
          </View>
        </View>
      </Page>

      {/* Content */}
      <ReportLayout
        title={labels.reportTitle}
        lang={lang}
        dateFormat={dateFormat}
        showTitleBlock={true}
      >
        <Text style={[styles.sectionTitle, isAr ? styles.rtlText : {}]}>
          {labels.executiveSummary}
        </Text>

        <View style={[styles.statGrid, isAr ? styles.rowReverse : {}]}>
          <View
            style={[
              styles.statCard,
              {
                borderColor: summaryColors.high.border,
                backgroundColor: summaryColors.high.bg,
              },
            ]}
          >
            <Text
              style={[
                styles.statValue,
                { color: summaryColors.high.text },
                isAr ? styles.rtlText : {},
              ]}
            >
              {String(stats.pendingTasks)}
            </Text>
            <Text style={[styles.statLabel, isAr ? styles.rtlText : {}]}>
              {labels.pendingTasks}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                borderColor: themeColors.primary + "40",
                backgroundColor: "#EFF6FF",
              },
            ]}
          >
            <Text
              style={[styles.statValue, { color: "#1E40AF" }, isAr ? styles.rtlText : {}]}
            >
              {stats.scriptsInReview}
            </Text>
            <Text style={[styles.statLabel, isAr ? styles.rtlText : {}]}>
              {labels.inReview}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                borderColor: summaryColors.low.border,
                backgroundColor: summaryColors.low.bg,
              },
            ]}
          >
            <Text
              style={[
                styles.statValue,
                { color: summaryColors.low.text },
                isAr ? styles.rtlText : {},
              ]}
            >
              {String(stats.reportsThisMonth)}
            </Text>
            <Text style={[styles.statLabel, isAr ? styles.rtlText : {}]}>
              {labels.reportsMonth}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                borderColor: summaryColors.critical.border,
                backgroundColor: summaryColors.critical.bg,
              },
            ]}
          >
            <Text
              style={[
                styles.statValue,
                { color: summaryColors.critical.text },
                isAr ? styles.rtlText : {},
              ]}
            >
              {String(stats.highCriticalFindings)}
            </Text>
            <Text style={[styles.statLabel, isAr ? styles.rtlText : {}]}>
              {labels.criticalFindings}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.sectionTitle,
            isAr ? styles.rtlText : {},
            { marginTop: 16 },
          ]}
        >
          {labels.scriptStatus}
        </Text>
        <View style={[styles.table, { marginBottom: 12 }]}>
          <View style={[styles.tableRow, styles.tableRowHeader]}>
            <View style={styles.tableCol}>
              <Text style={headerCellStyle}>{labels.statusDraft}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={headerCellStyle}>{labels.statusAssigned}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={headerCellStyle}>{labels.statusReview}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={headerCellStyle}>{labels.statusCompleted}</Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={[styles.tableCell, isAr ? styles.rtlText : {}]}>
                {stats.scriptsByStatus.draft ?? 0} ({pDraft}%)
              </Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={[styles.tableCell, isAr ? styles.rtlText : {}]}>
                {stats.scriptsByStatus.assigned ?? 0} ({pAssigned}%)
              </Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={[styles.tableCell, isAr ? styles.rtlText : {}]}>
                {stats.scriptsByStatus.review_required ?? 0} ({pReview}%)
              </Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={[styles.tableCell, isAr ? styles.rtlText : {}]}>
                {stats.scriptsByStatus.completed ?? 0} ({pCompleted}%)
              </Text>
            </View>
          </View>
        </View>

        <Text
          style={[
            styles.sectionTitle,
            isAr ? styles.rtlText : {},
            { marginTop: 16 },
          ]}
        >
          {labels.findingsSeverity}
        </Text>
        <View style={[styles.table, { marginBottom: 12 }]}>
          <View style={[styles.tableRow, styles.tableRowHeader]}>
            <View style={styles.tableCol}>
              <Text style={headerCellStyle}>{labels.severityCritical}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={headerCellStyle}>{labels.severityHigh}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={headerCellStyle}>{labels.severityMedium}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={headerCellStyle}>{labels.severityLow}</Text>
            </View>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={[styles.tableCell, isAr ? styles.rtlText : {}]}>
                {stats.findingsBySeverity.critical ?? 0} ({pCritical}%)
              </Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={[styles.tableCell, isAr ? styles.rtlText : {}]}>
                {stats.findingsBySeverity.high ?? 0} ({pHigh}%)
              </Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={[styles.tableCell, isAr ? styles.rtlText : {}]}>
                {stats.findingsBySeverity.medium ?? 0} ({pMedium}%)
              </Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={[styles.tableCell, isAr ? styles.rtlText : {}]}>
                {stats.findingsBySeverity.low ?? 0} ({pLow}%)
              </Text>
            </View>
          </View>
        </View>

        <Text
          style={[
            styles.sectionTitle,
            isAr ? styles.rtlText : {},
            { marginTop: 16 },
          ]}
        >
          {labels.recentActivity}
        </Text>
        {activityRows.length === 0 ? (
          <Text style={[styles.textSm, isAr ? styles.rtlText : {}, { marginBottom: 8 }]}>
            {isAr ? "لا أنشطة حديثة." : "No recent activity."}
          </Text>
        ) : (
          <View>
            {activityRows.map((act, idx) => (
              <View
                key={act.id}
                style={[
                  styles.card,
                  idx > 0 ? { marginTop: 6 } : {},
                  isAr ? styles.rowReverse : {},
                ]}
              >
                <Text style={[styles.cardTitle, isAr ? styles.rtlText : {}]}>
                  {act.action}
                </Text>
                <View style={styles.cardSubheader}>
                  <Text style={[styles.metadataChip, isAr ? styles.rtlText : {}]}>
                    {act.actor}
                  </Text>
                  <Text style={[styles.metadataChip, isAr ? styles.rtlText : {}]}>
                    {act.time}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ReportLayout>
    </Document>
  );
};

const themeColors = {
  primary: "#3B82F6",
  secondary: "#10B981",
  danger: "#EF4444",
  warning: "#F59E0B",
};
