import { Font, StyleSheet } from "@react-pdf/renderer";

const fontBase = typeof window !== "undefined" ? window.location.origin : "";
Font.register({
  family: "AuditCairo",
  fonts: [
    { src: `${fontBase}/fonts/Cairo-Regular.ttf` },
    { src: `${fontBase}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" },
  ],
});

export const auditStyles = StyleSheet.create({
  page: { padding: 22, fontSize: 8, color: "#111827" },
  pageAr: { fontFamily: "AuditCairo" },
  rtl: { textAlign: "right" },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 6 },
  subtitle: { fontSize: 9, color: "#4B5563", marginBottom: 8 },
  stat: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 8, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, overflow: "hidden" },
  tr: { flexDirection: "row" },
  th: { fontSize: 8, fontWeight: "bold", backgroundColor: "#F9FAFB", padding: 4, borderRightWidth: 1, borderRightColor: "#E5E7EB" },
  td: { fontSize: 7, padding: 4, borderRightWidth: 1, borderRightColor: "#E5E7EB" },
  c1: { width: "16%" },
  c2: { width: "18%" },
  c3: { width: "16%" },
  c4: { width: "18%" },
  c5: { width: "10%" },
  c6: { width: "22%", borderRightWidth: 0 },
  cover: { backgroundColor: "transparent", padding: 0, justifyContent: "flex-end" },
  coverTitle: { color: "#FFF", fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  coverText: { color: "#FFF", fontSize: 11, marginBottom: 3 },
  coverMetaBlock: {
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});
