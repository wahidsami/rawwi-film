import { StyleSheet, Font } from "@react-pdf/renderer";

// Register fonts
Font.register({
  family: "Cairo",
  fonts: [
    { src: "/fonts/Cairo-Regular.ttf" },
    { src: "/fonts/Cairo-Bold.ttf", fontWeight: "bold" },
  ],
});

Font.register({
  family: "Roboto",
  fonts: [
    { src: "/fonts/Roboto-Regular.ttf" },
    { src: "/fonts/Roboto-Medium.ttf", fontWeight: "medium" },
    { src: "/fonts/Roboto-Bold.ttf", fontWeight: "bold" },
    { src: "/fonts/Roboto-Italic.ttf", fontStyle: "italic" },
  ],
});

export const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: "#FFFFFF",
    fontFamily: "Roboto",
    fontSize: 10,
    color: "#333333",
  },
  pageAr: {
    fontFamily: "Cairo",
  },
  // Typography Utilities
  textSm: { fontSize: 9, color: "#4B5563" },
  textXs: { fontSize: 8, color: "#6B7280" },
  textBold: { fontWeight: "bold", color: "#1F2937" },
  mt4: { marginTop: 4 },
  mb2: { marginBottom: 2 },

  // Card Layout Styles
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 15,
    padding: 12,
    wrap: false, // Prevent page break inside card
  },
  cardHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 6,
    minHeight: 20,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#111827",
    lineHeight: 1.5,
    flex: 1,
    textAlign: "right", // Arabic alignment
  },
  cardSubheader: {
    display: "flex",
    flexDirection: "row-reverse", // RTL flow for metadata
    gap: 8,
    marginBottom: 8,
    minHeight: 16,
  },
  metadataChip: {
    backgroundColor: "#F3F4F6",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    fontSize: 8,
    lineHeight: 1.5,
    color: "#4B5563",
  },
  cardBody: {
    backgroundColor: "#F9FAFB",
    padding: 10,
    borderRadius: 4,
    borderLeftWidth: 3, // Quote indicator
    borderLeftColor: "#D1D5DB",
    marginBottom: 8,
  },
  quoteText: {
    fontSize: 10,
    lineHeight: 1.6,
    color: "#374151",
    textAlign: "right", // Arabic alignment
    fontFamily: "Cairo",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  cardFooter: {
    display: "flex",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    minHeight: 12,
  },
  // Article Group Header
  articleHeader: {
    marginTop: 15,
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 2,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  articleTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#111827",
  },
  // Executive Summary Stat Grid
  statGrid: {
    flexDirection: "row-reverse", // RTL
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: "#6B7280",
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerText: {
    fontSize: 8,
    color: "#6B7280",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    marginTop: 20,
    color: "#111827",
    paddingBottom: 5,
    borderBottomWidth: 2,
    borderBottomColor: "#3B82F6",
  },
  paragraph: {
    marginBottom: 8,
    lineHeight: 1.5,
    textAlign: "justify",
  },
  table: {
    display: "flex",
    width: "auto",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRightWidth: 0,
    borderBottomWidth: 0,
    marginBottom: 15,
  },
  tableRow: {
    margin: "auto",
    flexDirection: "row",
    minHeight: 25, // Ensure minimum height for rows
    alignItems: "center", // Vertically align content
  },
  tableRowHeader: {
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    height: 30, // Fixed height for header
  },
  tableRowEven: {
    backgroundColor: "#F9FAFB",
  },
  tableCol: {
    width: "25%",
    borderStyle: "solid",
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderColor: "#E5E7EB",
    paddingHorizontal: 4, // Add padding to column container
    paddingVertical: 6,   // Add vertical padding for breathing room
    justifyContent: "center", // Vertically center content
  },
  tableCell: {
    fontSize: 9,
    lineHeight: 1.5, // Improve readability
    textAlign: "left",
  },
  tableCellHeader: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#374151", // Darker gray for header text
    textAlign: "left",
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12, // Pill shape
    fontSize: 8,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    minWidth: 50, // Ensure minimum width for badges
  },
  badgeCritical: { backgroundColor: "#EF4444" },
  badgeHigh: { backgroundColor: "#F97316" },
  badgeMedium: { backgroundColor: "#EAB308" },
  badgeLow: { backgroundColor: "#3B82F6" },
  badgeInfo: { backgroundColor: "#6B7280" },
  footerContainer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    color: "#9CA3AF",
  },
  rtlText: {
    textAlign: "right",
  },
  rowReverse: {
    flexDirection: "row-reverse",
  },
});

export const themeColors = {
  primary: "#3B82F6",
  secondary: "#10B981",
  danger: "#EF4444",
  warning: "#F59E0B",
  dark: "#111827",
  light: "#F3F4F6",
  white: "#FFFFFF",
};

// Colors for summary boxes
export const summaryColors = {
  total: { bg: "#F3F4F6", text: "#1F2937", border: "#E5E7EB" },
  critical: { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
  high: { bg: "#FFF7ED", text: "#9A3412", border: "#FED7AA" },
  medium: { bg: "#FEFCE8", text: "#854D0E", border: "#FEF08A" },
  low: { bg: "#EFF6FF", text: "#1E40AF", border: "#BFDBFE" },
};

export const extendedStyles = StyleSheet.create({
  // Cover Page
  coverPage: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 100,
    paddingBottom: 60,
  },
  coverLogo: {
    width: 200,
    marginBottom: 40,
  },
  coverTitleContainer: {
    alignItems: "center",
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 10,
  },
  coverSubtitle: {
    fontSize: 16,
    color: "#6B7280",
  },
  coverFooterImage: {
    width: 150,
  },

  // Summary Section
  summaryContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
    gap: 10,
  },
  summaryBox: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryBoxTitle: {
    fontSize: 10,
    marginBottom: 5,
    fontWeight: "bold",
  },
  summaryBoxValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
});
