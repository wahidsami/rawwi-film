import { Font, StyleSheet } from "@react-pdf/renderer";

const fontBase = typeof window !== "undefined" ? window.location.origin : "";

Font.register({
  family: "AnalysisCairo",
  fonts: [
    { src: `${fontBase}/fonts/Cairo-Regular.ttf` },
    { src: `${fontBase}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" },
  ],
});

export const analysisStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#111827" },
  pageAr: { fontFamily: "AnalysisCairo" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 10, color: "#4B5563", marginBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "bold", marginTop: 12, marginBottom: 6 },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  stat: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 8 },
  statValue: { fontSize: 16, fontWeight: "bold", marginBottom: 2 },
  statLabel: { fontSize: 9, color: "#4B5563" },
  articleWrap: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 6, padding: 8, marginBottom: 8 },
  articleHeader: { fontSize: 11, fontWeight: "bold", marginBottom: 6 },
  finding: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 4, padding: 6, marginBottom: 6 },
  findingTitle: { fontSize: 10, fontWeight: "bold", marginBottom: 3 },
  findingMeta: { fontSize: 8, color: "#6B7280", marginBottom: 3 },
  findingBody: { fontSize: 9, lineHeight: 1.4 },
  rtl: { textAlign: "right" },
  cover: { backgroundColor: "transparent", padding: 0, justifyContent: "flex-end" },
  coverTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "bold", marginBottom: 8 },
  coverText: { color: "#FFFFFF", fontSize: 11, marginBottom: 4 },
  coverMetaBlock: {
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});
