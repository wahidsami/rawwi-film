import { Font, StyleSheet } from "@react-pdf/renderer";

const fontBase = typeof window !== "undefined" ? window.location.origin : "";

Font.register({
  family: "WorkspaceAnnotatedCairo",
  fonts: [
    { src: `${fontBase}/fonts/Cairo-Regular.ttf` },
    { src: `${fontBase}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" },
  ],
});

export const workspaceAnnotatedStyles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 22,
    fontSize: 10,
    color: "#111827",
    backgroundColor: "#FAFBFC",
  },
  pageAr: { fontFamily: "WorkspaceAnnotatedCairo" },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#D7DEE7",
    paddingBottom: 10,
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: "bold", color: "#0F172A", marginBottom: 3 },
  subtitle: { fontSize: 9, color: "#475569", marginBottom: 2 },
  layoutRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  layoutRowRtl: {
    flexDirection: "row-reverse",
  },
  contentColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "72%",
    borderWidth: 1,
    borderColor: "#D7DEE7",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  notesColumn: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "28%",
    borderWidth: 1,
    borderColor: "#F1C7C7",
    borderRadius: 10,
    backgroundColor: "#FFF7F7",
    padding: 10,
  },
  pageBody: {
    fontSize: 10,
    lineHeight: 1.8,
    color: "#111827",
    whiteSpace: "pre-wrap",
  },
  pageBodyRtl: {
    textAlign: "right",
  },
  highlighted: {
    backgroundColor: "#FDE68A",
    color: "#7F1D1D",
    borderBottomWidth: 1,
    borderBottomColor: "#DC2626",
  },
  noteColumnTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#991B1B",
    marginBottom: 8,
  },
  noteCard: {
    borderWidth: 1,
    borderColor: "#F3B2B2",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 8,
    marginBottom: 8,
  },
  noteBadge: {
    fontSize: 8,
    color: "#991B1B",
    marginBottom: 4,
    fontWeight: "bold",
  },
  noteTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 3,
  },
  noteMeta: {
    fontSize: 8,
    color: "#64748B",
    marginBottom: 3,
  },
  noteSnippet: {
    fontSize: 8,
    color: "#334155",
    lineHeight: 1.45,
  },
  emptyNotes: {
    fontSize: 8,
    color: "#64748B",
    lineHeight: 1.45,
  },
  unresolvedBlock: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#EAB308",
    borderRadius: 10,
    backgroundColor: "#FEFCE8",
    padding: 10,
  },
  unresolvedTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#854D0E",
    marginBottom: 6,
  },
  unresolvedItem: {
    fontSize: 8,
    color: "#854D0E",
    lineHeight: 1.45,
    marginBottom: 3,
  },
});
