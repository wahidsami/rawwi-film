import { Font, StyleSheet } from "@react-pdf/renderer";

const fontBase = typeof window !== "undefined" ? window.location.origin : "";
Font.register({
  family: "ClientsCairo",
  fonts: [
    { src: `${fontBase}/fonts/Cairo-Regular.ttf` },
    { src: `${fontBase}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" },
  ],
});

export const clientsStyles = StyleSheet.create({
  page: { padding: 26, fontSize: 9, color: "#111827" },
  pageAr: { fontFamily: "ClientsCairo" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  subtitle: { fontSize: 10, color: "#4B5563", marginBottom: 8 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stat: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 8 },
  statValue: { fontSize: 15, fontWeight: "bold" },
  statLabel: { fontSize: 8, color: "#4B5563" },
  table: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, overflow: "hidden" },
  tr: { flexDirection: "row" },
  th: { fontSize: 8, fontWeight: "bold", backgroundColor: "#F9FAFB", padding: 6, borderRightWidth: 1, borderRightColor: "#E5E7EB" },
  td: { fontSize: 8, padding: 6, borderRightWidth: 1, borderRightColor: "#E5E7EB" },
  col1: { width: "24%" },
  col2: { width: "16%" },
  col3: { width: "20%" },
  col4: { width: "14%" },
  col5: { width: "10%" },
  col6: { width: "16%", borderRightWidth: 0 },
  rowEven: { backgroundColor: "#FCFCFD" },
  rtl: { textAlign: "right" },
  cover: { backgroundColor: "#1e3a5f", padding: 36, justifyContent: "flex-end" },
  coverTitle: { color: "#FFF", fontSize: 24, fontWeight: "bold", marginBottom: 8 },
  coverText: { color: "#FFF", fontSize: 11, marginBottom: 4 },
});
