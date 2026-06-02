import { Font, StyleSheet } from "@react-pdf/renderer";

const fontBase = typeof window !== "undefined" ? window.location.origin : "";

Font.register({
  family: "RegPerfCairo",
  fonts: [
    { src: `${fontBase}/fonts/Cairo-Regular.ttf` },
    { src: `${fontBase}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" },
  ],
});

export const regPerfStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#111827" },
  pageAr: { fontFamily: "RegPerfCairo" },
  cover: { backgroundColor: "#FCFAFD", padding: 0, justifyContent: "flex-end" },
  coverTitle: { fontSize: 24, fontWeight: "bold", color: "#4B1D44", marginBottom: 8 },
  coverSub: { fontSize: 11, color: "#6B7280", marginBottom: 4 },
  coverMetaBlock: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#E9D5FF",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 6, color: "#4B1D44" },
  subtitle: { fontSize: 10, color: "#4B5563", marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "bold", marginTop: 12, marginBottom: 6, color: "#4B1D44" },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  statCard: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, padding: 8, backgroundColor: "#FFFFFF" },
  statValue: { fontSize: 16, fontWeight: "bold", color: "#111827" },
  statLabel: { fontSize: 8.5, color: "#6B7280" },
  table: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, overflow: "hidden", marginBottom: 8 },
  tr: { flexDirection: "row" },
  th: { flex: 1, padding: 6, fontSize: 8.5, fontWeight: "bold", borderRightWidth: 1, borderRightColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  td: { flex: 1, padding: 6, fontSize: 8.5, borderRightWidth: 1, borderRightColor: "#E5E7EB" },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 8,
    fontWeight: "bold",
    color: "#4B1D44",
    backgroundColor: "#F3E8FF",
    borderWidth: 1,
    borderColor: "#D8B4FE",
  },
  sectionBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  key: { color: "#6B7280" },
  value: { color: "#111827", fontWeight: "bold", maxWidth: "68%" },
  note: { fontSize: 8.5, color: "#6B7280", lineHeight: 1.4 },
  timelineItem: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6", paddingBottom: 5, marginBottom: 5 },
  timelineText: { fontSize: 8.5, lineHeight: 1.4 },
  rtl: { textAlign: "right" },
});
