import { Font, StyleSheet } from "@react-pdf/renderer";

const fontBase = typeof window !== "undefined" ? window.location.origin : "";

Font.register({
  family: "StatusCairo",
  fonts: [
    { src: `${fontBase}/fonts/Cairo-Regular.ttf` },
    { src: `${fontBase}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" },
  ],
});

export const statusStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#111827" },
  pageAr: { fontFamily: "StatusCairo" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  subtitle: { fontSize: 10, color: "#4B5563", marginBottom: 8 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  statCard: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 8 },
  statValue: { fontSize: 16, fontWeight: "bold" },
  statLabel: { fontSize: 9, color: "#4B5563" },
  sectionTitle: { fontSize: 13, fontWeight: "bold", marginTop: 10, marginBottom: 5 },
  table: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, overflow: "hidden", marginBottom: 8 },
  tr: { flexDirection: "row" },
  th: { flex: 1, padding: 6, fontSize: 9, fontWeight: "bold", borderRightWidth: 1, borderRightColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  td: { flex: 1, padding: 6, fontSize: 9, borderRightWidth: 1, borderRightColor: "#E5E7EB" },
  activityItem: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 7, marginBottom: 6 },
  activityTitle: { fontSize: 10, fontWeight: "bold", marginBottom: 2 },
  activityMeta: { fontSize: 8, color: "#6B7280" },
  rtl: { textAlign: "right" },
  cover: { backgroundColor: "#1e3a5f", padding: 36, justifyContent: "flex-end" },
  coverTitle: { color: "#FFF", fontSize: 24, fontWeight: "bold", marginBottom: 8 },
  coverText: { color: "#FFF", fontSize: 11, marginBottom: 4 },
});
