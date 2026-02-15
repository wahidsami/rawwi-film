import React from "react";
import { Text, View, Image, Page, Document } from "@react-pdf/renderer";
import { ReportLayout } from "./ReportLayout";
import { styles, themeColors, extendedStyles, summaryColors } from "./ReportStyles";

interface Finding {
    id: string;
    articleId: number;
    titleAr: string;
    severity: string;
    confidence: number;
    evidenceSnippet: string;
    source?: string;
    startLineChunk?: number;
    endLineChunk?: number;
    reviewStatus?: string;
    reviewReason?: string;
    reviewedAt?: string;
}

interface AnalysisReportData {
    jobId: string;
    scriptTitle: string;
    clientName: string;
    createdAt: string;
    findings: Finding[];
    lang?: "ar" | "en";
}

export const AnalysisReportPdf: React.FC<{ data: AnalysisReportData }> = ({
    data,
}) => {
    const { scriptTitle, clientName, findings, lang = "en" } = data;
    const isAr = lang === "ar";

    // Group findings by severity for summary
    const grouped = findings.reduce((acc, finding) => {
        const severity = finding.severity || "info";
        if (!acc[severity]) acc[severity] = [];
        acc[severity].push(finding);
        return acc;
    }, {} as Record<string, Finding[]>);

    const getSeverityColor = (severity: string) => {
        switch (severity.toLowerCase()) {
            case "critical":
                return styles.badgeCritical;
            case "high":
                return styles.badgeHigh;
            case "medium":
                return styles.badgeMedium;
            case "low":
                return styles.badgeLow;
            default:
                return styles.badgeInfo;
        }
    };

    return (
        <Document>
            {/* Cover Page */}
            <Page size="A4" style={[styles.page, extendedStyles.coverPage]}>
                <View style={{ alignItems: "center", width: "100%" }}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src="/loginlogo.png" style={extendedStyles.coverLogo} />
                </View>

                <View style={[extendedStyles.coverTitleContainer, { flex: 1, justifyContent: 'center' }]}>
                    <Text style={extendedStyles.coverTitle}>
                        {isAr ? "تقرير التحليل" : "Analysis Report"}
                    </Text>
                    <Text style={[extendedStyles.coverSubtitle, { fontSize: 24, marginTop: 15, fontWeight: "bold", color: "#111827", textAlign: 'center' }]}>
                        {scriptTitle}
                    </Text>
                    <Text style={[extendedStyles.coverSubtitle, { marginTop: 15, fontSize: 14 }]}>
                        {isAr ? "العميل: " : "Client: "} {clientName}
                    </Text>
                    <Text style={[extendedStyles.coverSubtitle, { marginTop: 30, fontSize: 12, color: '#9CA3AF' }]}>
                        {new Date(data.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                        })}
                    </Text>
                </View>

                <View style={{ alignItems: "center", width: "100%" }}>
                    <Text style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 10 }}>Powered by</Text>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src="/footer.png" style={extendedStyles.coverFooterImage} />
                </View>
            </Page>

            {/* Content Pages */}
            <ReportLayout
                title={isAr ? "تفاصيل التقرير" : "Report Details"}
                lang={lang}
                clientName={clientName}
            >
                {/* Executive Summary Section */}
                <Text style={[styles.sectionTitle, isAr ? styles.rtlText : {}]}>
                    {isAr ? "ملخص التقرير" : "Executive Summary"}
                </Text>

                <View style={styles.statGrid}>
                    <View style={[styles.statCard, { borderColor: summaryColors.critical.border, backgroundColor: summaryColors.critical.bg }]}>
                        <Text style={[styles.statValue, { color: summaryColors.critical.text }]}>{grouped["critical"]?.length || 0}</Text>
                        <Text style={styles.statLabel}>{isAr ? "حرجة" : "Critical"}</Text>
                    </View>
                    <View style={[styles.statCard, { borderColor: summaryColors.high.border, backgroundColor: summaryColors.high.bg }]}>
                        <Text style={[styles.statValue, { color: summaryColors.high.text }]}>{grouped["high"]?.length || 0}</Text>
                        <Text style={styles.statLabel}>{isAr ? "عالية" : "High"}</Text>
                    </View>
                    <View style={[styles.statCard, { borderColor: summaryColors.medium.border, backgroundColor: summaryColors.medium.bg }]}>
                        <Text style={[styles.statValue, { color: summaryColors.medium.text }]}>{grouped["medium"]?.length || 0}</Text>
                        <Text style={styles.statLabel}>{isAr ? "متوسطة" : "Medium"}</Text>
                    </View>
                    <View style={[styles.statCard, { borderColor: summaryColors.low.border, backgroundColor: summaryColors.low.bg }]}>
                        <Text style={[styles.statValue, { color: summaryColors.low.text }]}>{grouped["low"]?.length || 0}</Text>
                        <Text style={styles.statLabel}>{isAr ? "منخفضة" : "Low"}</Text>
                    </View>
                </View>

                <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8, marginBottom: 30 }}>
                    <View style={styles.metadataChip}>
                        <Text style={styles.textXs}>{isAr ? "إجمالي المخالفات: " : "Total Violations: "} {findings.length}</Text>
                    </View>
                    <View style={styles.metadataChip}>
                        <Text style={styles.textXs}>{isAr ? "النص: " : "Script: "} {scriptTitle}</Text>
                    </View>
                </View>

                {/* Findings Section (Grouped by Article) */}
                <Text style={[styles.sectionTitle, isAr ? styles.rtlText : {}]}>
                    {isAr ? "تفاصيل القضايا" : "Findings Details"}
                </Text>

                {/* Group findings by Article ID locally for rendering */}
                {Object.entries(findings.reduce((acc, f) => {
                    const key = f.articleId;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(f);
                    return acc;
                }, {} as Record<number, Finding[]>)).map(([articleIdStr, artFindings]) => {
                    const articleId = Number(articleIdStr);
                    return (
                        <View key={articleId} style={{ marginBottom: 20 }}>
                            {/* Article Header */}
                            <View style={styles.articleHeader}>
                                <Text style={styles.articleTitle}>
                                    {isAr ? `مادة ${articleId}` : `Article ${articleId}`}
                                </Text>
                                <Text style={styles.textXs}>
                                    {artFindings.length} {isAr ? "قضايا" : "Issues"}
                                </Text>
                            </View>

                            {/* Finding Cards */}
                            {artFindings.map((finding, idx) => (
                                <View key={idx} style={styles.card} wrap={false}>
                                    {/* Header: Title + Severity */}
                                    <View style={styles.cardHeader}>
                                        <View style={[styles.badge, getSeverityColor(finding.severity)]}>
                                            <Text>{finding.severity}</Text>
                                        </View>
                                        <Text style={styles.cardTitle}>{finding.titleAr || "—"}</Text>
                                    </View>

                                    {/* Meta Subheader: Source + Confidence + Lines */}
                                    <View style={styles.cardSubheader}>
                                        <View style={styles.metadataChip}>
                                            <Text style={styles.textXs}>
                                                {isAr ? "ثقة: " : "Conf: "} {Math.round(finding.confidence * 100)}%
                                            </Text>
                                        </View>
                                        {finding.source && (
                                            <View style={styles.metadataChip}>
                                                <Text style={styles.textXs}>
                                                    {finding.source === 'manual' ? (isAr ? "يدوي" : "Manual") : "AI"}
                                                </Text>
                                            </View>
                                        )}
                                        {finding.startLineChunk !== undefined && (
                                            <View style={styles.metadataChip}>
                                                <Text style={styles.textXs}>
                                                    {isAr ? "سطر: " : "Line: "} {finding.startLineChunk}
                                                    {finding.endLineChunk ? ` - ${finding.endLineChunk}` : ''}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Body: Evidence Quote */}
                                    <View style={styles.cardBody}>
                                        <Text style={styles.quoteText}>
                                            "{finding.evidenceSnippet}"
                                        </Text>
                                    </View>

                                    {/* Footer: Review Status (if exists) */}
                                    {finding.reviewStatus && (
                                        <View style={styles.cardFooter}>
                                            <Text style={[styles.textXs, { color: finding.reviewStatus === 'approved' ? themeColors.secondary : themeColors.danger }]}>
                                                {finding.reviewStatus === 'approved'
                                                    ? (isAr ? "تم الاعتماد (آمن)" : "Approved (Safe)")
                                                    : (isAr ? "مخالفة" : "Violation")}
                                            </Text>
                                            {finding.reviewedAt && (
                                                <Text style={styles.textXs}>
                                                    {new Date(finding.reviewedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB')}
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>
                    )
                })}
            </ReportLayout>
        </Document>
    );
};
